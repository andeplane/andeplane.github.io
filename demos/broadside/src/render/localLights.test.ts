import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { bindLocalLights } from "./localLights";

describe("cave lantern lighting", () => {
  it("keeps both chambers lit with bounded local lights, including rebuilt geometry", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const lamps = [0, 5, 30, 35, 100].map(
        (x) => new PointLight("lamp", new Vector3(x, 3, 0), scene),
      );
      const front = MeshBuilder.CreateBox("front rock", {}, scene);
      const deep = MeshBuilder.CreateBox("deep rock", {}, scene);
      deep.position.x = 32;
      bindLocalLights(lamps, [front, deep]);
      expect(front.lightSources).toEqual(lamps.slice(0, 2));
      expect(deep.lightSources).toEqual(lamps.slice(2, 4));
      expect(lamps[4]!.isEnabled()).toBe(false);
      front.dispose();
      const replacement = MeshBuilder.CreateBox("new gold bank", {}, scene);
      replacement.position.x = 98;
      bindLocalLights(lamps, [replacement, deep]);
      expect(replacement.lightSources).toHaveLength(2);
      expect(replacement.lightSources).toContain(lamps[4]);
      expect(lamps[4]!.isEnabled()).toBe(true);
      expect(lamps.every((l) => !l.includedOnlyMeshes.includes(front))).toBe(
        true,
      );
      expect(lamps[0]!.isEnabled()).toBe(false);
    } finally {
      engine.dispose();
    }
  });
});
