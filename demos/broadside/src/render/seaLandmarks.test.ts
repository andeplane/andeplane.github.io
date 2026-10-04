import { describe, expect, it } from "vitest";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { generateFreeSea } from "../game/freeSailing";
import { buildSeaLandmarks } from "./seaLandmarks";

describe("detailed permanent settlements", () => {
  it("batches substantial geometry into a bounded number of phone-friendly meshes", () => {
    for (const def of generateFreeSea().level.islands.slice(0, 5)) {
      const engine = new NullEngine(), scene = new Scene(engine);
      const sun = new DirectionalLight("sun", new Vector3(0, -1, .2), scene);
      const shadow = new ShadowGenerator(128, sun);
      const grain = new StandardMaterial("surface", scene), root = new TransformNode("island", scene);
      const build = buildSeaLandmarks(scene, shadow, grain);
      root.position.set(def.pos.x, 0, def.pos.z);
      const animate = build(root, def, () => 4);
      expect(scene.meshes.length).toBeLessThanOrEqual(8);
      expect(scene.meshes.reduce((n, m) => n + m.getTotalVertices(), 0)).toBeGreaterThan(4000);
      expect(scene.meshes.every(m => m.parent === root)).toBe(true);
      expect(scene.lights.filter(l => l.name === "island amber torch")).toHaveLength(2);
      expect(shadow.getShadowMap()!.renderList!.length).toBeLessThanOrEqual(7);
      for (const mesh of scene.meshes) {
        expect(Array.from(mesh.getVerticesData("position")!).every(Number.isFinite)).toBe(true);
        expect(mesh.getVerticesData("color")!.length).toBe(mesh.getTotalVertices() * 4);
        expect(mesh.getIndices()!.every(i => i >= 0 && i < mesh.getTotalVertices())).toBe(true);
        if (mesh.name.endsWith("roof tiles")) {
          const positions = mesh.getVerticesData("position")!, normals = mesh.getVerticesData("normal")!;
          const indices = mesh.getIndices()!;
          for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!;
            const p = Vector3.FromArray(positions, a * 3), q = Vector3.FromArray(positions, b * 3), s = Vector3.FromArray(positions, c * 3);
            if (Vector3.Cross(q.subtract(p), s.subtract(p)).length() > 4)
              expect((normals[a * 3 + 1]! + normals[b * 3 + 1]! + normals[c * 3 + 1]!) / 3).toBeGreaterThan(0);
          }
        }
      }
      const flag = scene.meshes.find(m => m.name.endsWith("-pirate-flag"));
      const before = flag ? Array.from(flag.getVerticesData("position")!) : [];
      animate(2);
      if (flag) expect(Array.from(flag.getVerticesData("position")!)).not.toEqual(before);
      animate(0);
      expect(scene.lights.every(l => Number.isFinite(l.intensity))).toBe(true);
      scene.dispose(); engine.dispose();
    }
  });
});
