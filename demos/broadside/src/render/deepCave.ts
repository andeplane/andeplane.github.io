import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Cavern } from "./cavern";
import { Rng } from "../sim/rng";

/** A lantern passage, a flooded vault and a side grotto, connected in the same scene. */
export function buildDeepCave(c: Cavern, s: Scene): void {
  const rng = new Rng(921),
    v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const rock = (
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => c.rock(name, v(x, y, z), v(sx, sy, sz), rng.range(0, 90));
  const glass = new StandardMaterial("deep cave amber lantern glass", s);
  glass.diffuseColor = Color3.FromHexString("#ffc562");
  glass.emissiveColor = Color3.FromHexString("#e59b32");
  // Close the old open-front diorama, leaving a small rocky entrance alcove.
  for (const x of [-13, -8, -4.8, 4.8, 8, 13])
    rock("entrance chamber wall", x, 3, -15, 3, 5, 2.8);
  for (const x of [-4, 4]) rock("entrance tunnel flank", x, 2.8, -19, 2, 4, 4);
  rock("entrance tunnel end", 0, 3, -22, 5, 5, 2);
  rock("entrance tunnel roof", 0, 5, -18, 6, 2, 6);
  rock("arch above lantern passage", 0, 7, 23, 6, 2, 4);
  for (const z of [22, 26]) {
    for (const side of [-1, 1])
      rock("lantern passage wall", side * 5.2, 3, z, 2.5, 4.7, 3.3);
    rock("lantern passage ceiling", 0, 6, z, 6, 1.8, 3.5);
  }
  // Rough ground and low vaulted ceilings throughout the new chambers.
  for (const [x, z, width, depth, height] of [
    [0, 39, 28, 26, 8],
    [16, 34.5, 16, 8, 5],
    [28, 37, 20, 26, 7],
  ]) {
    const bed = MeshBuilder.CreateGround(
      "deep fractured stone floor",
      { width: width!, height: depth!, subdivisions: 36, updatable: true },
      s,
    );
    const p = bed.getVerticesData("position")!;
    for (let j = 0; j < p.length; j += 3)
      p[j + 1] = c.floorHeight(p[j]! + x!, p[j + 2]! + z!);
    bed.updateVerticesData("position", p);
    bed.convertToFlatShadedMesh();
    bed.position.set(x!, 0, z!);
    bed.material = c.floor;
    bed.receiveShadows = true;
    bed.isPickable = false;
    const roof = MeshBuilder.CreateGround(
      "continuous deep cave roof",
      { width: width!, height: depth!, subdivisions: 24, updatable: true },
      s,
    );
    const rp = roof.getVerticesData("position")!;
    for (let j = 0; j < rp.length; j += 3)
      rp[j + 1] =
        0.35 * Math.sin(rp[j]! * 0.5) + 0.25 * Math.cos(rp[j + 2]! * 0.7);
    roof.updateVerticesData("position", rp);
    roof.convertToFlatShadedMesh();
    roof.rotation.x = Math.PI;
    roof.position.set(x!, height!, z!);
    roof.material = c.stone;
    roof.isPickable = false;
    rock(
      "deep vaulted ceiling",
      x!,
      height! + 2.8,
      z!,
      width! * 0.7,
      2.8,
      depth! * 0.7,
    );
  }
  for (const z of [30, 35, 41, 47]) {
    rock("vault west wall", -13, 3, z, 3, 5, 3.8);
    if (z !== 35) rock("vault east wall", 13, 3, z, 3, 5, 3.5);
  }
  for (const x of [-10, -5, 0, 5, 10])
    rock("vault back wall", x, 3.5, 50, 3.6, 5, 3);
  for (const x of [-10, -6, 6, 10])
    rock("vault front wall", x, 3.2, 27, 3, 5, 2);
  for (const z of [30, 35, 41, 46]) {
    rock("grotto east wall", 37, 3, z, 3.3, 5, 3.4);
    if (z !== 35) rock("grotto west wall", 20, 3, z, 2.5, 5, 3.4);
  }
  for (const x of [23, 28, 33]) {
    rock("grotto north wall", x, 3, 49, 3.5, 5, 3);
    rock("grotto south wall", x, 3, 25, 3.5, 5, 3);
  }
  for (const z of [30.5, 38.5])
    rock("smuggler tunnel side", 16, 2.5, z, 6.5, 4, 1.5);
  // Rock skins behind the sculpted outcrops close the high cracks to the outside sky.
  const seal = (
    x: number,
    z: number,
    width: number,
    depth: number,
    height = 10,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      "solid bedrock behind cave outcrops",
      { width, depth, height },
      s,
    );
    mesh.position.set(x, height / 2 - 0.5, z);
    mesh.material = c.stone;
    mesh.isPickable = false;
  };
  seal(0, 51, 29, 0.5);
  seal(-14, 39, 0.5, 26);
  seal(14, 29.8, 0.5, 5.6);
  seal(14, 44, 0.5, 15.4);
  seal(-8, 26, 11, 0.5);
  seal(8, 26, 11, 0.5);
  seal(28, 50, 21, 0.5);
  seal(28, 24, 21, 0.5);
  seal(38, 37, 0.5, 27);
  seal(19, 29, 0.5, 7.5);
  seal(19, 43, 0.5, 13.5);
  // Cool water cuts through the vault. A real plank bridge spans the two banks.
  const water = new StandardMaterial("subterranean turquoise canal", s);
  water.diffuseColor = Color3.FromHexString("#113c43");
  water.specularColor.set(0.6, 0.8, 0.85);
  water.emissiveColor.set(0.018, 0.085, 0.09);
  water.alpha = 0.88;
  const canal = MeshBuilder.CreateGround(
    "vault water channel",
    { width: 22, height: 3 },
    s,
  );
  canal.position.set(0, 0.04, 38.5);
  canal.material = water;
  canal.isPickable = false;
  for (let n = 0; n < 12; n++) {
    const plank = MeshBuilder.CreateBox(
      "weathered canal bridge plank",
      { width: 4.2, height: 0.14, depth: 0.29 },
      s,
    );
    plank.position.set(0, 0.04, 37 + n * 0.27);
    plank.rotation.y = rng.range(-0.025, 0.025);
    plank.material = c.wood;
    plank.isPickable = false;
    plank.receiveShadows = true;
  }
  for (const x of [-2.2, 2.2]) {
    for (const z of [37, 40]) {
      const post = MeshBuilder.CreateCylinder(
        "bridge rope post",
        { height: 1.3, diameter: 0.13, tessellation: 8 },
        s,
      );
      post.position.set(x, 0.5, z);
      post.material = c.wood;
      post.isPickable = false;
    }
    const rope = MeshBuilder.CreateTube(
      "bridge hand rope",
      {
        path: [v(x, 1.12, 37), v(x, 0.95, 38.5), v(x, 1.12, 40)],
        radius: 0.04,
        tessellation: 6,
      },
      s,
    );
    rope.material = c.wood;
    rope.isPickable = false;
  }
  for (const [x, z] of [
    [-3, 24],
    [3, 28],
    [-9, 32],
    [9, 44],
    [-9, 46],
    [16, 34.5],
    [24, 29],
    [33, 44],
  ]) {
    c.lantern(v(x!, 3.6, z!), glass);
    const l = new PointLight("deep lantern light", v(x!, 2.7, z!), s);
    l.diffuse = Color3.FromHexString("#ffc477");
    l.intensity = 2.6;
    l.range = 28;
    c.lamps.push(l);
  }
  // Quartz clusters light the last grotto, with no portal or flat backdrop.
  const quartz = new StandardMaterial("luminous blue cave quartz", s);
  quartz.diffuseColor = Color3.FromHexString("#5fbebc");
  quartz.emissiveColor.set(0.12, 0.4, 0.42);
  quartz.specularColor.set(0.5, 0.8, 0.8);
  for (const [x, z] of [
    [23, 29],
    [33, 43],
    [32, 29],
    [23, 44],
  ]) {
    for (let n = 0; n < 6; n++) {
      const crystal = MeshBuilder.CreateCylinder(
        "deep glowing quartz",
        {
          height: 1 + n * 0.2,
          diameterBottom: 0.5,
          diameterTop: 0,
          tessellation: 5,
        },
        s,
      );
      crystal.position.set(
        x! + rng.range(-0.8, 0.8),
        0.5 + n * 0.1,
        z! + rng.range(-0.7, 0.7),
      );
      crystal.rotation.z = rng.range(-0.45, 0.45);
      crystal.material = quartz;
      crystal.isPickable = false;
    }
    const l = new PointLight("grotto crystal glow", v(x!, 2, z!), s);
    l.diffuse = quartz.diffuseColor;
    l.intensity = 1.2;
    l.range = 12;
    c.lamps.push(l);
  }
  for (let n = 0; n < 34; n++) {
    const x = n < 22 ? rng.range(-10, 10) : rng.range(23, 34),
      z = n < 22 ? rng.range(30, 47) : rng.range(29, 46);
    const h = rng.range(0.7, 2.2);
    const tooth = MeshBuilder.CreateCylinder(
      "deep weathered stalactite",
      {
        height: h,
        diameterTop: rng.range(0.35, 0.8),
        diameterBottom: 0.015,
        tessellation: 7,
      },
      s,
    );
    tooth.position.set(x, (n < 22 ? 7.8 : 6.7) - h * 0.5, z);
    tooth.rotation.z = rng.range(-0.2, 0.2);
    tooth.material = c.stone;
    tooth.isPickable = false;
  }
  // Salvaged vessels and ornate bowls will nestle in the growing banks of coins.
  for (const [x, z] of [
    [-4, 32],
    [3, 32],
    [-3, 44],
    [3, 43],
    [27, 30],
    [28, 44],
  ]) {
    for (let n = 0; n < 3; n++) {
      const bowl = MeshBuilder.CreateSphere(
        "ancient golden vessel",
        {
          diameter: 1,
          segments: 12,
          slice: 0.6,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        s,
      );
      bowl.position.set(x! + n * 0.65, 0.4, z! + n * 0.45);
      bowl.scaling.set(1.1, 0.75, 1.1);
      bowl.material = c.gold;
      bowl.isPickable = false;
      const rim = MeshBuilder.CreateTorus(
        "engraved golden vessel rim",
        { diameter: 1.04, thickness: 0.07, tessellation: 18 },
        s,
      );
      rim.position.copyFrom(bowl.position).y += 0.33;
      rim.material = c.gold;
      rim.isPickable = false;
    }
  }
  for (let n = 0; n < 22; n++) {
    const x = rng.range(-10, 10),
      z = rng.range(30, 47);
    if (Math.abs(x) < 3 || (z > 36 && z < 41)) continue;
    rock("deep rubble", x, 0.1, z, 0.35, 0.25, 0.35);
  }
}
