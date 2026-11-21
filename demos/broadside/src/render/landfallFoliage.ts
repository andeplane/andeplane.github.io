import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Rng } from "../sim/rng";
import { foliageTiles, barkAtlas, leafAtlas } from "./landfallFoliageAtlas";

const tau = Math.PI * 2;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const color = (hex: string) => Color3.FromHexString(hex);

class Buffer {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  uvs: number[] = [];
  grid(
    rows: number,
    cols: number,
    point: (t: number, w: number) => { p: Vector3; c: Color3; u: number; v: number },
  ) {
    const start = this.positions.length / 3;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const q = point(j / rows, i / cols);
        this.positions.push(q.p.x, q.p.y, q.p.z);
        this.colors.push(q.c.r, q.c.g, q.c.b, 1);
        this.uvs.push(q.u, q.v);
        if (i < cols && j < rows) {
          const k = start + j * (cols + 1) + i;
          this.indices.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
        }
      }
  }
  mesh(scene: Scene, name: string, material: StandardMaterial, shadows: ShadowGenerator) {
    if (!this.positions.length) return;
    const mesh = new Mesh(name, scene),
      data = new VertexData();
    data.positions = this.positions;
    data.colors = this.colors;
    data.indices = this.indices;
    data.uvs = this.uvs;
    VertexData.ComputeNormals(data.positions, data.indices, (data.normals = []));
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    shadows.addShadowCaster(mesh);
    this.positions = [];
    this.colors = [];
    this.indices = [];
    this.uvs = [];
  }
}

/** The canopy, grass, bark and snow cost at most three additional draw calls for the entire island. */
export class IslandFoliage {
  private readonly foliage = new Buffer();
  private readonly wood = new Buffer();
  private readonly snow = new Buffer();
  constructor(
    private readonly scene: Scene,
    private readonly rng: Rng,
  ) {}

  private limb(
    axis: (t: number) => Vector3,
    radius: (t: number) => number,
    tone: Color3,
    repeat: number,
    sides = 10,
  ) {
    const rows = repeat > 1 ? 19 : 5;
    this.wood.grid(rows, sides, (t, u) => {
      const a = u * tau,
        r = radius(t) * (1 + 0.025 * Math.cos(a * 4 + t));
      const shade = 0.83 + 0.13 * Math.sin(t * Math.PI * 0.75) + 0.05 * Math.cos(a - 1.6);
      return { p: axis(t).add(v(Math.sin(a) * r, 0, Math.cos(a) * r)), u, v: t * repeat, c: tone.scale(shade) };
    });
  }

  /** Curved, transversely folded surface. The painted atlas supplies the silhouette
   * down to individual leaflets/needles, including the fine gaps that project shadows. */
  private spray(
    tile: number,
    axis: (t: number) => Vector3,
    side: Vector3,
    width: number,
    fall: number,
    twist: number,
    tint: Color3,
    rows = 7,
    cols = 4,
  ) {
    this.foliage.grid(rows, cols, (t, u) => {
      const w = u * 2 - 1;
      const sag = Math.pow(Math.abs(w), 1.4) * fall * (0.45 + 0.55 * Math.sin(t * Math.PI));
      const pos = axis(t)
        .add(side.scale(w * width))
        .add(v(0, w * twist * (t - 0.25) - sag, 0));
      const shade = 0.82 + 0.18 * Math.sin(t * 1.5) + 0.06 * (1 - Math.abs(w));
      return { p: pos, u: (tile + 0.004 + 0.992 * u) / 4, v: 0.004 + 0.992 * t, c: tint.scale(shade) };
    });
  }

  palm(x: number, y: number, z: number, height: number, lean: number, heading: number) {
    const rng = this.rng,
      axis = v(Math.sin(heading), 0, Math.cos(heading));
    const cross = v(axis.z, 0, -axis.x),
      bow = rng.range(-0.31, 0.31);
    const trunk = (t: number) =>
      v(x, y + t * height, z)
        .add(axis.scale(lean * t * t))
        .add(cross.scale(height * bow * t * (1 - t)));
    // One continuous tapered, ring-scarred trunk, swelling at the roots and narrowing into the crownshaft.
    this.limb(
      trunk,
      (t) => height * (0.023 + 0.014 * (1 - t) + 0.02 * Math.exp(-t * 17)),
      color("#c5b698"),
      3.25,
      12,
    );
    const crown = trunk(1),
      turn = rng.range(0, tau);
    for (let j = 0; j < 15; j++) {
      const a = turn + j * 2.39996 + rng.range(-0.21, 0.21),
        dir = v(Math.sin(a), 0, Math.cos(a)),
        side = v(dir.z, 0, -dir.x);
      const age = j / 14;
      const length = height * rng.range(0.49, 0.62) * (1 - 0.25 * age),
        spread = height * (0.08 + 0.019 * (1 - age));
      const lift = height * (0.05 + 0.23 * age),
        droop = height * (0.29 - 0.22 * age);
      const sweep = rng.range(-0.55, 0.55),
        twist = rng.range(-0.37, 0.37);
      const rachis = (t: number) =>
        crown
          .add(dir.scale(length * t))
          .add(side.scale(sweep * t * t))
          .add(v(0, 0.16 - height * 0.034 * (1 - age) + lift * Math.sin(t * Math.PI * 0.85) - droop * t * t, 0));
      const tint =
        j < 2
          ? new Color3(0.99, 0.83, 0.62)
          : new Color3(rng.range(0.91, 1.16), rng.range(0.97, 1.09), rng.range(0.8, 0.99));
      this.spray(foliageTiles.palm, rachis, side, spread, height * 0.069, twist, tint, 9, 4);
    }
  }

  fir(x: number, y: number, z: number, h: number, winter: boolean) {
    const rng = this.rng,
      angle = rng.range(0, tau),
      bendX = rng.range(-0.24, 0.24),
      bendZ = rng.range(-0.24, 0.24);
    const trunk = (t: number) => v(x + bendX * t * t, y + h * t, z + bendZ * t * t);
    this.limb(trunk, (t) => h * (0.032 * (1 - t) + 0.005), color("#968277"), 2.5, 9);
    const snowColor = color("#e3edf0"),
      rimColor = color("#a6bac9");
    for (let level = 0; level < 9; level++) {
      const tier = level / 9,
        count = Math.round(8 - tier * 4),
        where = 0.17 + tier * 0.85;
      for (let arm = 0; arm < count; arm++) {
        const a = angle + (arm * tau) / count + level * 1.82 + rng.range(-0.12, 0.12),
          dir = v(Math.sin(a), 0, Math.cos(a)),
          side = v(dir.z, 0, -dir.x);
        const radius = h * (0.26 * (1 - tier) + 0.028) * rng.range(0.84, 1.12);
        const origin = trunk(where + rng.range(-0.023, 0.023));
        const droop = radius * rng.range(0.19, 0.34),
          drift = rng.range(-0.17, 0.17);
        const axis = (t: number) =>
          origin
            .add(dir.scale(t * radius))
            .add(side.scale(radius * drift * t * t))
            .add(v(0, -droop * Math.sin(t * Math.PI * 0.72) + 0.12 * radius * t * t * t, 0));
        const width = radius * rng.range(0.24, 0.34);
        this.spray(
          foliageTiles.spruce,
          axis,
          side,
          width,
          width * 0.3,
          -drift * 0.34,
          new Color3(0.82 + tier * 0.23, 0.96 + tier * 0.07, 1.03),
          5,
          3,
        );
        if (winter && (level > 0 || arm % 3 !== 0)) {
          const cover = rng.range(0.66, 0.92),
            ripple = rng.range(0, tau);
          this.snow.grid(6, 6, (t, u) => {
            const w = u * 2 - 1,
              arc = Math.pow(Math.max(0, 1 - w * w), 0.62);
            const body = Math.pow(Math.sin(Math.PI * (0.035 + t * 0.94)), 0.7);
            const scallop = 0.92 + 0.08 * Math.sin(t * 16 + ripple + w);
            const extent = body * width * 0.9 * scallop;
            const p = axis(0.055 + t * cover).add(side.scale(w * extent));
            p.y += width * (0.025 + body * (0.035 + arc * 0.43) - Math.abs(w) * 0.16);
            const c = Color3.Lerp(rimColor, snowColor, 0.22 + 0.78 * arc);
            return { p, c, u, v: t };
          });
        }
      }
    }
  }

  hardwood(x: number, y: number, z: number, h: number, shrub: boolean) {
    const rng = this.rng,
      turn = rng.range(0, tau),
      base = v(x, y, z),
      fork = v(x + h * 0.035, y + h * 0.49, z);
    const bark = color("#93856d");
    if (!shrub)
      this.limb(
        (t) => Vector3.Lerp(base, fork, t),
        (t) => h * (0.046 - t * 0.019),
        bark,
        2.2,
      );
    const branches = shrub ? 6 : 9;
    for (let i = 0; i < branches; i++) {
      const a = turn + i * 2.39996,
        dir = v(Math.sin(a), 0, Math.cos(a));
      const reach = h * rng.range(0.18, 0.36);
      const end = v(x, y + h * (0.61 + (0.29 * i) / branches), z).add(dir.scale(reach));
      const elbow = Vector3.Lerp(shrub ? base : fork, end, 0.55).add(v(0, -h * 0.065, 0));
      if (!shrub)
        this.limb(
          (t) => Vector3.Lerp(Vector3.Lerp(fork, elbow, t), Vector3.Lerp(elbow, end, t), t),
          (t) => h * (0.023 - t * 0.019),
          bark,
          1,
          7,
        );
      for (let j = 0; j < (shrub ? 7 : 10); j++) {
        const b = a + j * 2.39996 + rng.range(-0.28, 0.28),
          f = v(Math.sin(b), 0, Math.cos(b)),
          side = v(f.z, 0, -f.x);
        const len = h * rng.range(0.2, 0.34),
          rise = h * rng.range(0.03, 0.21);
        const origin = end.add(f.scale(-len * 0.15));
        const crown = (t: number) =>
          origin
            .add(f.scale(t * len))
            .add(v(0, rise * t + 0.13 * len * Math.sin(t * Math.PI) - 0.23 * len * t * t, 0));
        this.spray(
          foliageTiles.hardwood,
          crown,
          side,
          len * 0.44,
          len * 0.17,
          rng.range(-0.12, 0.12),
          new Color3(rng.range(0.81, 1.1), rng.range(0.89, 1.07), rng.range(0.81, 0.95)),
          4,
          2,
        );
      }
    }
  }

  grass(x: number, y: number, z: number, height: number, head: number) {
    const rng = this.rng,
      base = v(x, y, z);
    for (let i = 0; i < 3; i++) {
      const a = head + (i * Math.PI) / 3 + rng.range(-0.21, 0.21),
        side = v(Math.cos(a), 0, Math.sin(a)),
        dir = v(-side.z, 0, side.x);
      const h = height * rng.range(0.7, 1.05),
        width = h * rng.range(0.36, 0.51);
      const origin = base.add(side.scale(rng.range(-0.16, 0.16))).add(dir.scale(rng.range(-0.11, 0.11)));
      const bend = rng.range(0.13, 0.31);
      const axis = (t: number) => origin.add(v(0, h * (t - 0.13 * t * t), 0)).add(dir.scale(h * bend * t * t));
      this.spray(
        foliageTiles.sedge,
        axis,
        side,
        width,
        0,
        0.04,
        new Color3(rng.range(0.79, 1.1), rng.range(0.9, 1.1), rng.range(0.73, 1)),
        3,
        2,
      );
    }
  }

  finish(shadows: ShadowGenerator) {
    if (this.foliage.positions.length) {
      const m = new StandardMaterial("sunlit cutout foliage", this.scene);
      m.diffuseTexture = leafAtlas(this.scene);
      m.transparencyMode = Material.MATERIAL_ALPHATEST;
      m.alphaCutOff = 0.33;
      m.useAlphaFromDiffuseTexture = true;
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      m.specularColor.set(0.042, 0.055, 0.03);
      m.ambientColor.set(0.16, 0.19, 0.12);
      this.foliage.mesh(this.scene, "painted island foliage", m, shadows);
    }
    if (this.wood.positions.length) {
      const m = new StandardMaterial("soft ringed bark", this.scene);
      m.diffuseTexture = barkAtlas(this.scene);
      m.specularColor.setAll(0.045);
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      this.wood.mesh(this.scene, "sculpted tree trunks", m, shadows);
    }
    if (this.snow.positions.length) {
      const m = new StandardMaterial("snow on spruce boughs", this.scene);
      m.specularColor.setAll(0.085);
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      this.snow.mesh(this.scene, "snow drifts on branches", m, shadows);
    }
  }
}
