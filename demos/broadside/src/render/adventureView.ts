import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { type ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Session } from "../game/session";

/** Beach treasure chests, golden docking rings and a flock of tiny gulls. */
export class AdventureView {
  private chests: {
    id: number;
    root: TransformNode;
    lid: TransformNode;
    ring: Mesh;
    gems: Mesh[];
  }[] = [];
  private birds: TransformNode[] = [];
  private destination: Mesh;
  private destinationTime = 0;
  constructor(
    private readonly scene: Scene,
    session: Session,
    shadows: ShadowGenerator,
  ) {
    const material = (name: string, hex: string, glow = false) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor.set(0.1, 0.1, 0.1);
      if (glow) m.emissiveColor = m.diffuseColor.scale(0.5);
      return m;
    };
    const wood = material("chest teak", "#885d38"),
      gold = material("chest gold", "#ffca6f", true),
      dark = material("chest inside", "#493329");
    const blue = material("treasure turquoise", "#91f9df", true),
      white = material("gull white", "#fff9df");
    const ringMat = material("dock glow", "#ffdb83", true);
    ringMat.alpha = 0.65;
    ringMat.disableLighting = true;
    for (const t of session.treasures) {
      const island = session.level.islands[t.island]!;
      const dx = t.pos.x - island.pos.x,
        dz = t.pos.z - island.pos.z,
        d = Math.hypot(dx, dz);
      const root = new TransformNode(`chest-${t.id}`, scene);
      root.position.set(
        island.pos.x + (dx / d) * island.radius * 0.82,
        1.7,
        island.pos.z + (dz / d) * island.radius * 0.82,
      );
      root.rotation.y = Math.atan2(dx, dz);
      const box = (
        name: string,
        width: number,
        height: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        mat: StandardMaterial,
        parent = root,
      ) => {
        const m = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
        m.parent = parent;
        m.position.set(x, y, z);
        m.material = mat;
        shadows.addShadowCaster(m);
        return m;
      };
      box("treasure base", 5, 2.6, 3.3, 0, 1.3, 0, wood);
      box("chest inside", 4.5, 0.15, 2.8, 0, 2.62, 0, dark);
      for (const x of [-1.55, 1.55]) {
        box("brass front", 0.32, 2.8, 3.55, x, 1.35, 0, gold);
      }
      box("chest foot", 5.4, 0.35, 3.6, 0, 0.15, 0, gold);
      const lid = new TransformNode("treasure lid hinge", scene);
      lid.parent = root;
      lid.position.set(0, 2.6, -1.65);
      box("arched lid", 5.05, 1.3, 3.4, 0, 0.5, 1.65, wood, lid);
      for (const x of [-1.55, 1.55])
        box("lid brass", 0.34, 1.4, 3.5, x, 0.5, 1.65, gold, lid);
      box("treasure clasp", 0.7, 1.2, 0.35, 0, 2.4, 1.85, gold);
      const ring = MeshBuilder.CreateTorus(
        "treasure landing ring",
        { diameter: 20, thickness: 0.36, tessellation: 48 },
        scene,
      );
      ring.position.set(t.pos.x, 0.75, t.pos.z);
      ring.material = ringMat;
      const gems: Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const g = MeshBuilder.CreatePolyhedron(
          "treasure spark",
          { type: 1, size: 0.7 },
          scene,
        );
        g.material = i % 2 ? gold : blue;
        g.position.set(
          t.pos.x + Math.sin(i * 1.256) * 7,
          5 + (i % 2) * 3,
          t.pos.z + Math.cos(i * 1.256) * 7,
        );
        gems.push(g);
      }
      this.chests.push({ id: t.id, root, lid, ring, gems });
      // A small landing jetty makes the beach feel like somewhere to visit.
      const jetty = new TransformNode("beach landing", scene);
      jetty.position.set(
        island.pos.x + (dx / d) * (island.radius + 2),
        0.8,
        island.pos.z + (dz / d) * (island.radius + 2),
      );
      jetty.rotation.y = root.rotation.y;
      for (let i = 0; i < 6; i++) {
        const m = MeshBuilder.CreateBox(
          "jetty plank",
          { width: 4, depth: 1.1, height: 0.25 },
          scene,
        );
        m.parent = jetty;
        m.position.z = i * 1.18 - 2.5;
        m.material = wood;
        shadows.addShadowCaster(m);
      }
      for (const x of [-1.8, 1.8])
        for (const z of [-2.3, 3.2]) {
          const m = MeshBuilder.CreateCylinder(
            "jetty post",
            { height: 3, diameter: 0.3, tessellation: 7 },
            scene,
          );
          m.parent = jetty;
          m.position.set(x, -0.3, z);
          m.material = wood;
        }
    }
    this.destination = MeshBuilder.CreateTorus(
      "tap destination",
      { diameter: 8, thickness: 0.22, tessellation: 32 },
      scene,
    );
    this.destination.material = ringMat;
    this.destination.isVisible = false;
    for (let i = 0; i < 8; i++) {
      const bird = new TransformNode(`gull-${i}`, scene);
      const body = MeshBuilder.CreateSphere(
        "gull body",
        { diameter: 0.8, segments: 5 },
        scene,
      );
      body.scaling.set(0.45, 0.45, 1);
      body.parent = bird;
      body.material = white;
      for (const side of [-1, 1]) {
        const wing = MeshBuilder.CreateRibbon(
          `gull wing ${side}`,
          {
            pathArray: [
              [
                new Vector3(0, 0, 0),
                new Vector3(side * 1.4, 0.15, -0.15),
                new Vector3(side * 2.2, -0.2, -0.5),
              ],
              [
                new Vector3(0, 0, -0.6),
                new Vector3(side * 1.4, 0.15, -0.6),
                new Vector3(side * 2.2, -0.2, -0.5),
              ],
            ],
            sideOrientation: 2,
          },
          scene,
        );
        wing.parent = bird;
        wing.material = white;
      }
      this.birds.push(bird);
    }
  }
  showDestination(x: number, z: number): void {
    this.destination.position.set(x, 0.9, z);
    this.destinationTime = 3;
    this.destination.isVisible = true;
  }
  update(s: Session, time: number, dt: number): void {
    for (const v of this.chests) {
      const t = s.treasures[v.id]!;
      if (!t) continue;
      const active =
        (s.cruising || t.chapter === s.chapter) &&
        !t.found &&
        s.state === "exploring";
      v.root.setEnabled(s.cruising || t.chapter <= s.chapter);
      v.lid.rotation.x +=
        ((t.found ? -1.6 : -t.progress * 0.6) - v.lid.rotation.x) *
        Math.min(1, dt * 5);
      v.ring.isVisible = active;
      v.ring.scaling.setAll(1 + Math.sin(time * 2) * 0.025);
      for (const [i, g] of v.gems.entries()) {
        g.isVisible = active;
        g.position.y = 4 + Math.sin(time * 2 + i) * 1.5;
        g.rotation.y = time + i;
        g.scaling.setAll(0.65 + Math.sin(time * 3 + i) * 0.15);
      }
    }
    this.destinationTime -= dt;
    this.destination.isVisible = this.destinationTime > 0;
    this.destination.scaling.setAll(1 + (3 - this.destinationTime) * 0.15);
    this.birds.forEach((b, i) => {
      const a = time * 0.08 + i * 0.8,
        r = 34 + i * 7;
      b.position.set(
        95 + Math.sin(a) * r,
        22 + Math.sin(time * 0.7 + i) * 2,
        70 + Math.cos(a) * r,
      );
      b.rotation.y = a + Math.PI / 2;
      for (const [j, w] of b.getChildMeshes().entries())
        if (j > 0)
          w.rotation.z = Math.sin(time * 4 + i) * 0.12 * (j === 1 ? 1 : -1);
    });
  }
}
