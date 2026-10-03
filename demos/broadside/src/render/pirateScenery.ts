import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { IslandDef } from "../game/levels";
import type { Rng } from "../sim/rng";

/** Landmarks are visual props; the tested navigable island boundaries stay intact. */
export function buildPirateScenery(
  scene: Scene,
  parent: TransformNode,
  def: IslandDef,
  ground: number,
  shadows: ShadowGenerator,
  rng: Rng,
): (time: number) => void {
  const mat = (name: string, hex: string, glow = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.emissiveColor = m.diffuseColor.scale(glow);
    m.specularColor.set(0.08, 0.07, 0.06);
    return m;
  };
  const wood = mat("weathered dock timber", "#674b37"),
    iron = mat("black iron hoops", "#282c32"),
    stone = mat("ancient island ruins", "#7a827a"),
    dark = mat("deep skull sockets", "#131e27"),
    bone = mat("weathered skull stone", "#b6b49a"),
    flame = mat("island torch flame", "#ffbd62", 1.3);
  const box = (
    name: string,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m = wood,
  ) => {
    const b = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    b.parent = parent;
    b.position.set(x, y, z);
    b.material = m;
    shadows.addShadowCaster(b);
    return b;
  };
  const sphere = (
    name: string,
    d: number,
    x: number,
    y: number,
    z: number,
    m: StandardMaterial,
  ) => {
    const b = MeshBuilder.CreateSphere(
      name,
      { diameter: d, segments: 14 },
      scene,
    );
    b.parent = parent;
    b.position.set(x, y, z);
    b.material = m;
    shadows.addShadowCaster(b);
    return b;
  };
  const lights: PointLight[] = [],
    fires: TransformNode[] = [];
  const torch = (x: number, y: number, z: number) => {
    box("torch stake", 0.3, 3, 0.3, x, y + 1.5, z);
    const f = sphere("fire on the island", 0.75, x, y + 3.1, z, flame);
    f.scaling.set(0.65, 1.7, 0.65);
    fires.push(f);
    const l = new PointLight(
      "island amber torch",
      new Vector3(x, y + 3.5, z),
      scene,
    );
    l.parent = parent;
    l.diffuse = Color3.FromHexString("#ffb864");
    l.intensity = 1.8;
    l.range = 17;
    lights.push(l);
  };
  if (def.kind === "rock") {
    const head = sphere("Skull Rock", 10, 0, ground + 1, -1, bone);
    head.scaling.set(1, 0.9, 0.75);
    for (const x of [-2.2, 2.2]) {
      const eye = sphere("skull eye cave", 3, x, ground + 1.7, -4.25, dark);
      eye.scaling.set(1, 1.25, 0.35);
    }
    const nose = MeshBuilder.CreateCylinder(
      "skull nose",
      { height: 2, diameterTop: 0, diameterBottom: 1.6, tessellation: 3 },
      scene,
    );
    nose.parent = parent;
    nose.position.set(0, ground - 0.2, -4.1);
    nose.material = dark;
    for (let i = -2; i <= 2; i++)
      box("skull tooth", 1.2, 1.8, 1.3, i * 1.45, ground - 2, -3, bone);
    torch(-6, 1, -3);
    torch(6, 1, -3);
  } else {
    // A creaking landing stage, mooring posts and pirate supplies on every shore.
    const z = -def.radius * 0.91;
    for (let i = 0; i < 10; i++)
      box("old dock plank", 5, 0.35, 0.62, 0, 0.9, z - i * 0.68);
    for (const x of [-2.4, 2.4])
      for (const dz of [0, -5.8]) {
        box("dock mooring post", 0.45, 3, 0.45, x, 0.9, z + dz);
        const ring = MeshBuilder.CreateTorus(
          "mooring rope",
          { diameter: 0.6, thickness: 0.13, tessellation: 12 },
          scene,
        );
        ring.parent = parent;
        ring.position.set(x, 1.3, z + dz);
        ring.material = stone;
      }
    torch(-2.6, 1.4, z + 2);
    torch(2.6, 1.4, z + 2);
    for (let i = 0; i < 5; i++) {
      const x = -4.5 + (i % 2) * 2,
        z2 = -def.radius * 0.38 + Math.floor(i / 2) * 1.2;
      const barrel = MeshBuilder.CreateCylinder(
        "pirate rum barrel",
        {
          height: 1.9,
          diameterTop: 1.2,
          diameterBottom: 1.2,
          diameter: 1.5,
          tessellation: 12,
        },
        scene,
      );
      barrel.parent = parent;
      barrel.position.set(x, ground + 0.9, z2);
      barrel.material = wood;
      shadows.addShadowCaster(barrel);
      for (const y of [-0.55, 0.55]) {
        const band = MeshBuilder.CreateTorus(
          "barrel iron band",
          { diameter: 1.25, thickness: 0.1, tessellation: 16 },
          scene,
        );
        band.parent = barrel;
        band.position.y = y;
        band.material = iron;
      }
    }
    if (!def.props.includes("fort") && !def.props.includes("lighthouse")) {
      const variant = Math.floor(rng.range(0, 3));
      if (variant === 0) {
        // A ruined gateway to a dark cave.
        for (const x of [-3.5, 3.5]) {
          box("ruined stone pillar", 2.2, 5, 2.5, x, ground + 2.2, 0, stone);
          box("fallen lintel", 2.8, 0.9, 2.7, x, ground + 4.8, 0, stone);
        }
        box("ancient gate lintel", 9, 1.3, 2.5, 0, ground + 5.2, 0, stone);
        box("shadow in the ruin", 4.8, 4.2, 0.3, 0, ground + 1.9, 0.8, dark);
        torch(-4.7, ground, -2);
        torch(4.7, ground, -2);
      } else if (variant === 1) {
        // Hidden pirate camp with patched canvas roofs.
        for (const x of [-4, 3]) {
          box("pirate hut", 4, 3.5, 4, x, ground + 1.5, 1, wood);
          const roof = MeshBuilder.CreateCylinder(
            "patched thatch roof",
            { height: 2, diameterTop: 0, diameterBottom: 6, tessellation: 4 },
            scene,
          );
          roof.parent = parent;
          roof.position.set(x, ground + 4, 1);
          roof.rotation.y = Math.PI / 4;
          roof.material = stone;
          box("hut doorway", 1.4, 2.4, 0.15, x, ground + 1, -1.1, dark);
        }
        torch(0, ground, -2);
      } else {
        // A crumbling lookout and warning bones.
        const tower = MeshBuilder.CreateCylinder(
          "abandoned watchtower",
          { height: 6, diameter: 4, tessellation: 10 },
          scene,
        );
        tower.parent = parent;
        tower.position.set(0, ground + 2.7, 0);
        tower.material = stone;
        shadows.addShadowCaster(tower);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          box(
            "broken battlement",
            0.8,
            1.3,
            0.8,
            Math.sin(a) * 1.8,
            ground + 6,
            Math.cos(a) * 1.8,
            stone,
          );
        }
        torch(0, ground + 6, 0);
      }
    }
  }
  return (time) => {
    fires.forEach(
      (f, i) => (f.scaling.y = 1.5 + Math.sin(time * 10 + i) * 0.24),
    );
    lights.forEach(
      (l, i) => (l.intensity = 1.7 + Math.sin(time * 9 + i) * 0.13),
    );
  };
}
