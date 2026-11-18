import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { batchShipDetails } from "./shipDetailBatch";

const triangles = (meshes: AbstractMesh[], relativeTo: TransformNode): number[] => {
  relativeTo.computeWorldMatrix(true);
  const inverse = relativeTo.getWorldMatrix().clone().invert();
  return meshes.flatMap(mesh => {
    mesh.computeWorldMatrix(true);
    const matrix = mesh.getWorldMatrix().multiply(inverse);
    const positions = mesh.getVerticesData("position")!, indices = mesh.getIndices()!;
    return Array.from(indices).flatMap(index =>
      Vector3.TransformCoordinates(Vector3.FromArray(positions, index * 3), matrix).asArray());
  });
};

const expectSameTriangles = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  // World matrices use Float32 storage; compare positions without unstable
  // rounding-bin boundaries after inversion of a translated/rotated parent.
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 4));
};

describe("rigid ship fitting batches", () => {
  it("retains every material's triangles and animated local frame after batching a moved wheel", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const ship = new TransformNode("ship", scene);
      ship.position.set(12, 3, -17); ship.rotation.set(.1, .8, -.2);
      const wheel = new TransformNode("turning wheel", scene); wheel.parent = ship;
      wheel.position.set(-.4, 4, -8); wheel.rotation.z = .28;
      const wood = new StandardMaterial("wood", scene), brass = new StandardMaterial("brass", scene);
      const parts = Array.from({ length: 28 }, (_, i) => {
        const mesh = MeshBuilder.CreateBox(`fitting ${i}`, { width: .05, height: .4, depth: .08 }, scene);
        mesh.parent = wheel; mesh.material = i % 3 ? wood : brass;
        mesh.position.set(Math.sin(i) * .4, Math.cos(i) * .4, 0); mesh.rotation.z = i;
        mesh.receiveShadows = true;
        return mesh;
      });
      const original = new Map([wood, brass].map(material =>
        [material, triangles(parts.filter(mesh => mesh.material === material), wheel)]));
      batchShipDetails(wheel, parts, "wheel batch");
      const batches = wheel.getChildMeshes();
      expect(batches).toHaveLength(2);
      expect(parts.every(mesh => mesh.isDisposed())).toBe(true);
      expect(batches.every(mesh => mesh.receiveShadows)).toBe(true);
      for (const material of [wood, brass]) {
        expectSameTriangles(triangles(batches.filter(mesh => mesh.material === material), wheel), original.get(material)!);
      }
      // The animated parent still owns the fitted geometry rather than a baked
      // world-space copy; later sailing and steering cannot leave the wheel behind.
      ship.position.set(-30, 2, 45); ship.rotation.y = -1.2; wheel.rotation.z = -.6;
      for (const material of [wood, brass]) {
        expectSameTriangles(triangles(batches.filter(mesh => mesh.material === material), wheel), original.get(material)!);
      }
      ship.dispose();
      expect(batches.every(mesh => mesh.isDisposed())).toBe(true);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
