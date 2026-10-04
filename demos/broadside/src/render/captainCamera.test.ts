import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/core/Culling/ray.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CaptainCamera } from "./captainCamera";
import type { ShipView } from "./shipView";

afterEach(() => vi.unstubAllGlobals());
describe("captain view", () => {
  it("leaves overhead steering as the default until the player switches camera mode", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const camera = new FreeCamera("overhead", new Vector3(0, 80, -60), scene);
    camera.setTarget(Vector3.Zero());
    const root = new TransformNode("ship", scene);
    const view = { root, captainSeat: new Vector3(1.8, 5, -8) } as ShipView;
    const captain = new CaptainCamera();
    const position = camera.position.clone(), target = camera.getTarget().clone();
    captain.look(100, 100);
    for (let i = 0; i < 160; i++) captain.apply(camera, view, 1 / 60);
    expect(captain.enabled).toBe(false);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.getTarget().equals(target)).toBe(true);
    expect(root.rotation.y).toBe(0);
    scene.dispose(); engine.dispose();
  });
  it("stays attached to a turning deck while looking independently", () => {
    vi.stubGlobal("innerWidth", 1280);
    const engine = new NullEngine(), scene = new Scene(engine);
    const camera = new FreeCamera("test", Vector3.Zero(), scene);
    const root = new TransformNode("ship", scene);
    root.position.set(80, .3, 24); root.rotation.y = Math.PI / 2;
    const seat = new Vector3(0, 5, -8);
    const captain = new CaptainCamera(); captain.enabled = true;
    const view = { root, captainSeat: seat } as ShipView;
    const settle = () => { for (let i = 0; i < 160; i++) { camera.position.set(80, 80, -50); camera.setTarget(new Vector3(80, 0, 24)); captain.apply(camera, view, 1 / 60); } };
    settle();
    root.computeWorldMatrix(true);
    expect(Vector3.Distance(camera.position, Vector3.TransformCoordinates(seat, root.getWorldMatrix()))).toBeLessThan(.01);
    const before = camera.getForwardRay().direction.clone();
    captain.look(200, 0); settle();
    expect(Vector3.Distance(before, camera.getForwardRay().direction)).toBeGreaterThan(.5);
    expect(root.rotation.y).toBe(Math.PI / 2);
    captain.centre(); expect(captain.yaw).toBe(0);
    scene.dispose(); engine.dispose();
  });
  it("keeps a walking eye attached to the sailing, turning and rolling ship", () => {
    vi.stubGlobal("innerWidth", 1280);
    const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera("deck",Vector3.Zero(),scene);
    const root=new TransformNode("ship",scene),seat=new Vector3(2,5,-10);
    const captain=new CaptainCamera();captain.enabled=true;captain.deckEye=new Vector3(-2,4,7);
    const view={root,captainSeat:seat} as ShipView;
    for(let i=0;i<200;i++){
      root.position.set(i*.2,Math.sin(i*.03)*.4,i*.1);root.rotation.set(.1,i*.005,.07);
      camera.position.set(0,80,-60);captain.apply(camera,view,1/60);
    }
    expect(Vector3.Distance(camera.position,Vector3.TransformCoordinates(captain.deckEye,root.getWorldMatrix()))).toBeLessThan(.01);
    expect(view.captainSeat.equals(seat)).toBe(true);
    captain.deckEye=null;
    for(let i=0;i<60;i++)captain.apply(camera,view,1/60);
    expect(Vector3.Distance(camera.position,Vector3.TransformCoordinates(seat,root.getWorldMatrix()))).toBeLessThan(.01);
    scene.dispose();engine.dispose();
  });
  it("returns smoothly to the overhead camera and keeps look angles bounded", () => {
    vi.stubGlobal("innerWidth", 390);
    const engine = new NullEngine(), scene = new Scene(engine);
    const camera = new FreeCamera("test", Vector3.Zero(), scene);
    const captain = new CaptainCamera(), root = new TransformNode("ship", scene);
    const view = { root, captainSeat: new Vector3(1.8, 5, -8) } as ShipView;
    captain.look(10000, 10000);
    expect(Math.abs(captain.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(captain.pitch).toBe(1.1);
    captain.look(0, -10000); expect(captain.pitch).toBe(-1.1);
    captain.centre(); captain.enabled = true;
    for (let i = 0; i < 160; i++) captain.apply(camera, view, 1 / 60);
    expect(camera.fovMode).toBe(Camera.FOVMODE_HORIZONTAL_FIXED);
    expect(camera.fov).toBeCloseTo(1.06, 3);
    captain.enabled = false;
    for (let i = 0; i < 160; i++) {
      camera.position.set(0, 80, -60); captain.apply(camera, view, 1 / 60);
    }
    expect(camera.position.y).toBe(80);
    expect(camera.rotation.z).toBe(0);
    scene.dispose(); engine.dispose();
  });
});
