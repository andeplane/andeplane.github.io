import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { buildTreasureCabin } from "../shared/pirate-world/render/treasureCabin";

describe("fitted treasure cabin", () => {
  it("keeps outward-facing solid joinery, closed outer lining and symmetric bounded lantern light", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const sun = new DirectionalLight("test sun", new Vector3(-.4, -.9, -.7), scene);
      const cabin = buildTreasureCabin(scene, new ShadowGenerator(512, sun));
      const floor = cabin.meshes.filter(m => m.material?.name.startsWith("cabin deck"));
      let upward = 0;
      for (const mesh of floor) {
        const p = mesh.getVerticesData(VertexBuffer.PositionKind)!, n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 1]! - .7) < .00001) {
          expect(n[i + 1]!).toBeGreaterThan(.5); upward++;
        }
      }
      expect(upward).toBeGreaterThan(100);
      const framing = cabin.meshes.find(m => m.material?.name === "cabin dark carved oak")!;
      const positions = framing.getVerticesData(VertexBuffer.PositionKind)!, normals = framing.getVerticesData(VertexBuffer.NormalKind)!;
      let forward = 0;
      for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i + 2]! - .055) < .00001 && positions[i + 1]! > 1 && positions[i + 1]! < 5) {
        expect(normals[i + 2]!).toBeLessThan(-.6); forward++;
      }
      expect(forward).toBeGreaterThan(10);
      const origin = new Vector3(0, 4.05, -5.4);
      for (const target of [new Vector3(0, 5.8, 7.5), new Vector3(4.3, 3.1, 7.3), new Vector3(-4.3, 3.1, 7.3), new Vector3(4.8, 1.146, 2)]) {
        const hit = scene.pickWithRay(new Ray(origin, target.subtract(origin).normalize(), Vector3.Distance(origin, target) + 1), mesh => cabin.meshes.includes(mesh as typeof framing));
        expect(hit?.hit).toBe(true);
      }
      expect(cabin.lamps).toHaveLength(4);
      expect(cabin.lamps[0]!.position.x).toBeLessThan(0);
      expect(cabin.lamps[1]!.position.x).toBeGreaterThan(0);
      expect(cabin.lamps.slice(0, 2).every(light => light.position.z < 0)).toBe(true);
      expect(cabin.meshes.length).toBeLessThanOrEqual(12);
      expect(cabin.meshes.every(mesh => (mesh.material as StandardMaterial).maxSimultaneousLights === 4)).toBe(true);
      expect(cabin.floorY).toBe(.7);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
