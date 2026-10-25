import type { Progress } from "./progress";
import { saveProgress } from "./progress";
import { caveProgress, cargoChests, chestWorld, deliverChest, GOLD_PER_LEVEL, WORLD_RELICS, CAVE_ITEMS, worldGold } from "./rewards";
import { GOLD_AREAS } from "../shared/pirate-world/game/goldAreas";
import { coinPosePersistence } from "../shared/pirate-world/persistence";
import type { PirateAdapter, ShipPresentation, TreasureState } from "../shared/pirate-world/types";
import type { VoyageDef } from "./voyage";

export function sailingTreasure(progress: Progress): TreasureState {
  const bank = caveProgress(progress);
  return { bankGold:GOLD_AREAS.map(a=>worldGold(bank,a.world)), relics:bank.relics,
    pending:cargoChests(progress).map(id=>({id,area:chestWorld(progress,id),gold:GOLD_PER_LEVEL})) };
}
export function shipPresentation(voyage: VoyageDef): ShipPresentation {
  const island=voyage.level.islands.filter(i=>i.kind==='sand').sort((a,b)=>Math.hypot(a.pos.x-voyage.finish.x,a.pos.z-voyage.finish.z)-Math.hypot(b.pos.x-voyage.finish.x,b.pos.z-voyage.finish.z))[0];
  return {chapter:voyage.pack,seed:voyage.level.seed,island};
}
export function sailingAdapter(progress: Progress, storage?: Storage, persistent=true): PirateAdapter {
  return {
    config:{sound:true,theme:{fog:"#07111c"},gameId:"broadside",poses:coinPosePersistence("broadside.coin-poses",persistent),areas:GOLD_AREAS,bankLabels:GOLD_AREAS.map(a=>a.name),relicSlots:WORLD_RELICS,inspectItems:CAVE_ITEMS},
    snapshot:()=>sailingTreasure(progress),
    deliver:id=>{
      // Keep the pending entry in memory if storage refuses the transaction.
      const next=structuredClone(progress);
      if(!deliverChest(next,id))return false;
      if(storage&&!saveProgress(next,storage))throw new Error("Could not save delivered chest");
      Object.assign(progress,next);return true;
    },
  };
}
