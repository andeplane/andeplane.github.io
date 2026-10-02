import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { VoyageSession } from "../game/voyage";
export class VoyageView {
  private gems: Mesh[] = [];
  private tentacles: Mesh[] = [];
  private rings: Mesh[] = [];
  private fortTargets: Mesh[] = [];
  constructor(
    scene: Scene,
    private session: VoyageSession,
  ) {
    const mat = (hex: string, glow = 0) => {
      const m = new StandardMaterial("voyage magic", scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(glow);
      return m;
    };
    const jewel = mat("#6bfff2", 0.8),
      purple = mat("#974dc4", 0.3),
      pink = mat("#ffa5e9", 0.5),
      gold = mat("#ffde81", 0.7),
      red = mat("#ff705d", 0.45);
    for (const g of session.voyage.gems) {
      const m = MeshBuilder.CreateCylinder(
        "secret sea gem",
        { height: 3.2, diameterTop: 0, diameterBottom: 2.4, tessellation: 5 },
        scene,
      );
      m.position.set(g.x, 2.6, g.z);
      m.material = jewel;
      this.gems.push(m);
    }
    const end = session.voyage.finish;
    for (let n = -4; n <= 4; n++) {
      const buoy = MeshBuilder.CreateCylinder(
        "golden exit buoy",
        { height: 1.2, diameterTop: 1.3, diameterBottom: 2, tessellation: 12 },
        scene,
      );
      buoy.position.set(n * 17, 0.7, end.z);
      buoy.material = gold;
      const light = MeshBuilder.CreateSphere(
        "exit lantern",
        { diameter: 0.9, segments: 12 },
        scene,
      );
      light.position.set(n * 17, 2, end.z);
      light.material = gold;
    }
    for (let i = 0; i < 3; i++) {
      const m = MeshBuilder.CreateTorus(
        "treasure finish glow",
        { diameter: 25 + i * 4, thickness: 0.13, tessellation: 64 },
        scene,
      );
      m.position.set(end.x, 0.7, end.z);
      m.material = gold;
      this.rings.push(m);
    }
    for (const f of session.fortWarnings) {
      const m = MeshBuilder.CreateTorus(
        "fort danger range",
        { diameter: 105, thickness: 0.16, tessellation: 64 },
        scene,
      );
      m.position.set(f.x, 0.6, f.z);
      m.material = red;
    }
    for (let i = 0; i < session.voyage.forts.length; i++) {
      const target = MeshBuilder.CreateTorus(
        "incoming island cannon shot",
        { diameter: 10, thickness: 0.3, tessellation: 48 },
        scene,
      );
      target.material = red;
      target.isPickable = false;
      target.setEnabled(false);
      this.fortTargets.push(target);
    }
    const k = session.voyage.kraken;
    if (k) {
      const ring = MeshBuilder.CreateTorus(
        "kraken warning",
        { diameter: 37, thickness: 0.35, tessellation: 64 },
        scene,
      );
      ring.position.set(k.x, 0.7, k.z);
      ring.material = pink;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5,
          path = Array.from({ length: 16 }, (_, j) => {
            const t = j / 15;
            return new Vector3(
              Math.sin(a) * (10 + Math.sin(t * 3) * 5),
              t * 16 - 2,
              Math.cos(a) * (10 + Math.sin(t * 4) * 4),
            );
          });
        const m = MeshBuilder.CreateTube(
          "kraken arm",
          {
            path,
            radiusFunction: (j) => 1.7 * (1 - j / 16) + 0.1,
            tessellation: 10,
            cap: 3,
          },
          scene,
        );
        m.position.set(k.x, 0, k.z);
        m.material = purple;
        this.tentacles.push(m);
        for (let j = 3; j < 13; j += 3) {
          const p = path[j]!;
          const sucker = MeshBuilder.CreateTorus(
            "kraken sucker",
            { diameter: 1, thickness: 0.22, tessellation: 12 },
            scene,
          );
          sucker.parent = m;
          sucker.position.copyFrom(p);
          sucker.rotation.x = Math.PI / 2;
          sucker.material = pink;
        }
      }
    }
  }
  update(time: number): void {
    const incoming = this.session.incomingFortShots;
    this.fortTargets.forEach((mesh, i) => {
      const shot = incoming[i];
      mesh.setEnabled(!!shot);
      if (!shot) return;
      mesh.position.set(shot.x, 1.4, shot.z);
      mesh.scaling.setAll(0.8 + 0.12 * Math.sin(time * 10));
    });
    this.gems.forEach((m, i) => {
      m.setEnabled(!this.session.voyage.gems[i]!.found);
      m.position.y = 2.4 + Math.sin(time * 2 + i) * 0.5;
      m.rotation.y = time;
    });
    this.rings.forEach((r, i) =>
      r.scaling.setAll(1 + Math.sin(time * 2 + i) * 0.035),
    );
    this.tentacles.forEach((t, i) => {
      t.scaling.y =
        0.1 + Math.max(0, (Math.sin(this.session.elapsed * 0.7) + 1) / 2) * 0.9;
      t.rotation.y = Math.sin(time * 0.8 + i) * 0.1;
    });
  }
}
