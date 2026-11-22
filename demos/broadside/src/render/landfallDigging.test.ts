import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { IslandDigging } from "./landfallDigging";

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("walker", new Vector3(0, 2, -2), scene);
  const ground = MeshBuilder.CreateGround("island-0-0", { width: 24, height: 24, subdivisions: 32 }, scene);
  const plane = (x: number, z: number) => 0.04 * x - 0.07 * z + 0.9;
  const p = ground.getVerticesData("position")!;
  for (let i = 0; i < p.length; i += 3) p[i + 1] = plane(p[i]!, p[i + 2]!);
  ground.setVerticesData("position", p);
  ground.setVerticesData("color", new Float32Array(4 * ground.getTotalVertices()).fill(1));
  ground.computeWorldMatrix(true);
  const digging = new IslandDigging(scene, plane, "tropical", 82417);
  return { scene, ground, plane, digging, dispose: () => engine.dispose() };
}

describe("island spade", () => {
  it("waits for contact and cancels a swing before the ground is cut", () => {
    const { scene, digging, plane, dispose } = fixture(),
      x = 0.235,
      z = 0.14;
    let count = 0;
    try {
      expect(digging.strike(x, z, true, false, () => count++)).toBe(true);
      expect(scene.getMeshByName("shovel in the captain’s hands")!.isEnabled()).toBe(true);
      digging.update(0.1, false);
      expect(digging.heightAt(x, z)).toBe(plane(x, z));
      expect(count).toBe(0);
      digging.cancelSwing();
      digging.update(0.2, false);
      expect(digging.heightAt(x, z)).toBe(plane(x, z));
      expect(count).toBe(0);
      digging.strike(x, z, true, false, () => count++);
      digging.update(0.15, false);
      digging.update(0.4, false);
      expect(count).toBe(1);
      expect(digging.heightAt(x, z)).toBeCloseTo(plane(x, z) - 0.28, 2);
      expect(scene.getMeshByName("shovel in the captain’s hands")!.isEnabled()).toBe(false);
    } finally {
      dispose();
    }
  });
  it("changes the real triangles, matches their walk heights and restores progress silently", () => {
    const { scene, ground, plane, digging, dispose } = fixture(),
      x = 1.196,
      z = -1.31;
    let count = 0;
    try {
      for (const depth of [0.28, 0.62, 1]) {
        digging.strike(x, z, true, true, () => count++);
        expect(digging.heightAt(x, z)).toBeCloseTo(plane(x, z) - depth, 2);
      }
      expect(count).toBe(3);
      expect(scene.getMeshByName("shovel in the captain’s hands")!.isEnabled()).toBe(false);
      expect(scene.getMeshByName("earth thrown by the spade")!.isEnabled()).toBe(false);
      for (let j = -3; j <= 3; j++)
        for (let i = -3; i <= 3; i++) {
          const xx = x + i * 0.23,
            zz = z + j * 0.22;
          const hit = new Ray(new Vector3(xx, 5, zz), Vector3.Down()).intersectsMesh(ground);
          expect(hit.pickedPoint?.y).toBeCloseTo(digging.heightAt(xx, zz), 4);
        }
      expect(digging.heightAt(-8, 8)).toBe(plane(-8, 8));
      digging.restoreTreasure(x, z, 3);
      expect(digging.heightAt(x, z)).toBeCloseTo(plane(x, z) - 1, 2);
      const fresh = fixture();
      try {
        fresh.digging.restoreTreasure(x, z, 3);
        expect(fresh.digging.heightAt(x, z)).toEqual(digging.heightAt(x, z));
      } finally {
        fresh.dispose();
      }
      digging.strike(5, 4, false, true);
      expect(digging.heightAt(5, 4)).toBeLessThan(plane(5, 4) - 0.12);
    } finally {
      dispose();
    }
  });
});
