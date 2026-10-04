import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { readProgress } from "../game/progress";
import { CoinHoard } from "./coinHoard";

// Exercise the bank's real instance buffers and worker failure path without
// requiring a browser canvas or running the expensive physics in this test.
vi.mock("./coin", async () => {
  const { MeshBuilder } = await import("@babylonjs/core/Meshes/meshBuilder.js");
  const { StandardMaterial } = await import("@babylonjs/core/Materials/standardMaterial.js");
  return {
    doubloonMaterial: (scene: Scene) => new StandardMaterial("test doubloon", scene),
    doubloonMesh: (scene: Scene, name: string) => MeshBuilder.CreateBox(name, {}, scene),
  };
});
vi.mock("../game/goldLayout", () => ({
  loadGoldLayout: async (_world: number, count: number) => {
    const poses = new Float32Array(count * 7);
    for (let i = 0; i < count; i++) poses[i * 7 + 6] = 1;
    return poses;
  },
  saveGoldLayout: async () => {},
}));
vi.mock("../game/chestCoins", () => ({ chestCoinPoses: async () => new Float32Array(7000) }));

class BlockedWorker {
  static started = 0;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: unknown;
  constructor() { BlockedWorker.started++; }
  postMessage(): void {
    queueMicrotask(() => this.onerror?.({ message: "Worker blocked", filename: "fixture", lineno: 1 } as ErrorEvent));
  }
  terminate(): void {}
}
const drain = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("visible cave deposits", () => {
  let engine: NullEngine;
  let scene: Scene;
  beforeEach(() => {
    engine = new NullEngine(); scene = new Scene(engine);
    BlockedWorker.started = 0;
    vi.stubGlobal("Worker", BlockedWorker);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { scene.dispose(); engine.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("shows every saved coin even if the worker cannot start before the first coin appears", async () => {
    const bank = new CoinHoard(scene, false), p = readProgress();
    bank.refresh(p, 0, [1000, 0, 0, 0]); await drain();
    bank.startPour(0); await drain();
    expect(bank.physicsActive).toBe(false);
    expect(bank.counts).toEqual([1000, 0, 0, 0]);
    expect(bank.restingCounts).toEqual([1000, 0, 0, 0]);
    expect(bank.pouring(0).done).toBe(true);
  });
  it("opens new deposits after an endless bank reaches its visible limit", async () => {
    const bank = new CoinHoard(scene, false), p = readProgress();
    bank.refresh(p, null, [10000, 0, 0, 0]); await drain();
    for (const gold of [11000, 12000]) {
      bank.refresh(p, 0, [gold, 0, 0, 0]); await drain();
      expect(bank.pouring(0).done).toBe(false);
      bank.startPour(0); await drain();
      expect(bank.counts).toEqual([10000, 0, 0, 0]);
      expect(bank.pouring(0).done).toBe(true);
    }
    expect(BlockedWorker.started).toBe(2);
  });
});
