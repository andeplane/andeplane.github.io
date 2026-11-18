import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { clearPrivateCabinShell } from "../shared/pirate-world/render/privateCabinShell";

describe("private Pearl cabin adaptation", () => {
  it("opens an exterior sightline even when a large facade has no vertex inside the cut", () => {
    const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
    try {
      const facade = MeshBuilder.CreatePlane("pearl_test_stern_facade", { width: 20, height: 12 }, scene);
      facade.material = new StandardMaterial("authored stern material", scene);
      facade.position.set(0, 7, -24);
      const result = clearPrivateCabinShell([facade]);
      expect(result.changedMeshes).toBe(1);
      const ray = (x: number, y: number) => scene.pickWithRay(new Ray(new Vector3(x, y, -13), new Vector3(0, 0, -1), 20), m => m === facade);
      expect(ray(0, 6.75)?.hit).toBe(false);
      expect(ray(9.5, 6.75)?.hit).toBe(true);
      expect(ray(0, 11.5)?.hit).toBe(true);
      expect(ray(9.5, 6.75)?.pickedPoint?.z).toBeCloseTo(-24);
      expect(ray(0, 11.5)?.pickedPoint?.z).toBeCloseTo(-24);
      const p = facade.getVerticesData(VertexBuffer.PositionKind)!, uv = facade.getVerticesData(VertexBuffer.UVKind)!;
      expect(uv.length).toBe(p.length / 3 * 2);
      expect(uv.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it("preserves the quarterdeck and the upper starboard staircase", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const stair = MeshBuilder.CreateBox("pearl_test_stair_tread", { width: .8, height: .2, depth: 2 }, scene);
      stair.position.set(3.3, 8.8, -13.5);
      const quarterdeck = MeshBuilder.CreateBox("pearl_test_quarterdeck", { width: 10, height: .3, depth: 10 }, scene);
      quarterdeck.position.set(0, 10.6, -17);
      const before = [stair, quarterdeck].map(mesh => Array.from(mesh.getIndices()!));
      expect(clearPrivateCabinShell([stair, quarterdeck]).changedMeshes).toBe(0);
      expect([stair, quarterdeck].map(mesh => Array.from(mesh.getIndices()!))).toEqual(before);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
