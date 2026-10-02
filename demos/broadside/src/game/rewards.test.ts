import { describe, expect, it } from "vitest";
import { readProgress, saveProgress } from "./progress";
import { awardVoyage, goldTotal, syncRewards, WORLD_RELICS } from "./rewards";

describe("voyage gold and world keepsakes", () => {
  it("adds gold for each first completion, preserving best stars on replay", () => {
    const p = readProgress();
    expect(awardVoyage(p, 0, 2, 1)).toEqual({
      gold: 100,
      totalGold: 100,
      special: null,
      model: 0,
    });
    expect(awardVoyage(p, 0, 3, 0).gold).toBe(0);
    expect(p.voyages[0]).toEqual({ stars: 3, gems: 1 });
    expect(goldTotal(p)).toBe(100);
    expect(p.relics).toEqual([]);
    expect(awardVoyage(p, 1, 1, 3).totalGold).toBe(200);
  });
  it("reveals a different special item only when all levels in each world are cleared", () => {
    const p = readProgress();
    for (let w = 0; w < 4; w++) {
      expect(awardVoyage(p, w * 10 + 9, 3, 3).special).toBeNull();
      expect(awardVoyage(p, w * 10, 3, 3).special).toBeNull();
      for (let n = 1; n < 8; n++)
        expect(awardVoyage(p, w * 10 + n, 3, 3).special).toBeNull();
      const reward = awardVoyage(p, w * 10 + 8, 3, 3);
      expect(reward.special).toBe(WORLD_RELICS[w]);
      expect(reward.model).toBe(WORLD_RELICS[w]);
      expect(awardVoyage(p, w * 10 + 8, 3, 3).special).toBeNull();
    }
    expect(p.relics).toEqual([...WORLD_RELICS]);
    expect(goldTotal(p)).toBe(4000);
  });
  it("converts old per-level treasure saves without losing completion or stars", () => {
    let raw = JSON.stringify({
      ...readProgress(),
      campaignVersion: undefined,
      relics: [0, 1, 2, 3],
      voyages: {
        0: { stars: 3, gems: 2 },
        1: { stars: 2, gems: 1 },
        2: { stars: 1, gems: 0 },
        3: { stars: 3, gems: 3 },
      },
    });
    const storage = {
      getItem: () => raw,
      setItem: (_k: string, v: string) => {
        raw = v;
      },
    };
    const p = readProgress(storage);
    syncRewards(p);
    expect(p.relics).toEqual([2]);
    expect(goldTotal(p)).toBe(400);
    saveProgress(p, storage);
    expect(readProgress(storage)).toEqual(p);
  });
});
