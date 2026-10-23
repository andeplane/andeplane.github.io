// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ engines: [] as any[], caves: [] as any[], holds: [] as any[] }));
const scene = (engine: any) => {
  const value = { dispose: vi.fn(() => engine.scenes.splice(engine.scenes.indexOf(value), 1)) };
  engine.scenes.push(value); return value;
};
vi.mock("@babylonjs/core/Engines/engine.js", () => ({ Engine: class {
  scenes: any[] = []; loop = () => {}; constructor() { runtime.engines.push(this); }
  setHardwareScalingLevel() {} resize() {} getCaps() { return { maxTextureSize: 4096 }; }
  getDeltaTime() { return 100; } runRenderLoop(fn: () => void) { this.loop = fn; }
} }));
vi.mock("../render/quality", () => ({ configureTextureQuality() {}, displayRenderScale: () => 1 }));
vi.mock("../render/cave", () => ({ TreasureCave: class {
  scene: any; walker = { x: 0, eyeY: 2, z: 0 }; room = "Cave entrance"; inspecting = false;
  coinCounts = [0,0,0,0]; restingCoinCounts = [0,0,0,0]; goldPhysicsActive = false; depositComplete = false;
  refresh = vi.fn(); showCargo = vi.fn(); beginUnload = vi.fn(() => { this.depositComplete = false; });
  endReveal = vi.fn(); render = vi.fn(); enter = vi.fn(); resize() {} look() {} walk() {}
  constructor(engine: any) { this.scene = scene(engine); runtime.caves.push(this); }
} }));
vi.mock("../render/shipHold", () => ({ ShipHold: class {
  scene: any; pose = { discovered: true }; openCargo = vi.fn(); render = vi.fn();
  constructor(engine: any) { this.scene = scene(engine); runtime.holds.push(this); }
} }));
vi.mock("../game/voyage", () => ({ generateVoyage: () => ({}) }));
import { GoldCave } from "./goldCave";
import { answerQuestion, bankedGold, freshProgress, pendingMathChests, questionsFor, startVoyage } from "./academy";
const earnedCargo = (count: number) => {
  const progress = freshProgress();
  for (let level=1;level<=count;level++) {
    const run = startVoyage(progress, "add-10", level, level)!;
    for (const question of questionsFor("add-10", run.seed, run.questionSet)) answerQuestion(progress,"add-10",level,question.answer);
  }
  return progress;
};
beforeEach(() => {
  runtime.engines.length=runtime.caves.length=runtime.holds.length=0;
  document.body.innerHTML='<main id="academy"></main><canvas id="test"></canvas>';
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
describe("math cargo uses the shared ship and cave", () => {
  it("stows earned chests, banks them one at a time, and keeps only one 3D scene alive", async () => {
    const progress=earnedCargo(3), changed=vi.fn(), ready=vi.fn();
    const view=new GoldCave(document.querySelector("canvas")!,ready,false,changed);
    expect(runtime.caves).toHaveLength(0);
    view.showShip(progress,false); await Promise.resolve(); ready.mockClear();
    expect(runtime.holds[0].openCargo).toHaveBeenCalledWith(3,100,false);
    expect(bankedGold(progress)).toBe(0);
    expect(runtime.engines[0].scenes).toHaveLength(1);
    view.show(progress,true);
    expect(runtime.holds[0].scene.dispose).toHaveBeenCalledOnce();
    const cave=runtime.caves[0], ids=pendingMathChests(progress).map(c=>c.id);
    expect(cave.showCargo).toHaveBeenLastCalledWith(ids,ids[0],true);
    expect(cave.refresh).toHaveBeenLastCalledWith(expect.anything(),0,[100,0,0,0],100);
    for(let i=0;i<3;i++) {
      cave.depositComplete=true; runtime.engines[0].loop();
      expect(bankedGold(progress)).toBe((i+1)*100);
      expect(pendingMathChests(progress)).toHaveLength(2-i);
    }
    expect(cave.beginUnload.mock.calls.map((args:any[])=>args[1])).toEqual(ids);
    expect(changed).toHaveBeenCalledTimes(3); expect(ready).toHaveBeenCalledOnce();
    expect(view.unloading).toMatchObject({done:true,total:3,delivered:3});
    expect(runtime.engines[0].scenes).toHaveLength(1);
    view.pause(); expect(runtime.engines[0].scenes).toHaveLength(0);
  });
  it("leaves an unfinished chest aboard when departing, then resumes from its saved ID", () => {
    const progress=earnedCargo(2), view=new GoldCave(document.querySelector("canvas")!,vi.fn(),false);
    view.show(progress,true); const first=pendingMathChests(progress)[0]!.id;
    view.pause(); expect(bankedGold(progress)).toBe(0); expect(pendingMathChests(progress)).toHaveLength(2);
    view.show(progress,true);
    expect(runtime.caves[1].beginUnload).toHaveBeenCalledWith(0,first);
    expect(runtime.engines[0].scenes).toHaveLength(1);
    runtime.caves[1].depositComplete=true; runtime.engines[0].loop();
    expect(bankedGold(progress)).toBe(100); expect(pendingMathChests(progress)).toHaveLength(1);
    view.pause();
  });
});
