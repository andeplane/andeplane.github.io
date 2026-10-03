import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { validGoldLayout, saveGoldLayout, loadGoldLayout } from "./goldLayout";
import { GOLD_AREAS, COIN_POSE_STRIDE } from "./goldAreas";
import { readProgress } from "./progress";
import { awardVoyage, worldGold } from "./rewards";
import { caveFloor } from "../input/caveLayout";

const snapshot = (world: number, count: number): ArrayBuffer => {
  const bytes = readFileSync(new URL(`../../public/assets/hoard/world-${world}/${count}.bin`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
describe("settled world gold banks", () => {
  it("keeps every earned coin in its own world, without adding coins for replays", () => {
    const p = readProgress();
    for (let i = 0; i < 8; i++) awardVoyage(p, i, 3, 1);
    awardVoyage(p, 10, 3, 1);
    awardVoyage(p, 31, 3, 1);
    awardVoyage(p, 0, 3, 1);
    expect(GOLD_AREAS.map(a => worldGold(p, a.world))).toEqual([8000, 1000, 0, 1000]);
  });
  it("loads all forty physics deposits with exact counts and unchanged earlier coins", () => {
    for (const area of GOLD_AREAS) {
      let previous = new Float32Array();
      for (let count = 1000; count <= 10000; count += 1000) {
        const data = snapshot(area.world, count), poses = new Float32Array(data);
        expect(validGoldLayout(data, count, area.world)).toBe(true);
        expect(poses.length).toBe(count * COIN_POSE_STRIDE);
        expect(poses.subarray(0, previous.length)).toEqual(previous);
        for (let i = 0; i < poses.length; i += COIN_POSE_STRIDE) {
          expect(poses[i + 1]).toBeGreaterThanOrEqual(caveFloor(poses[i]! + area.x, poses[i + 2]! + area.z) - .15);
        }
        previous = poses;
      }
    }
  });
  it("rejects damaged or incorrectly sized saved poses instead of rendering broken geometry", () => {
    const good = snapshot(0, 1000);
    expect(validGoldLayout(good, 2000, 0)).toBe(false);
    expect(validGoldLayout(good, 1000, 4)).toBe(false);
    expect(validGoldLayout(good, 999, 0)).toBe(false);
    const poses = new Float32Array(good);
    poses[0] = NaN;
    expect(validGoldLayout(good, 1000, 0)).toBe(false);
    poses[0] = 0; poses[1] = -80;
    expect(validGoldLayout(good, 1000, 0)).toBe(false);
    poses[1] = 0; poses[3] = 5;
    expect(validGoldLayout(good, 1000, 0)).toBe(false);
  });
});


describe("persistent coin poses", () => {
  it("restores the exact simulated positions and rotations without fetching or moving them", async () => {
    const records = new Map<string, ArrayBuffer>();
    const db = { transaction: () => {
      const tx: any = {objectStore: () => ({
        put: (data: ArrayBuffer, key: string) => { records.set(key, data.slice(0)); queueMicrotask(() => tx.oncomplete?.()); },
        get: (key: string) => {
          const request: any = { result: records.get(key) };
          queueMicrotask(() => request.onsuccess?.()); return request;
        },
      })}; return tx;
    }};
    vi.stubGlobal("indexedDB", {open: () => {
      const request: any = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request;
    }});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    try {
      const original = new Float32Array(snapshot(0, 1000));
      original[0] = original[0]! + .02;
      const expected = original.slice();
      await saveGoldLayout(0, original);
      original.fill(0);
      expect(await loadGoldLayout(0, 1000)).toEqual(expected);
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("can visit the same physics-built pile when browser storage is blocked", async () => {
    vi.resetModules();
    const {loadGoldLayout} = await import("./goldLayout");
    const bytes = snapshot(1, 1000);
    vi.stubGlobal("indexedDB", {open: () => {throw new Error("Storage blocked");}});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>bytes}));
    try { expect(await loadGoldLayout(1, 1000)).toEqual(new Float32Array(bytes)); }
    finally { vi.unstubAllGlobals(); }
  });
});
