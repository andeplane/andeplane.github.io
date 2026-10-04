import { describe, expect, it } from "vitest";
import { readProgress, saveProgress } from "./progress";
import { awardVoyage, goldTotal, syncRewards, WORLD_RELICS, caveProgress, deliverChest } from "./rewards";

describe("voyage gold and world keepsakes", () => {
  it("adds gold for each first completion, preserving best stars on replay", () => {
    const p = readProgress();
    expect(awardVoyage(p, 0, 2, 1)).toEqual({
      gold: 1000,
      totalGold: 1000,
      special: null,
      model: 0,
    });
    expect(awardVoyage(p, 0, 3, 0).gold).toBe(0);
    expect(p.voyages[0]).toEqual({ stars: 3, gems: 1 });
    expect(goldTotal(p)).toBe(1000);
    expect(p.relics).toEqual([]);
    expect(awardVoyage(p, 1, 1, 3).totalGold).toBe(2000);
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
    expect(goldTotal(p)).toBe(40000);
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
    expect(goldTotal(p)).toBe(4000);
    saveProgress(p, storage);
    expect(readProgress(storage)).toEqual(p);
  });
  it("keeps new rewards aboard across reloads and unloads each chest only once", () => {
    const p=readProgress();awardVoyage(p,0,3,2);awardVoyage(p,1,2,1);
    expect(goldTotal(p)).toBe(2000);expect(goldTotal(caveProgress(p))).toBe(0);
    let saved="";saveProgress(p,{setItem:(_k,v)=>{saved=v;}});
    const restored=readProgress({getItem:()=>saved});expect(restored.cargo).toEqual([0,1]);
    awardVoyage(restored,0,3,3);expect(restored.cargo).toEqual([0,1]);
    expect(deliverChest(restored,0)).toBe(true);expect(deliverChest(restored,0)).toBe(false);
    expect(goldTotal(caveProgress(restored))).toBe(1000);expect(goldTotal(restored)).toBe(2000);
    expect(restored.cargo).toEqual([1]);
  });
  it("brings a world's special treasure into the cave with its final cargo chest", () => {
    const p=readProgress();for(let i=0;i<10;i++)awardVoyage(p,i,3,3);
    expect(p.relics).toEqual([WORLD_RELICS[0]]);expect(caveProgress(p).relics).toEqual([]);
    for(let i=0;i<9;i++)deliverChest(p,i);
    expect(caveProgress(p).relics).toEqual([]);
    deliverChest(p,9);expect(caveProgress(p).relics).toEqual([WORLD_RELICS[0]]);
  });
  it("leaves old saves already banked and drops invalid cargo entries", () => {
    const raw={...readProgress(),voyages:{0:{stars:3,gems:2}}};
    const old=readProgress({getItem:()=>JSON.stringify({...raw,cargo:undefined})});
    expect(old.cargo).toEqual([]);expect(goldTotal(caveProgress(old))).toBe(1000);
    const repaired=readProgress({getItem:()=>JSON.stringify({...raw,cargo:[0,0,-1,999,"0"]})});
    expect(repaired.cargo).toEqual([0]);
  });
  it("leaves an older world keepsake in the cave while new gold is aboard", () => {
    const p=readProgress();p.relics=[WORLD_RELICS[0]];
    awardVoyage(p,0,3,3);
    expect(caveProgress(p).relics).toEqual([WORLD_RELICS[0]]);
    expect(p.cargoRelics).toEqual([]);
  });
});
