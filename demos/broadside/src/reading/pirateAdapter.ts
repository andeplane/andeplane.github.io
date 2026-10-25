import { coinPosePersistence, type PirateAdapter } from "../shared/pirate-world";
import { GOLD_AREAS } from "../shared/pirate-world/game/goldAreas";
import { deliverChest, type ReadingProgress } from "./progress";
export function readingAdapter(p:ReadingProgress,commit:(next:ReadingProgress)=>boolean,persistent=true):PirateAdapter {
 return {
  config:{gameId:"captain-reader",sound:false,poses:coinPosePersistence("captain-reader.coin-poses",persistent),areas:GOLD_AREAS,
   bankLabels:p.ui==="nb"?["Norske ord","Engelske ord","Fortellinger","Eventyr"]:["Norwegian words","English words","Stories","Adventures"],relicSlots:[],inspectItems:[0]},
  snapshot:()=>({bankGold:[...p.bank],relics:[],pending:p.cargo.map(c=>({...c}))}),
  deliver:id=>{const next=structuredClone(p);if(!deliverChest(next,id))return false;if(!commit(next))throw Error("Could not save delivered chest");Object.assign(p,next);return true;},
 };
}
