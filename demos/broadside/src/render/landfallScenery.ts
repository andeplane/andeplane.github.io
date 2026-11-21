import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { coastalGroundMaterial } from "./landfallMaterials/terrain";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { CaveObstacle } from "../shared/pirate-world/input/caveWalk";
import { Rng } from "../sim/rng";
import { landfallNoise, landfallReserved, type LandfallSite } from "../game/landfall";
import { IslandFoliage } from "./landfallFoliage";
import { islandSurface } from "./islandSurface";
import { worldStyle, type WorldStyle } from "./worldStyle";

export const vec = (x: number, y: number, z: number) => new Vector3(x, y, z);
const TAU = 2 * Math.PI;
type Point = { x: number; z: number };

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** A footworn trail bends around the landmark's base into the sheltered dig clearing. */
function trailDistance(x: number, z: number, site: LandfallSite) {
  const bend = { x: site.landmark.x * 0.48, z: site.landmark.z - 2.6 };
  return Math.min(segmentDistance(x, z, site.spawn, bend), segmentDistance(x, z, bend, site.dig));
}

export function terrainStyle(world: number, biome: LandfallSite["settings"]["biome"]): WorldStyle {
  const s = worldStyle(world);
  switch (biome) {
    case "winter":
      return {
        ...s,
        grass: "#c8d9df",
        grassDark: "#a8c1ca",
        wetSand: "#839fa9",
        sand: "#dbe5e4",
        leaf: "#2e615d",
        leafLight: "#689286",
        rock: "#81949c",
        rockDark: "#566d79",
        sky: "#b5d2e2",
        sun: "#fff0ce",
        deepWater: "#17435d",
        shallowWater: "#69adba",
        fog: "#90acbb",
      };
    case "alpine":
      return {
        ...s,
        grass: "#9aab77",
        grassDark: "#6e846a",
        sand: "#cfbf9b",
        rock: "#89918b",
        leaf: "#315949",
        leafLight: "#628065",
        deepWater: "#174653",
        shallowWater: "#66a7a5",
      };
    case "temperate":
      return { ...s, grass: "#829c63", grassDark: "#587d56", leaf: "#386748", leafLight: "#87a85e" };
    case "tropical":
      return s;
  }
}

export class IslandScenery {
  readonly obstacles: CaveObstacle[] = [];
  readonly rng: Rng;
  readonly style: WorldStyle;
  readonly stone: StandardMaterial;
  readonly matte: StandardMaterial;
  readonly glow: StandardMaterial;
  private readonly foliage: IslandFoliage;
  private parts = new Map<StandardMaterial, Mesh[]>();
  private leaves: number[] = [];
  private leafColors: number[] = [];
  constructor(
    readonly scene: Scene,
    readonly world: number,
    readonly site: LandfallSite,
    readonly seed: number,
    private shadows: ShadowGenerator,
    readonly floor: (x: number, z: number) => number,
  ) {
    this.style = terrainStyle(world, site.settings.biome);
    this.rng = new Rng(seed ^ (8139 + world * 10979));
    this.foliage = new IslandFoliage(scene, new Rng(seed ^ (world * 7013 + 4267)));
    this.stone = islandSurface(scene, true);
    this.matte = new StandardMaterial("paint, timber and leaves", scene);
    this.matte.backFaceCulling = false;
    this.matte.twoSidedLighting = true;
    this.matte.specularColor.setAll(0.045);
    this.glow = new StandardMaterial("mineral light", scene);
    this.glow.emissiveColor.set(0.75, 0.75, 0.75);
    this.glow.linkEmissiveWithDiffuse = true;
    this.glow.specularColor.setAll(0.15);
  }
  fertility(x: number, z: number) {
    return (
      0.52 +
      0.34 * landfallNoise(this.seed ^ 773, x * 0.095, z * 0.095) +
      0.14 * landfallNoise(this.seed ^ 141, x * 0.24, z * 0.24)
    );
  }
  solid(x: number, z: number, rx: number, rz: number, height: number) {
    this.obstacles.push({ x, z, rx, rz, top: this.floor(x, z) + height });
  }
  private paint(mesh: Mesh, hex: string, m: StandardMaterial) {
    const c = Color3.FromHexString(hex);
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
      colors[i + 3] = 1;
    }
    mesh.setVerticesData("color", colors);
    mesh.material = m;
    if (!this.parts.has(m)) this.parts.set(m, []);
    this.parts.get(m)!.push(mesh);
    return mesh;
  }
  pole(
    name: string,
    a: Vector3,
    b: Vector3,
    bottom: number,
    top: number,
    color: string,
    sides = 9,
    m = this.matte,
  ) {
    const direction = b.subtract(a);
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { height: direction.length(), diameterBottom: bottom, diameterTop: top, tessellation: sides },
      this.scene,
    );
    mesh.position.copyFrom(a.add(b).scale(0.5));
    direction.normalize();
    mesh.rotation.set(Math.acos(Math.max(-1, Math.min(1, direction.y))), Math.atan2(direction.x, direction.z), 0);
    return this.paint(mesh, color, m);
  }
  stoneBlock(
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    m = this.stone,
  ) {
    const block = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, this.scene);
    block.position.set(x, y, z);
    return this.paint(block, color, m);
  }
  boulder(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, m = this.stone) {
    const geological = m === this.stone;
    const rock = MeshBuilder.CreateSphere(
      "weathered coastal boulder",
      { diameter: 2, segments: sx > 0.5 ? 12 : 6 },
      this.scene,
    );
    const pos = rock.getVerticesData("position")!,
      normals: number[] = [];
    const phase = this.rng.range(0, 100),
      tone = Color3.FromHexString(color);
    const tints: number[] = [],
      moss = Color3.FromHexString(this.style.grassDark),
      salt = Color3.FromHexString("#d2c5a9");
    for (let i = 0; i < pos.length; i += 3) {
      const xx = pos[i]!,
        yy = pos[i + 1]!,
        zz = pos[i + 2]!;
      // Softly squared shoulders and weathered bedding, continuous through the UV seam.
      const weather = landfallNoise(this.seed + 67, phase + xx * 1.29 + yy * 0.43, zz * 1.36 - yy * 0.82);
      const fluting = landfallNoise(this.seed + 371, phase + xx * 2.2, yy * 2.6 + zz * 0.85);
      const rounded = (value: number, power: number) => Math.sign(value) * Math.pow(Math.abs(value), power);
      pos[i] = rounded(xx, 0.78) * (1 + weather * 0.13) + 0.055 * yy;
      pos[i + 1] = rounded(yy, 0.8) * (1 + weather * 0.102 + fluting * 0.043) - 0.075 * xx;
      pos[i + 2] = rounded(zz, 0.77) * (1 + weather * 0.14) + 0.05 * yy;
      const band = 0.5 + 0.5 * Math.sin(yy * 10.7 + xx * 2.4 + weather * 2.2 + phase);
      const c = geological ? Color3.Lerp(tone, salt, 0.09 + 0.13 * band + 0.07 * weather) : tone.clone();
      if (geological && sx > 0.6 && this.site.settings.biome !== "winter") {
        const patch = Math.max(0, Math.min(0.42, (yy - 0.13) * 0.38 + weather * 0.3));
        Color3.LerpToRef(c, moss, patch, c);
      }
      if (geological && this.site.settings.biome === "winter") {
        const cap = Math.max(0, Math.min(0.91, (yy - 0.46 + weather * 0.11) * 2.2));
        Color3.LerpToRef(c, Color3.FromHexString("#e2eaf0"), cap, c);
      }
      const shade = geological ? 0.78 + 0.17 * (yy + 0.8) * 0.6 + 0.08 * weather + 0.055 * band : 1;
      tints.push(c.r * shade, c.g * shade, c.b * shade, 1);
    }
    VertexData.ComputeNormals(pos, rock.getIndices()!, normals);
    rock.setVerticesData("position", pos);
    rock.setVerticesData("normal", normals);
    rock.position.set(x, y, z);
    rock.scaling.set(sx, sy, sz);
    rock.rotation.y = phase;
    this.paint(rock, color, m);
    rock.setVerticesData("color", tints);
    return rock;
  }
  triangle(a: Vector3, b: Vector3, c: Vector3, hex: string) {
    const color = Color3.FromHexString(hex);
    for (const v of [a, b, c]) {
      this.leaves.push(v.x, v.y, v.z);
      this.leafColors.push(color.r, color.g, color.b, 1);
    }
  }
  terrain() {
    const ground = MeshBuilder.CreateGround(
      "island-0-0",
      { width: 96, height: 96, subdivisions: 128 },
      this.scene,
    );
    const pos = ground.getVerticesData("position")!,
      colors: number[] = [],
      normals: number[] = [],
      coverWeights: number[] = [];
    const style = this.style,
      sand = Color3.FromHexString(style.sand),
      grass = Color3.FromHexString(style.grass);
    const dark = Color3.FromHexString(style.grassDark),
      wet = Color3.FromHexString(style.wetSand);
    const rock = Color3.FromHexString(style.rock),
      snow = Color3.FromHexString("#e4edf2");
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] = this.floor(pos[i]!, pos[i + 2]!);
    VertexData.ComputeNormals(pos, ground.getIndices()!, normals);
    const darkStone = Color3.FromHexString(style.rockDark);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!,
        z = pos[i + 2]!,
        y = pos[i + 1]!,
        d = trailDistance(x, z, this.site);
      const grain = this.fertility(x, z) - 0.5;
      const canopy = Color3.Lerp(grass, dark, clamp(0.42 + grain * 1.16));
      const beach = Color3.Lerp(wet, sand, clamp((y - 0.12) * 2));
      const crest = Math.max(0, y - 3.5);
      const beachLimit = 0.44 + this.site.settings.beach * 2.65;
      const vegetation = clamp((y - beachLimit + grain * 0.55) * 1.4) * clamp((d - 1.05 + grain) * 0.83);
      const up = Math.abs(normals[i + 1]!);
      // Colluvium gathers at the foot of escarpments, then the bedrock breaks
      // through on exposed inclines. Keep the soft sand path clear on the flats.
      const pitch = clamp((0.92 - up + grain * 0.10) * 4.1);
      const bedrock = Math.max(
        vegetation * clamp((crest - 2.3 - grain * 2) * 0.23),
        pitch * clamp((y - 0.6) * 0.75),
      );
      const bed = 0.64 + 0.2 * landfallNoise(this.seed ^ 295, x * 0.18, z * 0.18)
        + 0.13 * Math.sin(y * 1.59 + x * 0.29 + grain * 5.7);
      const stoneFace = Color3.Lerp(darkStone, rock, clamp(bed));
      const { biome } = this.site.settings;
      const frost = biome === "winter" ? clamp((y - 0.33 + grain * 0.5) * 1.7)
        : biome === "alpine" ? clamp((y - 7.6 + grain) * 0.39) : 0;
      const drift = frost * (1 - pitch) * clamp(0.96 + grain * 0.12);
      const bare = 1 - drift;
      const sandWeight = bare * (1 - bedrock) * (1 - vegetation);
      const turfWeight = bare * (1 - bedrock) * vegetation;
      const rockWeight = bare * bedrock;
      coverWeights.push(sandWeight, turfWeight, rockWeight, drift);
      const palette = beach.scale(sandWeight).addInPlace(canopy.scale(turfWeight))
        .addInPlace(stoneFace.scale(rockWeight)).addInPlace(snow.scale(drift));
      colors.push(palette.r, palette.g, palette.b, 1);
    }
    ground.setVerticesData("position", pos);
    ground.setVerticesData("normal", normals);
    ground.setVerticesData("color", colors);
    ground.setVerticesData("groundCover", coverWeights, false, 4);
    ground.material = coastalGroundMaterial(this.scene);
    ground.receiveShadows = true;
    ground.isPickable = false;
  }
  populate() {
    const style = this.style,
      rng = this.rng,
      { site } = this;
    for (let i = 0; i < 248; i++) {
      const x = rng.range(-33, 33),
        z = rng.range(-29, 29),
        y = this.floor(x, z),
        d = trailDistance(x, z, site);
      if (
        landfallReserved(site, x, z) ||
        y < 0.45 ||
        d < 4.2 ||
        Math.hypot(x - site.landmark.x, z - site.landmark.z) < 5 ||
        Math.hypot(x - site.dig.x, z - site.dig.z) < 4
      )
        continue;
      const fertility = this.fertility(x, z);
      const lushness = site.settings.vegetation;
      if (
        i < Math.round(150 * lushness) &&
        fertility > 0.6 - lushness * 0.18 &&
        y < 10.2 &&
        y > 0.52 + site.settings.beach * 0.85
      ) {
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6)) continue;
        const habitat = site.settings.biome;
        if (i % 4 === 0 && habitat !== "winter")
          this.foliage.hardwood(x, y - 0.055, z, rng.range(0.7, 1.38), true);
        else if (habitat === "tropical") {
          const height = rng.range(4.8, 8.6);
          this.foliage.palm(x, y - 0.18, z, height, rng.range(0.58, 2.3), rng.range(0, TAU));
          this.solid(x, z, 0.29, 0.29, height);
        } else {
          const height = rng.range(3.8, 7.6);
          if (habitat === "temperate") this.foliage.hardwood(x, y - 0.13, z, height, false);
          else this.foliage.fir(x, y - 0.13, z, height, habitat === "winter");
          this.solid(x, z, 0.27, 0.27, height);
        }
      } else if (i % 3 === 0 && fertility < 0.5) {
        const size = rng.range(0.65, 2.3);
        this.boulder(
          x,
          y - 0.2,
          z,
          size,
          size * rng.range(0.6, 1.5),
          size * 0.76,
          i % 2 ? style.rock : style.rockDark,
        );
        this.solid(x, z, size * 0.8, size * 0.61, size * 1.1);
      }
    }
    // Low growth stays in small, uneven colonies between clearings.
    for (let i = 0; i < Math.round(1580 * site.settings.vegetation); i++) {
      const x = rng.range(-34, 34),
        z = rng.range(-30, 30),
        y = this.floor(x, z);
      if (
        landfallReserved(site, x, z) ||
        this.fertility(x, z) < 0.43 ||
        y < 0.52 + site.settings.beach * 0.86 ||
        y > 9.3 ||
        trailDistance(x, z, site) < 2 ||
        Math.hypot(x - site.dig.x, z - site.dig.z) < 2.2
      )
        continue;
      this.foliage.grass(x, y - 0.025, z, rng.range(0.18, 0.65), i * 2.39996);
    }
    // Broken headlands on one part of the horizon leave open water elsewhere.
    const horizonAngle = rng.range(0, TAU);
    for (let i = 0; i < 3; i++)
      this.headland(
        horizonAngle + [0, 0.72, 3.18][i]! + rng.range(-0.23, 0.23),
        rng.range(172, 254),
        rng.range(22, 58),
        rng.range(6, 14),
        rng.range(8, 17),
        i,
      );
  }
  private headland(angle: number, distance: number, length: number, width: number, height: number, index: number) {
    const scene = this.scene,
      key = this.seed ^ (619 + index * 203);
    const dir = vec(Math.cos(angle), 0, -Math.sin(angle));
    const across = vec(Math.sin(angle), 0, Math.cos(angle));
    const origin = across.scale(distance);
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const nx = 34,
      nz = 12;
    const rock = Color3.FromHexString(this.style.rockDark),
      ridge = Color3.FromHexString(this.style.grassDark);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = (i / nx) * 2 - 1,
          v = (j / nz) * 2 - 1;
        const base = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
        const hill = 0.58 + 0.28 * landfallNoise(key, u * 4, v * 0.8) + 0.14 * landfallNoise(key, u * 8, v * 2.6);
        const h = -1.3 + height * Math.pow(base, 0.8) * hill;
        const p = origin
          .add(dir.scale(u * length))
          .add(across.scale(v * width + width * 0.36 * Math.sin(u * 3.1)));
        positions.push(p.x, h, p.z);
        const color = Color3.Lerp(rock, ridge, Math.max(0, Math.min(1, (h / height) * 2.6)));
        colors.push(color.r, color.g, color.b, 1);
        if (i < nx && j < nz) {
          const n = i + j * (nx + 1);
          indices.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1);
        }
      }
    const mesh = new Mesh("distant island ridge", scene),
      data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.colors = colors;
    VertexData.ComputeNormals(positions, indices, (data.normals = []));
    data.applyToMesh(mesh);
    mesh.material = this.matte;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
  }
  finish() {
    this.foliage.finish(this.shadows);
    if (this.leaves.length) {
      const mesh = new Mesh("island leaf folds", this.scene),
        data = new VertexData();
      data.positions = this.leaves;
      data.colors = this.leafColors;
      data.indices = Array.from({ length: this.leaves.length / 3 }, (_, i) => i);
      VertexData.ComputeNormals(data.positions, data.indices, (data.normals = []));
      data.applyToMesh(mesh);
      mesh.material = this.matte;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      this.shadows.addShadowCaster(mesh);
    }
    for (const [material, parts] of this.parts) {
      const merged = Mesh.MergeMeshes(parts, true, true);
      if (!merged) continue;
      merged.name = "landfall " + material.name;
      merged.isPickable = false;
      merged.receiveShadows = true;
      merged.freezeWorldMatrix();
      this.shadows.addShadowCaster(merged);
    }
    this.parts.clear();
    this.leaves = [];
    this.leafColors = [];
  }
}
