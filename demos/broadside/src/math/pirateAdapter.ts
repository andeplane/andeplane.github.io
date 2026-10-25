import { bankGold, deliverMathChest, pendingMathChests, OPERATORS, type MathProgress } from "./academy";
import { GOLD_AREAS } from "../shared/pirate-world/game/goldAreas";
import { coinPosePersistence } from "../shared/pirate-world/persistence";
import type { PirateAdapter } from "../shared/pirate-world/types";

export function calculusAdapter(progress: MathProgress, persistent=true, commit:(next:MathProgress)=>boolean=()=>true): PirateAdapter {
  return {
    config:{sound:false,theme:{fog:"#07111c"},gameId:"captain-calculus",poses:coinPosePersistence("captain-calculus.coin-poses",persistent),areas:GOLD_AREAS,bankLabels:OPERATORS.map(o=>o.name),relicSlots:[],inspectItems:[0]},
    snapshot:()=>({bankGold:bankGold(progress),relics:[],pending:pendingMathChests(progress).map(c=>({id:c.id,area:OPERATORS.findIndex(o=>o.id===c.operator),gold:c.gold}))}),
    deliver:id=>{
      const next=structuredClone(progress);
      if(!deliverMathChest(next,id))return false;
      if(!commit(next))throw new Error("Could not save delivered chest");
      Object.assign(progress,next);return true;
    },
  };
}
