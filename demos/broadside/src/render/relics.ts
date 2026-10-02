import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { RELICS } from "../game/voyage";

/** Sculpted, lit 3D keepsakes: no flat artwork or emoji stand-ins. */
export function buildRelic(
  scene: Scene,
  index: number,
  locked = false,
): TransformNode {
  const root = new TransformNode(`relic-${index}`, scene),
    relic = RELICS[index]!;
  const mat = (name: string, hex: string, glow = 0, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(locked ? "#40586b" : hex).scale(0.8);
    m.specularColor = Color3.FromHexString(locked ? "#101924" : "#7b796e");
    m.specularPower = 80;
    m.maxSimultaneousLights = 6;
    m.emissiveColor = m.diffuseColor.scale(locked ? 0.03 : glow * 0.65);
    m.alpha = locked ? 0.28 : alpha;
    return m;
  };
  const silver = mat("moon silver", "#ccdce7", 0.08);
  const gold = mat("polished ancient gold", "#edb756", 0.12),
    jewel = mat("luminous relic", relic.color, 0.45),
    dark = mat("carved teak", "#553c40"),
    glass = mat("sea glass", "#8addf2", 0.03, 0.12),
    cream = mat("ivory", "#fff0d1");
  const mesh = (
    shape: "sphere" | "cylinder" | "box" | "torus",
    opts: object,
    m: StandardMaterial,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const b =
      shape === "sphere"
        ? MeshBuilder.CreateSphere("relic detail", opts, scene)
        : shape === "cylinder"
          ? MeshBuilder.CreateCylinder("relic detail", opts, scene)
          : shape === "torus"
            ? MeshBuilder.CreateTorus("relic detail", opts, scene)
            : MeshBuilder.CreateBox("relic detail", opts, scene);
    b.parent = root;
    b.position.set(x, y, z);
    b.material = m;
    if (
      shape === "cylinder" &&
      "tessellation" in opts &&
      Number(opts.tessellation) <= 8
    )
      b.convertToFlatShadedMesh();
    return b;
  };
  const sphere = (d: number, m: StandardMaterial, x = 0, y = 0, z = 0) =>
    mesh("sphere", { diameter: d, segments: 24 }, m, x, y, z);
  const cyl = (h: number, d: number, m: StandardMaterial, y = 0) =>
    mesh("cylinder", { height: h, diameter: d, tessellation: 48 }, m, 0, y);
  const ring = (d: number, m: StandardMaterial, y = 0) =>
    mesh("torus", { diameter: d, thickness: 0.09, tessellation: 48 }, m, 0, y);
  switch (relic.kind as string) {
    case "gold":
    case "coins": {
      const metal = relic.kind === "gold" ? gold : silver;
      for (let i = 0; i < 22; i++) {
        const a = i * 2.4,
          radius = i < 12 ? 0.8 : 0.5;
        const coin = mesh(
          "cylinder",
          { height: 0.11, diameter: 0.55, tessellation: 48 },
          metal,
          Math.sin(a) * radius,
          -0.45 + Math.floor(i / 6) * 0.12,
          Math.cos(a) * radius,
        );
        coin.rotation.set(Math.sin(i) * 0.12, a, Math.cos(i) * 0.1);
        const stamp = mesh(
          "torus",
          { diameter: 0.38, thickness: 0.025, tessellation: 32 },
          metal,
        );
        stamp.parent = coin;
        stamp.position.set(0, 0.062, 0);
      }
      if (relic.kind === "gold") {
        for (let i = 0; i < 3; i++) {
          const bar = mesh(
            "cylinder",
            {
              height: 0.4,
              diameterTop: 0.8,
              diameterBottom: 1.1,
              tessellation: 4,
            },
            gold,
            (i - 1) * 0.68,
            0.03 + (i === 1 ? 0.4 : 0),
            0.1,
          );
          bar.rotation.y = Math.PI / 4;
          bar.scaling.set(0.78, 1, 1.75);
        }
      } else {
        const coin = mesh(
          "cylinder",
          { height: 0.18, diameter: 1.55, tessellation: 64 },
          silver,
          0,
          0.55,
          0,
        );
        coin.rotation.x = 1.05;
        const rim = ring(1.38, gold);
        rim.parent = coin;
        rim.position.set(0, 0.11, 0);
        const moon = sphere(0.6, jewel);
        moon.parent = coin;
        moon.position.set(0, 0.15, 0);
        moon.scaling.y = 0.16;
        for (let i = 0; i < 8; i++) {
          const star = sphere(0.065, gold);
          star.parent = coin;
          star.position.set(
            Math.sin((i * Math.PI) / 4) * 0.52,
            0.14,
            Math.cos((i * Math.PI) / 4) * 0.52,
          );
        }
      }
      break;
    }
    case "ring": {
      const band = mesh(
        "torus",
        { diameter: 1.85, thickness: 0.23, tessellation: 64 },
        gold,
        0,
        0.05,
      );
      band.rotation.x = Math.PI / 2;
      mesh(
        "cylinder",
        { height: 0.65, diameterTop: 0.45, diameterBottom: 1, tessellation: 8 },
        jewel,
        0,
        1.02,
      );
      mesh(
        "cylinder",
        { height: 0.4, diameterTop: 1, diameterBottom: 0, tessellation: 8 },
        jewel,
        0,
        0.5,
      );
      for (const x of [-0.4, 0.4])
        mesh(
          "box",
          { width: 0.065, height: 0.55, depth: 0.065 },
          gold,
          x,
          0.73,
        );
      break;
    }
    case "pearl": {
      sphere(1.6, jewel, 0, 0.65);
      ring(2.15, gold, -0.1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const petal = sphere(
          0.9,
          cream,
          Math.sin(a) * 0.75,
          -0.2,
          Math.cos(a) * 0.75,
        );
        petal.scaling.set(0.7, 0.3, 1.4);
        petal.rotation.y = a;
      }
      break;
    }
    case "gem": {
      // A brilliant-cut crown and pointed pavilion share the same girdle.
      mesh(
        "cylinder",
        { height: 0.6, diameterTop: 0.95, diameterBottom: 2, tessellation: 8 },
        jewel,
        0,
        0.65,
      );
      mesh(
        "cylinder",
        { height: 1.15, diameterTop: 2, diameterBottom: 0, tessellation: 8 },
        jewel,
        0,
        -0.225,
      );
      ring(2.05, gold, 0.35);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const prong = mesh(
          "box",
          { width: 0.09, height: 0.5, depth: 0.09 },
          gold,
          Math.sin(a) * 0.96,
          0.36,
          Math.cos(a) * 0.96,
        );
        prong.rotation.z = Math.cos(a) * 0.15;
      }
      break;
    }
    case "compass": {
      cyl(0.32, 2.4, gold);
      cyl(0.35, 2.05, dark, 0.03);
      ring(2.15, gold, 0.25);
      const face = cyl(0.1, 1.85, cream, 0.22);
      face.rotation.y = 0.3;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const tick = mesh(
          "box",
          { width: 0.05, height: 0.06, depth: i % 2 ? 0.15 : 0.3 },
          gold,
          Math.sin(a) * 0.75,
          0.31,
          Math.cos(a) * 0.75,
        );
        tick.rotation.y = a;
      }
      const n = mesh(
        "cylinder",
        { height: 0.9, diameterTop: 0, diameterBottom: 0.3, tessellation: 3 },
        jewel,
        0,
        0.39,
        0.35,
      );
      n.rotation.x = Math.PI / 2;
      sphere(0.17, gold, 0, 0.4);
      root.rotation.x = 0.6;
      break;
    }
    case "shell": {
      for (let i = 0; i < 11; i++) {
        const a = (i / 10 - 0.5) * Math.PI;
        const rib = sphere(
          0.65,
          i % 2 ? cream : jewel,
          Math.sin(a) * 0.9,
          Math.cos(a) * 0.6,
          0,
        );
        rib.scaling.set(0.55, 2.7, 0.65);
        rib.rotation.z = -a;
      }
      sphere(0.7, gold, 0, -0.6);
      break;
    }
    case "crown": {
      cyl(0.65, 2.2, gold, -0.2);
      ring(2.3, gold, -0.5);
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7;
        mesh(
          "cylinder",
          { height: 1.1, diameterTop: 0, diameterBottom: 0.7, tessellation: 3 },
          gold,
          Math.sin(a) * 0.9,
          0.55,
          Math.cos(a) * 0.9,
        );
        sphere(0.24, jewel, Math.sin(a) * 0.9, 1.12, Math.cos(a) * 0.9);
      }
      sphere(0.32, jewel, 0, 0, -1.1);
      break;
    }
    case "lantern": {
      cyl(0.22, 1.65, gold, -0.65);
      cyl(0.22, 1.65, gold, 0.8);
      mesh(
        "cylinder",
        {
          height: 0.45,
          diameterTop: 0.5,
          diameterBottom: 1.6,
          tessellation: 8,
        },
        gold,
        0,
        1.05,
      );
      cyl(1.3, 1.35, glass, 0.1);
      sphere(0.75, jewel, 0, 0.1);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        mesh(
          "box",
          { width: 0.09, height: 1.5, depth: 0.09 },
          gold,
          Math.sin(a) * 0.65,
          0.1,
          Math.cos(a) * 0.65,
        );
      }
      const handle = ring(0.65, gold, 1.5);
      handle.rotation.x = Math.PI / 2;
      break;
    }
    case "hourglass": {
      cyl(0.2, 1.65, gold, 1);
      cyl(0.2, 1.65, gold, -1);
      for (const sign of [-1, 1]) {
        mesh(
          "cylinder",
          {
            height: 1,
            diameterTop: sign > 0 ? 1.25 : 0.12,
            diameterBottom: sign > 0 ? 0.12 : 1.25,
            tessellation: 32,
          },
          glass,
          0,
          sign * 0.5,
        );
        mesh(
          "cylinder",
          {
            height: 0.6,
            diameterTop: sign > 0 ? 0.9 : 0,
            diameterBottom: sign > 0 ? 0 : 1,
            tessellation: 32,
          },
          jewel,
          0,
          sign * 0.45,
        );
      }
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3;
        mesh(
          "box",
          { height: 2, width: 0.1, depth: 0.1 },
          gold,
          Math.sin(a) * 0.7,
          0,
          Math.cos(a) * 0.7,
        );
      }
      break;
    }
    case "egg": {
      const egg = sphere(1.7, jewel, 0, 0.25);
      egg.scaling.set(1, 1.4, 1);
      for (let i = 0; i < 5; i++) {
        const b = ring(1.7 - 0.13 * Math.abs(i - 2), gold, -0.45 + i * 0.36);
        b.rotation.z = 0.2;
      }
      sphere(0.27, cream, -0.35, 0.5, -0.8);
      sphere(0.27, cream, 0.35, 0.5, -0.8);
      break;
    }
    case "turtle": {
      const body = sphere(1.85, jewel, 0, 0.05);
      body.scaling.set(1, 0.6, 1.1);
      const head = sphere(0.7, jewel, 0, -0.08, -1.25);
      head.scaling.z = 1.25;
      for (const x of [-1, 1])
        for (const z of [-0.7, 0.7]) {
          const fin = sphere(0.7, gold, x, -0.15, z);
          fin.scaling.set(1.3, 0.22, 0.7);
          fin.rotation.y = x * z;
        }
      for (const x of [-0.23, 0.23]) {
        sphere(0.14, cream, x, 0.1, -1.52);
        sphere(0.07, dark, x, 0.1, -1.59);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        sphere(0.28, gold, Math.sin(a) * 0.55, 0.5, Math.cos(a) * 0.6);
      }
      break;
    }
    case "ship": {
      const bottle = sphere(1.85, glass);
      bottle.scaling.set(1.6, 1, 0.85);
      const neck = mesh(
        "cylinder",
        { height: 0.7, diameter: 0.6, tessellation: 32 },
        glass,
        1.7,
      );
      neck.rotation.z = Math.PI / 2;
      const hull = sphere(1.3, dark, -0.15, -0.4);
      hull.scaling.set(1.7, 0.3, 0.6);
      mesh("box", { width: 1.9, height: 0.1, depth: 0.65 }, gold, -0.15, -0.2);
      for (const x of [-0.7, -0.05, 0.55]) {
        mesh(
          "box",
          { width: 0.045, height: 1.12, depth: 0.045 },
          dark,
          x,
          0.36,
        );
        mesh("box", { width: 0.62, height: 0.04, depth: 0.04 }, dark, x, 0.72);
        const sail = MeshBuilder.CreateRibbon(
          "tiny billowing sail",
          {
            pathArray: Array.from({ length: 4 }, (_, j) => [
              new Vector3(
                x - 0.28,
                0.1 + j * 0.2,
                0.05 + Math.sin((j / 3) * Math.PI) * 0.1,
              ),
              new Vector3(
                x + 0.28,
                0.1 + j * 0.2,
                0.05 + Math.sin((j / 3) * Math.PI) * 0.1,
              ),
            ]),
            sideOrientation: 2,
          },
          scene,
        );
        sail.parent = root;
        sail.material = cream;
      }
      const cork = mesh(
        "cylinder",
        { height: 0.3, diameter: 0.63, tessellation: 24 },
        dark,
        2.1,
      );
      cork.rotation.z = Math.PI / 2;
      const neckRing = ring(0.66, gold);
      neckRing.position.set(1.93, 0, 0);
      neckRing.rotation.z = Math.PI / 2;
      for (const x of [-0.8, 0.8])
        mesh("box", { width: 0.28, height: 0.2, depth: 1.1 }, dark, x, -0.93);
      break;
    }
    case "orb": {
      sphere(1.65, jewel, 0, 0.2);
      for (let i = 0; i < 3; i++) {
        const b = ring(2.5, gold, 0.2);
        b.rotation.set(i * 0.8, 0, i * 0.7 + 0.4);
      }
      const star = mesh(
        "cylinder",
        { height: 0.35, diameterTop: 0, diameterBottom: 0.5, tessellation: 5 },
        cream,
        0,
        1.5,
      );
      star.rotation.z = Math.PI;
      break;
    }
  }
  if (!locked)
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const mote = sphere(
        0.06,
        jewel,
        Math.sin(a) * 1.6,
        -0.5 + i * 0.35,
        Math.cos(a) * 1.6,
      );
      mote.metadata = { sparkle: i };
    }
  return root;
}
