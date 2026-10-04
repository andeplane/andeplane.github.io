import { describe, expect, it, vi } from "vitest";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildIslands } from "./islands";
import type { IslandDef } from "../game/levels";

// Node has no canvas. Geometry, transforms, materials, lights and shadow lists
// still use Babylon's real implementation.
vi.mock("./islandSurface", () => ({
  islandSurface: (scene: Scene, stone: boolean) => new StandardMaterial(stone ? "stone" : "soil", scene),
}));

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("overhead", new Vector3(0, 80, -60), scene);
  scene.activeCamera = camera;
  const sun = new DirectionalLight("sun", new Vector3(0, -1, .2), scene);
  const shadows = new ShadowGenerator(128, sun);
  return { engine, scene, shadows };
}

describe("rendering the permanent archipelago", () => {
  it("rebuilds identical scenery on return without leaking lights, meshes or shadow casters", () => {
    const { engine, scene, shadows } = fixture();
    const defs: IslandDef[] = [0, 1000].map(x => ({ pos: { x, z: 50 }, radius: 20,
      kind: "sand", props: ["palms", "rocks", "lighthouse"] }));
    const original = structuredClone(defs);
    const view = buildIslands(scene, defs, shadows, 81723, 0, { x: 0, z: 0 });
    const geometry = () => Array.from(scene.getMeshByName("island-0-50")!.getVerticesData("position")!);
    const props = () => scene.meshes.filter(m => m.name.startsWith("palm-0-"))
      .map(m => [m.name, ...m.position.asArray(), ...m.scaling.asArray(), m.rotation.y]);
    const initial = { geometry: geometry(), props: props(), meshes: scene.meshes.length,
      materials: scene.materials.length, lights: scene.lights.length,
      shadows: shadows.getShadowMap()!.renderList!.length };
    for (let i = 0; i < 3; i++) {
      view.update(0, undefined, { x: 1000, z: 0 });
      expect(view.activeCount).toBe(1);
      expect(scene.getMeshByName("island-0-50")).toBeNull();
      view.update(0, undefined, { x: 0, z: 0 });
      expect(geometry()).toEqual(initial.geometry);
      expect(props()).toEqual(initial.props);
      expect(scene.meshes.length).toBe(initial.meshes);
      expect(scene.materials.length).toBe(initial.materials);
      expect(scene.lights.length).toBe(initial.lights);
      expect(shadows.getShadowMap()!.renderList!.length).toBe(initial.shadows);
      expect(shadows.getShadowMap()!.renderList!.every(m => !m.isDisposed())).toBe(true);
    }
    expect(defs).toEqual(original);
    scene.dispose(); engine.dispose();
  });

  it("moves the same shore and props to the nearest periodic image at a world edge", () => {
    const { engine, scene, shadows } = fixture();
    const defs: IslandDef[] = [{ pos: { x: -1590, z: 0 }, radius: 20,
      kind: "sand", props: ["palms", "rocks"] }];
    const view = buildIslands(scene, defs, shadows, 81723, 0, { x: 1580, z: 0 }, 1600);
    view.update(0, undefined, { x: 1580, z: 0 });
    const shore = scene.getMeshByName("island--1590-0")!;
    const props = scene.getTransformNodeByName("island-props--1590")!;
    expect(shore.position.x).toBe(1610); expect(props.position.x).toBe(1610);
    const meshCount = scene.meshes.length;
    view.update(0, undefined, { x: -1580, z: 0 });
    expect(shore.position.x).toBe(-1590); expect(props.position.x).toBe(-1590);
    expect(view.activeCount).toBe(1); expect(scene.meshes.length).toBe(meshCount);
    expect(defs[0]!.pos.x).toBe(-1590);
    scene.dispose(); engine.dispose();
  });
});
