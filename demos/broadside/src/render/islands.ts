import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { type ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { IslandDef } from "../game/levels";
import { Rng } from "../sim/rng";
import { buildPirateScenery } from "./pirateScenery";
import { PALETTE } from "./palette";

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

const tint = (c: Color3, rng: Rng, amount = 0.06): Color4 => {
  const j = 1 + rng.range(-amount, amount);
  return new Color4(c.r * j, c.g * j, c.b * j, 1);
};

/** Radial heightfield island with vertex colours, flat-shaded for the low-poly look. */
const buildIslandMesh = (
  scene: Scene,
  def: IslandDef,
  rng: Rng,
  material: StandardMaterial,
): Mesh => {
  const rings = 14;
  const segments = 40;
  const rock = def.kind === "rock";
  const phase = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  const peak = rock
    ? def.radius * 0.55 + 2
    : Math.min(9, 2.5 + def.radius * 0.12);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const shoreline = (a: number) =>
    1 +
    0.12 * Math.sin(3 * a + phase[0]!) +
    0.07 * Math.sin(7 * a + phase[1]!) +
    (rock ? 0.1 * Math.sin(11 * a + phase[2]!) : 0);

  const heightAt = (t: number, a: number): number => {
    if (t > 1) return 0.2 - (t - 1) * 14; // underwater skirt
    const bump = (rock ? 0.35 : 0.15) * Math.sin(5 * a + phase[2]! + t * 4);
    if (rock) return peak * Math.pow(1 - t, 0.8) * (0.8 + bump) + 0.2;
    const plateau = 1 - smooth(0.25, 1, t);
    return 0.2 + plateau * peak * (0.85 + bump);
  };

  positions.push(0, heightAt(0, 0), 0);
  colors.push(...colorFor(heightAt(0, 0)).asArray());
  for (let r = 1; r <= rings; r++) {
    const t = (r / rings) * 1.25;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const rr = def.radius * t * shoreline(a);
      const h = heightAt(t, a) + rng.range(-0.15, 0.15);
      positions.push(Math.sin(a) * rr, h, Math.cos(a) * rr);
      colors.push(...colorFor(h).asArray());
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

  function colorFor(h: number): Color4 {
    if (rock)
      return tint(h > peak * 0.5 ? PALETTE.rock : PALETTE.rockDark, rng, 0.08);
    if (h > 1.6)
      return tint(
        h > peak * 0.8 ? PALETTE.grassDark : PALETTE.grass,
        rng,
        0.08,
      );
    if (h > 0.0) return tint(PALETTE.sand, rng, 0.04);
    return tint(PALETTE.wetSand, rng, 0.05);
  }

  const mesh = new Mesh(`island-${def.pos.x}-${def.pos.z}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  VertexData.ComputeNormals(positions, indices, (data.normals = []));
  data.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
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

const buildPalmTemplate = (scene: Scene, material: StandardMaterial): Mesh => {
  const parts: Mesh[] = [];
  const path: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    path.push(new Vector3(Math.sin(t * 1.2) * 1.4, t * 9, 0));
  }
  const trunk = MeshBuilder.CreateTube(
    "trunk",
    { path, radiusFunction: (i) => 0.42 - i * 0.03, tessellation: 7 },
    scene,
  );
  paint(trunk, Color3.FromHexString("#8a6a45"));
  parts.push(trunk);
  const top = path[path.length - 1]!;
  const leaves = 7;
  for (let l = 0; l < leaves; l++) {
    const a = (l / leaves) * Math.PI * 2 + 0.3;
    const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
    const side = new Vector3(dir.z, 0, -dir.x);
    const left: Vector3[] = [];
    const right: Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const width = Math.sin(t * Math.PI) * 1.1 + 0.05;
      const centre = top
        .add(dir.scale(t * 5.5))
        .add(
          new Vector3(0, 0.6 * Math.sin(t * Math.PI * 0.8) - t * t * 3.2, 0),
        );
      left.push(
        centre.add(side.scale(width)).add(new Vector3(0, -0.25 * width, 0)),
      );
      right.push(
        centre
          .subtract(side.scale(width))
          .add(new Vector3(0, -0.25 * width, 0)),
      );
    }
    const leaf = MeshBuilder.CreateRibbon(
      "leaf",
      { pathArray: [left, right], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    paint(leaf, l % 2 === 0 ? PALETTE.grass : PALETTE.grassDark);
    parts.push(leaf);
  }
  const palm = Mesh.MergeMeshes(parts, true, true)!;
  palm.convertToFlatShadedMesh();
  palm.material = material;
  palm.name = "palm-template";
  palm.isVisible = false;
  return palm;
};

const buildRockTemplate = (
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh => {
  const rng = new Rng(seed);
  const rock = MeshBuilder.CreateIcoSphere(
    "rock",
    { radius: 1, subdivisions: 1, updatable: true },
    scene,
  );
  const pos = rock.getVerticesData("position")!;
  for (let i = 0; i < pos.length; i += 3) {
    const j = rng.range(0.75, 1.2);
    pos[i]! *= j;
    pos[i + 1]! *= j * 0.75;
    pos[i + 2]! *= j;
  }
  rock.updateVerticesData("position", pos);
  paint(rock, PALETTE.rock);
  rock.convertToFlatShadedMesh();
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
  update(time: number): void;
}

/** Build every island and its props. Returns an updater for animated bits (lighthouse). */
export const buildIslands = (
  scene: Scene,
  defs: readonly IslandDef[],
  shadows: ShadowGenerator,
  seed: number,
): IslandsView => {
  const rng = new Rng(seed);
  const vertexMat = flatMaterial(scene, "island-vertex");
  const palm = buildPalmTemplate(scene, vertexMat);
  const rocks = [
    buildRockTemplate(scene, vertexMat, seed + 1),
    buildRockTemplate(scene, vertexMat, seed + 2),
  ];
  const animators: ((time: number) => void)[] = [];

  for (const def of defs) {
    buildIslandMesh(scene, def, rng, vertexMat);
    const root = new TransformNode(`island-props-${def.pos.x}`, scene);
    root.position.set(def.pos.x, 0, def.pos.z);

    const place = (min: number, max: number) => {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(min, max) * def.radius;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      return new Vector3(x, groundHeight(def, x, z) - 0.2, z);
    };

    if (def.props.includes("palms")) {
      const count = Math.round(def.radius / 4);
      for (let i = 0; i < count; i++) {
        const p = palm.createInstance(`palm-${def.pos.x}-${i}`);
        p.parent = root;
        p.position = place(0.15, 0.7);
        p.rotation.y = rng.range(0, Math.PI * 2);
        p.scaling.setAll(rng.range(0.8, 1.2));
        shadows.addShadowCaster(p);
        animators.push((time) => {
          p.rotation.z = Math.sin(time * 0.8 + i) * 0.025;
          p.rotation.x = Math.cos(time * 0.6 + i) * 0.015;
        });
      }
    }
    if (def.props.includes("rocks") || def.kind === "rock") {
      const count = Math.round(def.radius / 3) + 2;
      for (let i = 0; i < count; i++) {
        const r = rng.pick(rocks).createInstance(`rock-${def.pos.x}-${i}`);
        r.parent = root;
        r.position = place(0.5, 1.05);
        r.position.y = rng.range(-0.4, 0.6);
        r.rotation.y = rng.range(0, Math.PI * 2);
        r.scaling.setAll(rng.range(1.2, 3.2));
        shadows.addShadowCaster(r);
      }
    }
    animators.push(
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
        buildLighthouse(scene, root, groundHeight(def, 0, 0), shadows),
      );
    if (def.props.includes("fort")) buildFort(scene, root, def, shadows);
    if (def.props.includes("wreck")) buildWreck(scene, root, shadows);
  }
  const lamps = scene.lights.filter(
    (l) => l.name === "island amber torch" || l.name === "lh-light",
  );
  return {
    update: (time) => {
      const camera = scene.activeCamera!;
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
) => {
  const white = flatMaterial(
    scene,
    "lh-white",
    Color3.FromHexString("#a7a99b"),
  );
  const red = flatMaterial(scene, "lh-red", Color3.FromHexString("#59453b"));
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
        tessellation: 14,
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
    { height: 0.5, diameter: 5.2, tessellation: 14 },
    scene,
  );
  gallery.position.y = ground + height + 0.25;
  gallery.material = dark;
  gallery.parent = parent;
  const lamp = MeshBuilder.CreateCylinder(
    "lh-lamp",
    { height: 2.4, diameter: 2.8, tessellation: 10 },
    scene,
  );
  lamp.position.y = ground + height + 1.7;
  lamp.material = glow;
  lamp.parent = parent;
  const roof = MeshBuilder.CreateCylinder(
    "lh-roof",
    { height: 2, diameterTop: 0, diameterBottom: 3.8, tessellation: 10 },
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
      { height: 5.5, diameter: 3, tessellation: 8 },
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
        { height: 3, diameterTop: 0.5, diameterBottom: 0.75, tessellation: 8 },
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
