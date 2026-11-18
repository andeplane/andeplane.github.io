import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraRig } from "./renderer";

afterEach(() => vi.unstubAllGlobals());

it("orbits the follow target independently and restores the original framing", () => {
  vi.stubGlobal("innerWidth", 390);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const rig = new CameraRig(scene);
  rig.title = false;
  rig.snap(15, 30);
  const update = () => rig.update(0, 15, 30, 0, 0);
  update();
  const start = rig.camera.position.clone();
  const target = rig.focus.clone();
  rig.look(80, -60);
  update();
  expect(rig.camera.position.x).toBeLessThan(start.x);
  expect(rig.camera.position.y).toBeLessThan(start.y);
  expect(rig.focus.equals(target)).toBe(true);
  rig.look(0, -10000);
  update();
  expect(rig.camera.position.y).toBeGreaterThan(0);
  rig.centre();
  update();
  expect(rig.camera.position.equalsWithEpsilon(start)).toBe(true);
  scene.dispose();
  engine.dispose();
});
