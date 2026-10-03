import { describe, expect, it } from "vitest";
import {
  levelUnlocked,
  worldLevels,
  worldStars,
  worldOf,
  stageOf,
  TOTAL_LEVELS,
} from "./campaign";
import { readProgress, saveProgress } from "./progress";
import { goldTotal, syncRewards } from "./rewards";

describe("four worlds of ten voyages", () => {
  it("maps all forty IDs and unlocks the next world after level ten", () => {
    expect(TOTAL_LEVELS).toBe(40);
    expect(worldLevels(3)).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
    expect(worldOf(19)).toBe(1);
    expect(stageOf(19)).toBe(9);
    expect(levelUnlocked({}, 0)).toBe(true);
    expect(levelUnlocked({}, 10)).toBe(false);
    expect(levelUnlocked({ 9: {} }, 10)).toBe(true);
    expect(levelUnlocked({ 10: {} }, 10)).toBe(true);
    expect(levelUnlocked({ 39: {} }, 40)).toBe(false);
    expect(levelUnlocked({}, -1)).toBe(false);
    expect(
      worldStars({ 0: { stars: 3 }, 9: { stars: 2 }, 10: { stars: 3 } }, 0),
    ).toBe(5);
  });
  it("migrates old three-level worlds without erasing stars, gold or earned treasures", () => {
    const old = {
      voyages: {
        0: { stars: 3, gems: 0 },
        1: { stars: 2, gems: 1 },
        2: { stars: 1, gems: 2 },
        3: { stars: 3, gems: 3 },
        11: { stars: 2, gems: 1 },
      },
      relics: [2],
    };
    let raw = JSON.stringify(old);
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, v: string) => {
        raw = v;
      },
    };
    const p = readProgress(storage);
    expect(p.voyages[10]).toEqual(old.voyages[3]);
    expect(p.voyages[32]).toEqual(old.voyages[11]);
    expect(p.voyages[3]).toBeUndefined();
    syncRewards(p);
    expect(p.relics).toEqual([2]);
    expect(goldTotal(p)).toBe(5000);
    saveProgress(p, storage);
    expect(readProgress(storage)).toEqual(p);
  });
  it("persists late levels and rejects invalid current campaign records", () => {
    const p = readProgress();
    p.voyages[39] = { stars: 3, gems: 3 };
    let raw = "";
    saveProgress(p, {
      setItem: (_key, v) => {
        raw = v;
      },
    });
    expect(readProgress({ getItem: () => raw })).toEqual(p);
    const bad = readProgress({
      getItem: () =>
        JSON.stringify({
          ...p,
          voyages: { 40: { stars: 3, gems: 1 }, 39: { stars: 2, gems: 3 } },
        }),
    });
    expect(bad.voyages).toEqual({ 39: { stars: 2, gems: 3 } });
  });
});
