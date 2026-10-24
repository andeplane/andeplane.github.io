// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ engines: [] as any[], caves: [] as any[], holds: [] as any[] }));
const scene = (engine: any) => {
  const value = { dispose: vi.fn(() => engine.scenes.splice(engine.scenes.indexOf(value), 1)) };
  engine.scenes.push(value); return value;
};
vi.mock("@babylonjs/core/Engines/engine.js", () => ({ Engine: class {
  scenes: any[] = []; loop = () => {}; constructor() { runtime.engines.push(this); }
  scale = 1; setHardwareScalingLevel(scale: number) { this.scale = scale; }
  resize() {} getCaps() { return { maxRenderTextureSize: 4096 }; }
  getDeltaTime() { return 100; } runRenderLoop(fn: () => void) { this.loop = fn; }
} }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("../render/quality", async () => ({ ...await vi.importActual<typeof import('../render/quality')>("../render/quality"), configureTextureQuality() {} }));
vi.mock("../render/cave", () => ({ TreasureCave: class {
  scene: any; walker = { x: 0, eyeY: 2, z: 0 }; room = "Cave entrance"; inspecting = false;
  reserveCounts = [0,0,0,0]; gemCounts = [0,0,0,0]; coinCounts = [0,0,0,0]; restingCoinCounts = [0,0,0,0]; goldPhysicsActive = false; depositComplete = false;
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
const earnedCargo = (count: number, mistakeLevel = 0) => {
  const progress = freshProgress();
  for (let level=1;level<=count;level++) {
    const run = startVoyage(progress, "add-10", level, level)!;
    const questions=questionsFor("add-10",run.seed,run.questionSet);
    if(level===mistakeLevel) answerQuestion(progress,"add-10",level,questions[0]!.answer+1);
    for (const question of questions) answerQuestion(progress,"add-10",level,question.answer);
  }
  return progress;
};
beforeEach(() => {
  vi.unstubAllGlobals();
  runtime.engines.length=runtime.caves.length=runtime.holds.length=0;
  document.body.innerHTML='<main id="academy"></main><canvas id="test"></canvas>';
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
describe("math cargo uses the shared ship and cave", () => {
  it("keeps a 3x native iPhone within the mobile rendering budget", () => {
    vi.stubGlobal("innerWidth", 402); vi.stubGlobal("innerHeight", 874); vi.stubGlobal("devicePixelRatio", 3);
    const view=new GoldCave(document.querySelector("canvas")!,vi.fn(),false);
    const ratio=1/runtime.engines[0].scale;
    expect(402*874*ratio*ratio).toBeLessThanOrEqual(1_000_000);
    expect(ratio).toBeLessThanOrEqual(1.5);
    view.showShip(freshProgress(),false);
    expect(1/runtime.engines[0].scale).toBe(ratio);
    view.pause();
  });
  it("stows earned chests, banks them one at a time, and keeps only one 3D scene alive", async () => {
    const progress=earnedCargo(3), changed=vi.fn(), ready=vi.fn();
    const view=new GoldCave(document.querySelector("canvas")!,ready,false,changed);
    expect(runtime.caves).toHaveLength(0);
    view.showShip(progress,false); await Promise.resolve(); ready.mockClear();
    expect(runtime.holds[0].openCargo).toHaveBeenCalledWith(3,1000,false);
    expect(bankedGold(progress)).toBe(0);
    expect(runtime.engines[0].scenes).toHaveLength(1);
    view.show(progress,true);
    expect(runtime.holds[0].scene.dispose).toHaveBeenCalledOnce();
    const cave=runtime.caves[0], ids=pendingMathChests(progress).map(c=>c.id);
    expect(cave.showCargo).toHaveBeenLastCalledWith(ids,ids[0],true);
    expect(cave.refresh).toHaveBeenLastCalledWith(expect.anything(),0,[1000,0,0,0],1000);
    for(let i=0;i<3;i++) {
      cave.depositComplete=true; runtime.engines[0].loop();
      expect(bankedGold(progress)).toBe((i+1)*1000);
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
    expect(bankedGold(progress)).toBe(1000); expect(pendingMathChests(progress)).toHaveLength(1);
    view.pause();
  });
  it("uses each chest’s actual 900 or 1,000 coin reward without changing either banked amount", () => {
    const progress=freshProgress();
    for(let level=1;level<=2;level++) {
      const run=startVoyage(progress,"add-10",level,level)!;
      const questions=questionsFor("add-10",run.seed,run.questionSet);
      if(level===1) answerQuestion(progress,"add-10",level,questions[0]!.answer+1);
      for(const question of questions) answerQuestion(progress,"add-10",level,question.answer);
    }
    expect(pendingMathChests(progress).map(c=>c.gold)).toEqual([900,1000]);
    const view=new GoldCave(document.querySelector("canvas")!,vi.fn(),false);
    view.showShip(progress,false);
    expect(runtime.holds[0].openCargo).toHaveBeenCalledWith(2,1000,false);
    view.show(progress,true);
    const cave=runtime.caves[0];
    expect(cave.refresh).toHaveBeenLastCalledWith(expect.anything(),0,[900,0,0,0],900);
    cave.depositComplete=true;runtime.engines[0].loop();
    expect(bankedGold(progress)).toBe(900);
    expect(cave.refresh).toHaveBeenLastCalledWith(expect.anything(),0,[1900,0,0,0],1000);
    cave.depositComplete=true;runtime.engines[0].loop();
    expect(bankedGold(progress)).toBe(1900);expect(pendingMathChests(progress)).toHaveLength(0);
    view.pause();
  });

  it("shows only the latest chest’s actual 900 coins aboard after one forfeited problem", () => {
    const progress=earnedCargo(1,1),view=new GoldCave(document.querySelector("canvas")!,vi.fn(),false);
    expect(pendingMathChests(progress)[0]?.gold).toBe(900);
    view.showShip(progress,false);
    expect(runtime.holds[0].openCargo).toHaveBeenCalledWith(1,900,false);
    view.pause();
  });

});
