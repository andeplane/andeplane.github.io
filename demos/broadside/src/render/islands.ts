import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { type ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { IslandDef } from "../game/levels";
import { Rng } from "../sim/rng";
import { buildPirateScenery } from "./pirateScenery";
import { PALETTE } from "./palette";
import { buildIslandDetails } from "./islandDetails";
import { islandSurface } from "./islandSurface";
import { coastPhase, coastRadius } from "./islandShape";
import { worldStyle, type WorldStyle } from "./worldStyle";
import { islandStreamingPlan } from "../game/islandStreaming";
import { wrapCoordinate } from "../sim/math";
import type { Wind } from "../sim/wind";
import { inLandmarkClearing } from "../game/landmarkLayout";
import { buildSeaLandmarks } from "./seaLandmarks";

const flatMaterial = (
  scene: Scene,
  name: string,
  color?: Color3,
  emissive?: Color3,
): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color ?? Color3.White();
  m.specularColor = new Color3(0.04, 0.04, 0.04);
  if (emissive) m.emissiveColor = emissive;
  return m;
};

/** Shared vertices and coherent contours keep light continuous across the beach. */
const buildIslandMesh = (
  scene: Scene,
  def: IslandDef,
  rng: Rng,
  material: StandardMaterial,
  style: WorldStyle,
): Mesh => {
  const rings = 36;
  const segments = 112;
  const rock = def.kind === "rock";
  const phase = [coastPhase(def), coastPhase(def) * 1.7, coastPhase(def) * .6];
  const peak = rock
    ? def.radius * 0.55 + 2
    : Math.min(9, 2.5 + def.radius * 0.12);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const sand = Color3.FromHexString(style.sand), wet = Color3.FromHexString(style.wetSand);
  const grass = Color3.FromHexString(style.grass), darkGrass = Color3.FromHexString(style.grassDark);
  const stone = Color3.FromHexString(style.rock), darkStone = Color3.FromHexString(style.rockDark);

  const shoreline = (a: number) => coastRadius(a, phase[0]!);

  const heightAt = (t: number, a: number): number => {
    if (t > 1) return 0.12 - (t - 1) * 22; // submerged sand shelf under the transparent-looking shallows
    const bump = (rock ? 0.23 : 0.12) * Math.sin(3 * a + phase[2]! + t * 4)
      * smooth(0, .28, t);
    if (rock) return peak * Math.pow(1 - t * t, 1.3) * (0.8 + bump) + 0.2;
    const plateau = 1 - smooth(0.25, 1, t);
    return 0.2 + plateau * peak * (0.85 + bump);
  };

  positions.push(0, heightAt(0, 0), 0);
  colors.push(...colorFor(heightAt(0, 0), 0, 0).asArray());
  uvs.push(0, 0);
  for (let r = 1; r <= rings; r++) {
    const t = (r / rings) * 1.25;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const rr = def.radius * t * shoreline(a);
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      const relief = Math.sin(x * .27 + phase[0]!) * Math.sin(z * .24 + phase[1]!);
      const inland = (1 - smooth(.68, .98, t)) * smooth(0, .2, t);
      const ridge = Math.sin(x * .14 + phase[0]!) * Math.cos(z * .12 - phase[1]!) * .65
        + Math.sin(x * .32 + z * .19) * .24;
      const h = heightAt(t, a) + (relief * .17 + ridge) * inland;
      positions.push(x, h, z);
      colors.push(...colorFor(h, x, z).asArray());
      uvs.push(x * .28, z * .28);
    }
  }
  for (let s = 0; s < segments; s++)
    indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments;
    const b0 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      indices.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }

  function colorFor(h: number, x: number, z: number): Color4 {
    const patch = Math.sin(x * .12 + phase[0]!) * Math.cos(z * .16 + phase[1]!);
    let color: Color3;
    if (rock) color = Color3.Lerp(darkStone, stone, smooth(.4, peak * .8, h));
    else {
      color = Color3.Lerp(wet, sand, smooth(-.6, .75, h));
      const inland = Color3.Lerp(grass, darkGrass, smooth(peak * .65, peak, h));
      color = Color3.Lerp(color, inland, smooth(.8 + patch * .3, 2.5 + patch * .4, h));
    }
    const mottling = Math.sin(x * .47 + z * .22) * Math.sin(z * .51 - x * .13);
    color.scaleInPlace(1 + patch * .055 + mottling * .025);
    return new Color4(color.r, color.g, color.b, 1);
  }

  const mesh = new Mesh(`island-${def.pos.x}-${def.pos.z}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  data.uvs = uvs;
  VertexData.ComputeNormals(positions, indices, (data.normals = []));
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.position.set(def.pos.x, 0, def.pos.z);
  mesh.receiveShadows = true;
  return mesh;
};

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Height of an island's top surface at a local offset, for placing props. */
const groundHeight = (def: IslandDef, x: number, z: number): number => {
  const t = Math.hypot(x, z) / def.radius;
  if (def.kind === "rock")
    return Math.max(
      0.3,
      (def.radius * 0.55 + 2) * Math.pow(Math.max(0, 1 - t), 0.8) * 0.8,
    );
  const peak = Math.min(9, 2.5 + def.radius * 0.12);
  return 0.2 + (1 - smooth(0.25, 1, t)) * peak * 0.85;
};

/** Three crown ages share instanced geometry, with overlapping, folded pinnae. */
const buildPalmTemplate = (scene: Scene, material: StandardMaterial, style: WorldStyle, variant: number): Mesh => {
  const parts: Mesh[] = [];
  const rng = new Rng(7103 + variant * 997);
  const height = 10 + variant * 1.1;
  const path = Array.from({ length: 23 }, (_, i) => {
    const t = i / 22;
    return new Vector3(Math.sin(t * 1.3) * (1.1 + variant * .4), t * height, Math.sin(t * 2) * .3);
  });
  const trunk = MeshBuilder.CreateTube("ringed curved palm trunk", {
    path, radiusFunction: (i) => .39 - i * .008, tessellation: 10, cap: Mesh.CAP_ALL,
  }, scene);
  const trunkColor = Color3.FromHexString(style.trunk);
  const bark: number[] = [];
  const trunkPositions = trunk.getVerticesData("position")!;
  for (let i = 0; i < trunkPositions.length; i += 3) {
    const y = trunkPositions[i + 1]!;
    const ring = .7 + .25 * smooth(-.35, .5, Math.sin(y * 10.5)) + .05 * Math.sin(y * 41);
    bark.push(trunkColor.r * ring, trunkColor.g * ring, trunkColor.b * ring, 1);
  }
  trunk.setVerticesData("color", bark);
  parts.push(trunk);
  const top = path[path.length - 1]!;
  const leafDark = Color3.Lerp(Color3.FromHexString(style.leaf), Color3.FromHexString(style.grassDark), .3).scale(.8);
  const leafLight = Color3.FromHexString(style.leafLight);
  const sunlit = Color3.Lerp(leafLight, Color3.FromHexString("#e0bc48"), .48);
  // Hanging mature fronds, a wide middle crown, and upright new growth.
  for (let l = 0; l < 13; l++) {
    const tier = l < 5 ? 0 : l < 10 ? 1 : 2;
    const a = l * 2.39996 + variant * .7 + rng.range(-.1, .1);
    const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
    const side = new Vector3(dir.z, 0, -dir.x);
    const length = (tier === 2 ? 3.6 : tier === 1 ? 6.3 : 5.5) * rng.range(.9, 1.13);
    const lift = tier === 2 ? 3.6 : tier === 1 ? 2 : .8;
    const droop = tier === 0 ? 3.4 : tier === 1 ? 1.7 : -.3;
    const centreAt = (t: number) => top.add(dir.scale(t * length)).add(new Vector3(
      0, lift * Math.sin(t * Math.PI * .72) - t * t * droop, 0,
    ));
    const brightness = .22 + (Math.sin(a - .8) * .5 + .5) * .48 + (tier === 2 ? .12 : 0);
    const color = Color3.Lerp(leafDark, sunlit, brightness);
    const spine = [[], []] as Vector3[][];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, centre = centreAt(t), width = .055 * (1 - t) + .006;
      spine[0]!.push(centre.add(side.scale(width)).add(new Vector3(0, .045, 0)));
      spine[1]!.push(centre.subtract(side.scale(width)).add(new Vector3(0, .045, 0)));
    }
    const rib = MeshBuilder.CreateRibbon("golden palm rachis", { pathArray: spine, sideOrientation: Mesh.DOUBLESIDE }, scene);
    paint(rib, Color3.Lerp(color, sunlit, .65)); parts.push(rib);
    // A narrow continuous folded blade ties the pinnae into a legible frond.
    const bladePaths = [[], [], []] as Vector3[][];
    for (let j = 0; j <= 22; j++) {
      const t = j / 22, centre = centreAt(t);
      const width = Math.sin(t * Math.PI) * .44 * (.88 + .12 * Math.sin(t * 37));
      bladePaths[0]!.push(centre.add(side.scale(width)).add(new Vector3(0, -.08, 0)));
      bladePaths[1]!.push(centre.add(new Vector3(0, .065, 0)));
      bladePaths[2]!.push(centre.subtract(side.scale(width)).add(new Vector3(0, -.1, 0)));
    }
    const foldedBlade = MeshBuilder.CreateRibbon("cohesive folded palm blade", { pathArray: bladePaths, sideOrientation: Mesh.DOUBLESIDE }, scene);
    const bladeNormals = foldedBlade.getVerticesData("normal")!;
    const bladeColors: number[] = [];
    for (let i = 0; i < foldedBlade.getTotalVertices(); i++) {
      const upper = bladeNormals[i * 3 + 1]! > 0;
      const c = upper ? color : Color3.Lerp(leafDark, color, .26);
      bladeColors.push(c.r, c.g, c.b, 1);
    }
    foldedBlade.setVerticesData("color", bladeColors); parts.push(foldedBlade);
    for (let pair = 0; pair < 11; pair++) for (const sign of [-1, 1]) {
      const t = .09 + pair * .081;
      const origin = centreAt(t);
      const span = (.35 + Math.pow(Math.sin(t * Math.PI), .7) * 1.1) * (tier === 2 ? .68 : 1);
      const blade = [[], [], []] as Vector3[][];
      for (let j = 0; j <= 5; j++) {
        const u = j / 5;
        const centre = origin.add(side.scale(sign * u * span)).add(dir.scale(u * (.18 + t * .38)))
          .add(new Vector3(0, .16 * Math.sin(u * Math.PI) - u * u * (.32 + t * .22), 0));
        const width = (.23 + .065 * Math.sin(t * Math.PI)) * Math.pow(1 - u, .72);
        blade[0]!.push(centre.add(dir.scale(width)).add(new Vector3(0, -.045, 0)));
        blade[1]!.push(centre.add(new Vector3(0, .055 * (1 - u), 0)));
        blade[2]!.push(centre.subtract(dir.scale(width)).add(new Vector3(0, -.06, 0)));
      }
      const pinna = MeshBuilder.CreateRibbon("tapered folded palm pinna", { pathArray: blade, sideOrientation: Mesh.DOUBLESIDE }, scene);
      const positions = pinna.getVerticesData("position")!, normals = pinna.getVerticesData("normal")!, colors: number[] = [];
      const highlight = Color3.Lerp(color, sunlit, .24);
      for (let i = 0; i < positions.length / 3; i++) {
        const ridge = i % 18 >= 6 && i % 18 < 12;
        const upper = normals[i * 3 + 1]! > 0;
        const c = !upper ? Color3.Lerp(leafDark, color, .22)
          : ridge ? highlight : color.scale(.9 + .05 * (pair % 3));
        colors.push(c.r, c.g, c.b, 1);
      }
      pinna.setVerticesData("color", colors); parts.push(pinna);
    }
  }
  for (let i = 0; i < 5; i++) {
    const coconut = MeshBuilder.CreateSphere("coconut", { diameter: .5, segments: 6 }, scene);
    coconut.position.copyFrom(top).addInPlace(new Vector3(Math.sin(i * 2.4) * .45, -.4, Math.cos(i * 2.4) * .45));
    paint(coconut, Color3.FromHexString("#634322")); parts.push(coconut);
  }
  const palm = Mesh.MergeMeshes(parts, true, true)!;
  palm.material = material;
  palm.name = `palm-template-${variant}`;
  palm.isVisible = false;
  palm.receiveShadows = true;
  return palm;
};

const buildRockTemplate = (
  scene: Scene,
  material: StandardMaterial,
  seed: number,
  style: WorldStyle,
): Mesh => {
  const rng = new Rng(seed);
  const phase = rng.range(0, Math.PI * 2);
  const rock = MeshBuilder.CreateIcoSphere(
    "rock",
    { radius: 1, subdivisions: 4, flat: false, updatable: true },
    scene,
  );
  const pos = rock.getVerticesData("position")!;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
    const j = .93 + .16 * Math.sin(x * 4 + phase) * Math.cos(z * 3 - phase)
      + .10 * Math.sin(y * 5 + z * 2) + .035 * Math.sin(x * 15 + y * 12 + z * 9);
    pos[i] = x * j;
    pos[i + 1] = y * j * .75;
    pos[i + 2] = z * j;
  }
  rock.updateVerticesData("position", pos);
  // Icosphere faces have duplicated edges. Weld them before recomputing normals.
  rock.forceSharedVertices();
  const roundedPositions = rock.getVerticesData("position")!;
  const uvs: number[] = [], colors: number[] = [];
  const light = Color3.FromHexString(style.rock), dark = Color3.FromHexString(style.rockDark);
  for (let i = 0; i < roundedPositions.length; i += 3) {
    const x = roundedPositions[i]!, y = roundedPositions[i + 1]!, z = roundedPositions[i + 2]!;
    const shade = .42 + y * .28 + Math.sin(x * 3 + z * 4 + phase) * .14;
    // Muted warm faces and dark weathered seams read as stone at gameplay scale.
    const c = Color3.Lerp(dark, light, shade);
    colors.push(c.r, c.g, c.b, 1);
    uvs.push(x * .5 + y * .3, z * .5 + y * .3);
  }
  rock.setVerticesData("uv", uvs);
  rock.setVerticesData("color", colors);
  rock.material = material;
  rock.isVisible = false;
  return rock;
};

function paint(mesh: Mesh, color: Color3): void {
  const count = mesh.getTotalVertices();
  const colors: number[] = [];
  for (let i = 0; i < count; i++) colors.push(color.r, color.g, color.b, 1);
  mesh.setVerticesData("color", colors);
}

export interface IslandsView {
  update(time: number, wind?: Wind, focus?: { x: number; z: number }): void;
  readonly activeCount: number;
}

/** Shared island assets; open-world scenery streams without changing its layout. */
export const buildIslands = (
  scene: Scene,
  defs: readonly IslandDef[],
  shadows: ShadowGenerator,
  seed: number,
  pack = 0,
  streamFrom?: { x: number; z: number },
  periodicBounds?: number,
): IslandsView => {
  let rng = new Rng(seed);
  const style = worldStyle(pack);
  const vertexMat = flatMaterial(scene, "island-vertex");
  const terrainMat = islandSurface(scene);
  const rockMat = islandSurface(scene, true);
  vertexMat.specularColor.set(.12, .16, .07);
  vertexMat.specularPower = 24;
  const palmTemplates = [0, 1, 2].map(variant => buildPalmTemplate(scene, vertexMat, style, variant));
  const rocks = [
    buildRockTemplate(scene, rockMat, seed + 1, style),
    buildRockTemplate(scene, rockMat, seed + 2, style),
  ];
  const details = buildIslandDetails(scene, vertexMat, rocks, shadows, style, pack);
  const landmark = defs.some(def => def.landmark) ? buildSeaLandmarks(scene, shadows, rockMat) : undefined;
  let animators: ((time: number) => void)[] = [];
  let palms: { mesh: ReturnType<Mesh["createInstance"]>; phase: number }[] = [];
  type Group = {
    meshes: Scene["meshes"]; nodes: Scene["transformNodes"]; lights: Scene["lights"];
    materials: Scene["materials"]; animators: typeof animators; palms: typeof palms; offsetX: number; offsetZ: number;
  };
  const groups = new Map<number, Group>();

  const createIsland = (index: number) => {
    const def = defs[index]!;
    // Stable props on return: a chunk's geometry cannot depend on travel order.
    if (streamFrom) rng = new Rng((seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0);
    const meshStart = scene.meshes.length, nodeStart = scene.transformNodes.length;
    const lightStart = scene.lights.length, materialStart = scene.materials.length;
    const animatorStart = animators.length, palmStart = palms.length;
    const build = () => {
      if (def.kind === "sea-rock") {
        // A visible, solid outcrop, rather than a tiny island with beach scenery.
        const root = new TransformNode(
          `sea-rock-${def.pos.x}-${def.pos.z}`,
          scene,
        );
        root.position.set(def.pos.x, 0, def.pos.z);
        for (let i = 0; i < 3; i++) {
          const rock = rocks[i % rocks.length]!.createInstance(
            `sea-rock-spire-${i}`,
          );
          rock.parent = root;
          rock.position.set(
            (i - 1) * def.radius * 0.3,
            0.5,
            (i % 2) * def.radius * 0.3,
          );
          rock.scaling.set(
            def.radius * (i === 1 ? 0.7 : 0.48),
            def.radius * (i === 1 ? 1.2 : 0.7),
            def.radius * 0.6,
          );
          rock.rotation.y = rng.range(0, Math.PI * 2);
          shadows.addShadowCaster(rock);
        }
        return;
      }
      const terrain = buildIslandMesh(scene, def, rng, terrainMat, style);
      terrain.computeWorldMatrix(true);
      const surface = (x: number, z: number) => {
        const hit = terrain.intersects(new Ray(
          new Vector3(x, 180, z),
          new Vector3(0, -1, 0),
          220,
        ));
        return hit.pickedPoint?.y ?? groundHeight(def, x, z);
      };
      const root = new TransformNode(`island-props-${def.pos.x}`, scene);
      root.position.set(def.pos.x, 0, def.pos.z);

      const place = (min: number, max: number) => {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(min, max) * def.radius;
        const x = Math.sin(a) * d;
        const z = Math.cos(a) * d;
        return new Vector3(x, surface(x, z) - 0.08, z);
      };

      if (def.props.includes("palms")) {
        const count = Math.min(29, Math.round(def.radius * (def.props.includes("fort") ? .42 : .7)));
        for (let i = 0; i < count; i++) {
          const p = palmTemplates[i % palmTemplates.length]!.createInstance(`palm-${def.pos.x}-${i}`);
          p.parent = root;
          p.position = place(0.15, 0.7);
          // Keep the landing route and the central landmark legible.
          if (Math.abs(p.position.x) < 3 && p.position.z < 2)
            p.position.x += p.position.x < 0 ? -4 : 4;
          if ((def.props.includes("fort") || def.props.includes("lighthouse")) &&
              Math.hypot(p.position.x, p.position.z) < def.radius * (def.props.includes("fort") ? 0.7 : 0.48)) {
            const a = rng.range(0, Math.PI * 2);
            const d = def.radius * (def.props.includes("fort") ? 0.78 : 0.6);
            p.position.x = Math.sin(a) * d;
            p.position.z = Math.cos(a) * d;
          }
          p.position.y = surface(p.position.x, p.position.z) - 0.08;
          for (let attempt = 0; attempt < 10 && inLandmarkClearing(def, p.position.x, p.position.z, 2.4); attempt++)
            p.position = place(.65, .84);
          if (inLandmarkClearing(def, p.position.x, p.position.z, 2.4)) { p.dispose(); continue; }
          p.rotation.y = rng.range(0, Math.PI * 2);
          const crown = rng.range(.82, 1.25);
          p.scaling.set(crown, crown * rng.range(.86, 1.3), crown);
          shadows.addShadowCaster(p);
          palms.push({ mesh: p, phase: i + def.pos.x });
        }
      }
      if (def.props.includes("rocks") || def.kind === "rock") {
        const count = Math.round(def.radius / 3) + 2;
        for (let i = 0; i < count; i++) {
          const r = rng.pick(rocks).createInstance(`rock-${def.pos.x}-${i}`);
          r.parent = root;
          r.position = place(0.5, 1.05);
          r.position.y -= 0.4;
          r.rotation.y = rng.range(0, Math.PI * 2);
          r.scaling.setAll(rng.range(1.2, 3.2));
          if (inLandmarkClearing(def, r.position.x, r.position.z, r.scaling.x)) { r.dispose(); continue; }
          shadows.addShadowCaster(r);
        }
      }
      details(root, def, rng, surface);
      if (def.landmark) animators.push(landmark!(root, def, surface));
      else animators.push(
        buildPirateScenery(
          scene,
          root,
          def,
          groundHeight(def, 0, 0),
          shadows,
          rng,
        ),
      );
      if (def.props.includes("lighthouse"))
        animators.push(
          buildLighthouse(scene, root, groundHeight(def, 0, 0), shadows, pack),
        );
      if (def.props.includes("fort")) buildFort(scene, root, def, shadows);
      if (def.props.includes("wreck")) buildWreck(scene, root, shadows);
    };
    build();
    groups.set(index, {
      meshes: scene.meshes.slice(meshStart), nodes: scene.transformNodes.slice(nodeStart),
      lights: scene.lights.slice(lightStart), materials: scene.materials.slice(materialStart),
      animators: animators.slice(animatorStart), palms: palms.slice(palmStart),
      offsetX: 0, offsetZ: 0,
    });
  };
  const active = () => new Set(groups.keys());
  const refreshAnimations = () => {
    animators = [...groups.values()].flatMap(g => g.animators);
    palms = [...groups.values()].flatMap(g => g.palms);
  };
  if (streamFrom) islandStreamingPlan(defs, streamFrom, active(), periodicBounds).load.forEach(createIsland);
  else defs.forEach((_, index) => createIsland(index));
  let lastFocus = streamFrom ? { ...streamFrom } : undefined;
  let pending: number[] = [];
  return {
    get activeCount() { return groups.size; },
    update: (time, wind, focus) => {
      if (streamFrom && focus) {
        if (!lastFocus || Math.hypot(focus.x - lastFocus.x, focus.z - lastFocus.z) > 20) {
          lastFocus = { ...focus };
          const plan = islandStreamingPlan(defs, focus, active(), periodicBounds);
          for (const index of plan.unload) {
            const group = groups.get(index)!;
            for (const mesh of group.meshes) {
              shadows.removeShadowCaster(mesh);
              if (!mesh.isDisposed()) mesh.dispose();
            }
            group.nodes.forEach(node => { if (!node.isDisposed()) node.dispose(); });
            group.lights.forEach(light => light.dispose());
            group.materials.forEach(material => material.dispose());
            groups.delete(index);
          }
          pending = plan.load;
          refreshAnimations();
        }
        // Build ahead of the visible shoreline, one island per frame.
        if (pending.length) { createIsland(pending.shift()!); refreshAnimations(); }
        if (periodicBounds) for (const [index, group] of groups) {
          const pos = defs[index]!.pos;
          const period = periodicBounds * 2;
          const ox = Math.round((focus.x + wrapCoordinate(pos.x - focus.x, periodicBounds) - pos.x) / period) * period;
          const oz = Math.round((focus.z + wrapCoordinate(pos.z - focus.z, periodicBounds) - pos.z) / period) * period;
          const dx = ox - group.offsetX, dz = oz - group.offsetZ;
          if (dx || dz) {
            for (const node of [...group.nodes, ...group.meshes]) if (!node.parent) {
              node.position.x += dx; node.position.z += dz;
            }
            group.offsetX = ox; group.offsetZ = oz;
          }
        }
      }
      const gust = Math.min(1, (wind?.drift ?? 0) / 1.5);
      const direction = wind?.direction ?? 1.3;
      for (const { mesh, phase } of palms) {
        const bend = .015 + gust * .07 + Math.sin(time * (1 + gust) + phase) * (.02 + gust * .025);
        mesh.rotation.z = -Math.sin(direction - mesh.rotation.y) * bend;
        mesh.rotation.x = Math.cos(direction - mesh.rotation.y) * bend;
      }
      const camera = scene.activeCamera!;
      const lamps = scene.lights.filter(l => l.name === "island amber torch" || l.name === "lh-light");
      const near = new Set(
        [...lamps]
          .sort(
            (a, b) =>
              Vector3.DistanceSquared(
                a.getAbsolutePosition(),
                camera.position,
              ) -
              Vector3.DistanceSquared(b.getAbsolutePosition(), camera.position),
          )
          .slice(0, 2),
      );
      lamps.forEach((l) => l.setEnabled(near.has(l)));
      animators.forEach((a) => a(time));
    },
  };
};

const buildLighthouse = (
  scene: Scene,
  parent: TransformNode,
  ground: number,
  shadows: ShadowGenerator,
  pack: number,
) => {
  const white = flatMaterial(
    scene,
    "lh-white",
    Color3.FromHexString(pack === 0 ? "#ded9bc" : "#a7a99b"),
  );
  const red = flatMaterial(scene, "lh-red", Color3.FromHexString(pack === 0 ? "#814d3b" : "#363641"));
  const dark = flatMaterial(scene, "lh-dark", Color3.FromHexString("#2b2a2e"));
  const glow = flatMaterial(
    scene,
    "lh-glow",
    Color3.FromHexString("#fff2b0"),
    Color3.FromHexString("#ffd76a"),
  );
  const segments = 6;
  const height = 18;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const seg = MeshBuilder.CreateCylinder(
      `lh-seg-${i}`,
      {
        height: height / segments,
        diameterBottom: 6 - t0 * 2.4,
        diameterTop: 6 - (t0 + 1 / segments) * 2.4,
        tessellation: 32,
      },
      scene,
    );
    seg.position.set(0, ground + (i + 0.5) * (height / segments), 0);
    seg.material = i % 2 === 0 ? white : red;
    seg.parent = parent;
    shadows.addShadowCaster(seg);
  }
  const gallery = MeshBuilder.CreateCylinder(
    "lh-gallery",
    { height: 0.5, diameter: 5.2, tessellation: 32 },
    scene,
  );
  gallery.position.y = ground + height + 0.25;
  gallery.material = dark;
  gallery.parent = parent;
  const lamp = MeshBuilder.CreateCylinder(
    "lh-lamp",
    { height: 2.4, diameter: 2.8, tessellation: 24 },
    scene,
  );
  lamp.position.y = ground + height + 1.7;
  lamp.material = glow;
  lamp.parent = parent;
  const roof = MeshBuilder.CreateCylinder(
    "lh-roof",
    { height: 2, diameterTop: 0, diameterBottom: 3.8, tessellation: 32 },
    scene,
  );
  roof.position.y = ground + height + 3.9;
  roof.material = red;
  roof.parent = parent;

  const light = new PointLight(
    "lh-light",
    new Vector3(0, ground + height + 1.7, 0),
    scene,
  );
  light.parent = parent;
  light.diffuse = Color3.FromHexString("#ffd98a");
  light.intensity = 1.2;
  light.range = 70;

  // A rotating beam of light sweeping the water.
  const beamMat = new StandardMaterial("lh-beam", scene);
  beamMat.emissiveColor = Color3.FromHexString("#ffe6a0");
  beamMat.diffuseColor = Color3.Black();
  beamMat.alpha = 0.009;
  beamMat.disableLighting = true;
  beamMat.backFaceCulling = false;
  const beamPivot = new TransformNode("lh-beam-pivot", scene);
  beamPivot.parent = parent;
  beamPivot.position.y = ground + height + 1.7;
  const beam = MeshBuilder.CreateCylinder(
    "lh-beam",
    { height: 70, diameterTop: 14, diameterBottom: 0.6, tessellation: 12 },
    scene,
  );
  beam.material = beamMat;
  beam.parent = beamPivot;
  beam.rotation.x = Math.PI / 2 + 0.12;
  beam.position.z = 35;
  beam.position.y = -4;
  beam.isPickable = false;
  return (time: number) => {
    beamPivot.rotation.y = time * 0.6;
    light.intensity = 1.0 + Math.sin(time * 3) * 0.15;
  };
};

const buildFort = (
  scene: Scene,
  parent: TransformNode,
  def: IslandDef,
  shadows: ShadowGenerator,
) => {
  const stone = flatMaterial(
    scene,
    "fort-stone",
    Color3.FromHexString("#b9ab93"),
  );
  const dark = flatMaterial(
    scene,
    "fort-dark",
    Color3.FromHexString("#3a3530"),
  );
  const flagMat = flatMaterial(
    scene,
    "fort-flag",
    Color3.FromHexString("#2a5ea8"),
  );
  flagMat.backFaceCulling = false;
  const ground = groundHeight(def, 0, 0);
  const sides = 8;
  const r = def.radius * 0.38;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const len = 2 * r * Math.sin(Math.PI / sides) + 0.6;
    const wall = MeshBuilder.CreateBox(
      `fort-wall-${i}`,
      { width: len, height: 4, depth: 1.6 },
      scene,
    );
    wall.position.set(Math.sin(a) * r, ground + 1.6, Math.cos(a) * r);
    wall.rotation.y = a;
    wall.material = stone;
    wall.parent = parent;
    shadows.addShadowCaster(wall);
    const tower = MeshBuilder.CreateCylinder(
      `fort-tower-${i}`,
      { height: 5.5, diameter: 3, tessellation: 24 },
      scene,
    );
    const ta = a + Math.PI / sides;
    const tr = r / Math.cos(Math.PI / sides);
    tower.position.set(Math.sin(ta) * tr, ground + 2.4, Math.cos(ta) * tr);
    tower.material = stone;
    tower.parent = parent;
    shadows.addShadowCaster(tower);
    if (i % 2 === 0) {
      const gun = MeshBuilder.CreateCylinder(
        `fort-gun-${i}`,
        { height: 3, diameterTop: 0.5, diameterBottom: 0.75, tessellation: 16 },
        scene,
      );
      gun.rotation.x = Math.PI / 2;
      gun.rotation.y = a;
      gun.position.set(
        Math.sin(a) * (r + 1.2),
        ground + 3.6,
        Math.cos(a) * (r + 1.2),
      );
      gun.material = dark;
      gun.parent = parent;
    }
  }
  const keep = MeshBuilder.CreateBox(
    "fort-keep",
    { width: 7, height: 6, depth: 7 },
    scene,
  );
  keep.position.y = ground + 2.6;
  keep.material = stone;
  keep.parent = parent;
  shadows.addShadowCaster(keep);
  const pole = MeshBuilder.CreateCylinder(
    "fort-pole",
    { height: 9, diameter: 0.25 },
    scene,
  );
  pole.position.y = ground + 10;
  pole.material = dark;
  pole.parent = parent;
  const flag = MeshBuilder.CreatePlane(
    "fort-flag",
    { width: 3.4, height: 2 },
    scene,
  );
  flag.position.set(1.7, ground + 13.4, 0);
  flag.material = flagMat;
  flag.parent = parent;
};

const buildWreck = (
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
) => {
  const wood = flatMaterial(scene, "wreck-wood", PALETTE.woodDark);
  const hull = MeshBuilder.CreateCylinder(
    "wreck-hull",
    { height: 14, diameter: 4.5, tessellation: 8, arc: 0.55 },
    scene,
  );
  hull.rotation.set(Math.PI / 2, 0.6, 2.2);
  hull.position.y = 0.4;
  hull.material = wood;
  hull.parent = parent;
  shadows.addShadowCaster(hull);
  const mast = MeshBuilder.CreateCylinder(
    "wreck-mast",
    { height: 10, diameter: 0.5 },
    scene,
  );
  mast.rotation.set(0.9, 0.6, 0.3);
  mast.position.set(1.5, 2.5, 1);
  mast.material = wood;
  mast.parent = parent;
  shadows.addShadowCaster(mast);
};
