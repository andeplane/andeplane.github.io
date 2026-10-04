import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IslandDef } from "../game/levels";
import type { Rng } from "../sim/rng";
import type { WorldStyle } from "./worldStyle";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { inLandmarkClearing } from "../game/landmarkLayout";

/** Shared geometry keeps a lush shoreline affordable on phones. */
export function buildIslandDetails(
  scene: Scene,
  material: StandardMaterial,
  rocks: Mesh[],
  shadows: ShadowGenerator,
  style: WorldStyle,
  pack: number,
) {
  const paint = (mesh: Mesh, hex: string) => {
    const c = Color3.FromHexString(hex);
    mesh.setVerticesData("color", Array.from({ length: mesh.getTotalVertices() },
      () => [c.r, c.g, c.b, 1]).flat());
    return mesh;
  };
  const template = (parts: Mesh[], name: string) => {
    const mesh = Mesh.MergeMeshes(parts, true, true)!;
    mesh.name = name;
    mesh.material = material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    return mesh;
  };
  const bush = template([0, 1, 2, 3, 4].map((i) => {
    const m = MeshBuilder.CreateIcoSphere("jungle canopy", { radius: 1, subdivisions: 3, flat: false }, scene);
    m.position.set(Math.sin(i * 2.4) * 0.7, 0.65 + i % 2 * 0.3, Math.cos(i * 2.4) * 0.6);
    m.scaling.set(1, 0.75, 0.9);
    return paint(m, i % 2 ? style.grassDark : style.grass);
  }), "island shrub template");

  // Curved leaves with a raised central vein, rather than flat triangles.
  const fern = template(Array.from({ length: 9 }, (_, i) => {
    const a = i * Math.PI * 2 / 9;
    const left: Vector3[] = [], middle: Vector3[] = [], right: Vector3[] = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12;
      const width = Math.sin(Math.PI * t) * 0.28;
      const centre = new Vector3(Math.sin(a) * t * 2,
        Math.sin(t * Math.PI) * 0.95 + 0.12, Math.cos(a) * t * 2);
      left.push(centre.add(new Vector3(Math.cos(a) * width, -width * 0.35, -Math.sin(a) * width)));
      middle.push(centre);
      right.push(centre.add(new Vector3(-Math.cos(a) * width, -width * 0.35, Math.sin(a) * width)));
    }
    return paint(MeshBuilder.CreateRibbon("fern frond", {
      pathArray: [left, middle, right], sideOrientation: Mesh.DOUBLESIDE,
    }, scene), i % 2 ? style.leaf : style.leafLight);
  }), "island fern template");

  const grass = template(Array.from({ length: 7 }, (_, i) => {
    const a = i * 2.4;
    const m = MeshBuilder.CreateCylinder("beach grass blade", {
      height: 1.1 + i % 3 * 0.2, diameterBottom: 0.18, diameterTop: 0,
      tessellation: 4,
    }, scene);
    m.position.set(Math.sin(a) * 0.25, 0.5, Math.cos(a) * 0.25);
    m.rotation.set(Math.sin(a) * 0.3, a, Math.cos(a) * 0.3);
    return paint(m, i % 2 ? "#7d884e" : "#9a995e");
  }), "shore grass template");

  const driftwood = template([0, 1, 2].map((i) => {
    const m = MeshBuilder.CreateCylinder("bleached driftwood branch", {
      height: 2.8 - i * 0.65, diameterBottom: 0.25, diameterTop: 0.1, tessellation: 7,
    }, scene);
    m.rotation.set(Math.PI / 2, i * 0.55, 0.1);
    m.position.set(i * 0.25, 0.2, i * 0.25);
    return paint(m, "#a09579");
  }), "driftwood template");

  // The deep has luminous mineral outcrops, distinct from the tropical coast.
  const crystal = pack === 3 ? template([0, 1, 2].map((i) => {
    const m = MeshBuilder.CreateCylinder("moonlit mineral shard", {
      height: 1.3 + i * .45, diameterBottom: .38, diameterTop: 0, tessellation: 6,
    }, scene);
    m.position.set((i - 1) * .35, .5 + i * .15, i % 2 * .22);
    m.rotation.z = (i - 1) * .25;
    return paint(m, i % 2 ? "#b3b3ed" : "#7eede0");
  }), "glowing deep crystals") : undefined;
  if (crystal) {
    const glow = new StandardMaterial("bioluminescent sea minerals", scene);
    glow.diffuseColor.set(.3, .5, .6);
    glow.emissiveColor.set(.42, .74, .8);
    glow.specularColor.set(.4, .6, .8);
    crystal.material = glow;
  }

  let serial = 0;
  return (root: TransformNode, def: IslandDef, rng: Rng,
    surface: (x: number, z: number) => number) => {
    const instance = (source: Mesh, name: string, x: number, z: number,
      sx: number, sy = sx, sz = sx, shadow = true) => {
      source.receiveShadows = true;
      const mesh = source.createInstance(`${name}-${serial++}`);
      mesh.parent = root;
      mesh.position.set(x, surface(x, z) - 0.06, z);
      mesh.scaling.set(sx, sy, sz);
      mesh.rotation.y = rng.range(0, Math.PI * 2);
      mesh.isPickable = false;
      if (shadow) shadows.addShadowCaster(mesh);
      return mesh;
    };
    const polar = (a: number, distance: number) =>
      [Math.sin(a) * def.radius * distance, Math.cos(a) * def.radius * distance] as const;
    if (crystal) for (let i = 0; i < 14; i++) {
      const [x, z] = polar(rng.range(0, Math.PI * 2), rng.range(.4, .82));
      instance(crystal, "luminous shore minerals", x, z, rng.range(.7, 1.8), undefined, undefined, false);
    }

    // A broken inland ridge gives each island a distinctive, layered silhouette.
    const ridgeAngle = rng.range(-0.55, 0.55);
    const ridgeOffset = def.props.includes("fort") ? 0.62 : 0.35;
    const ridgeCount = def.kind === "rock" ? 7 : Math.max(4, Math.round(def.radius / 5));
    for (let i = 0; i < ridgeCount; i++) {
      const t = (i / (ridgeCount - 1) - 0.5) * 1.15;
      const x = def.radius * (t * Math.cos(ridgeAngle) + ridgeOffset * Math.sin(ridgeAngle));
      const z = def.radius * (ridgeOffset * Math.cos(ridgeAngle) - t * Math.sin(ridgeAngle));
      const size = def.radius * rng.range(0.11, 0.18);
      if (inLandmarkClearing(def, x, z, size * .85)) continue;
      const m = instance(rng.pick(rocks), "island ridge", x, z, size,
        size * rng.range(1.1, 2.3), size * rng.range(0.8, 1.4));
      m.position.y += size * 0.25;
      m.rotation.z = rng.range(-0.2, 0.2);
    }
    const shoreCount = Math.min(70, Math.round(def.radius * 2));
    for (let i = 0; i < shoreCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const [x, z] = polar(a, rng.range(0.72, 0.9));
      if (Math.abs(x) < 3.5 && z < 0) continue; // Keep landing stage open.
      const size = rng.range(0.3, 1.4);
      if (inLandmarkClearing(def, x, z, size)) continue;
      const m = instance(rng.pick(rocks), "shore boulder", x, z, size * 1.4, size * 0.8, size, size > 0.8);
      m.position.y += size * 0.2;
    }
    if (def.kind !== "sand") return;
    const dense = def.props.includes("palms");
    const vegetation = Math.min(90, Math.round(def.radius * (dense ? 2.5 : 1)));
    for (let i = 0; i < vegetation; i++) {
      const [x, z] = polar(rng.range(0, Math.PI * 2), rng.range(0.33, 0.78));
      if (Math.abs(x) < 3.2 && z < 3) continue;
      if (def.props.includes("fort") && Math.hypot(x, z) < def.radius * 0.5) continue;
      if (inLandmarkClearing(def, x, z, 1.5)) continue;
      if (surface(x, z) < 1) continue;
      const source = i % 3 === 0 ? bush : fern;
      instance(source, source === bush ? "jungle shrub" : "jungle fern", x, z,
        rng.range(0.6, source === bush ? 1.8 : 1.3), undefined, undefined, source === bush);
    }
    for (let i = 0; i < 24; i++) {
      const [x, z] = polar(rng.range(0, Math.PI * 2), rng.range(0.73, 0.87));
      if (surface(x, z) < 0.3) continue;
      instance(grass, "shore grass", x, z, rng.range(0.6, 1.2), undefined, undefined, false);
    }
    for (let i = 0; i < 4; i++) {
      const [x, z] = polar(rng.range(0, Math.PI * 2), rng.range(0.72, 0.86));
      if (surface(x, z) < 0.3) continue;
      instance(driftwood, "washed up timber", x, z, rng.range(0.7, 1.3), undefined, undefined, false);
    }
    // A visible trail of stepping stones connects the dock to the pirate landmark.
    for (let i = 0; i < 14; i++) {
      const z = -def.radius * (0.82 - i * 0.044);
      instance(rng.pick(rocks), "landing path stone", rng.range(-0.8, 0.8), z,
        rng.range(0.5, 0.9), 0.12, rng.range(0.4, 0.65), false);
    }
  };
}
