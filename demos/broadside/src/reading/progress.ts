import { CONTENT_VERSION, itemsFor, packFor, type Language, type ReadingItem } from "./content";
import { Rng } from "../sim/rng";
export const SAVE_KEY="broadside.reading.v1";
export type Evidence="independent"|"self"|"helped"|"adult";
export interface Run {id:number;level:number;language:Language;pack:number;items:ReadingItem[];index:number;chunk:number;helped:boolean;selfConfirmed?:boolean;evidence:Evidence[];value:number;rewardVersion:1;contentVersion:number;}
export interface Track {cleared:number;seed:number;run?:Run;}
export interface ReadingCargo {id:number;area:number;gold:number;}
export interface ReadingProgress {version:1;language:Language;ui:Language;chosen:boolean;nextRun:number;nextChest:number;bank:number[];cargo:ReadingCargo[];tracks:Record<string,Track>;practised:number;assisted:number;}
export const freshProgress=(language:Language="en"):ReadingProgress=>({version:1,language,ui:language,chosen:false,nextRun:1,nextChest:1,bank:[0,0,0,0],cargo:[],tracks:{},practised:0,assisted:0});
export const trackKey=(language:Language,pack:number)=>`${language}-${pack}`;
export const banked=(p:ReadingProgress)=>p.bank.reduce((sum,n)=>sum+n,0);
export const aboard=(p:ReadingProgress)=>p.cargo.reduce((sum,c)=>sum+c.gold,0);
export function startRun(p:ReadingProgress,language:Language,packId:number,level:number,seed:number,replay=false):Run|null {
 const pack=packFor(packId);if(pack.id!==packId||!Number.isSafeInteger(level)||level<1)return null;
 const key=trackKey(language,packId),track=p.tracks[key]??={cleared:0,seed:seed>>>0};
 if(level>track.cleared+1)return null;
 if(track.run)return track.run;
 const bank=itemsFor(language,packId),start=(level-1)*pack.count,cycle=Math.floor(start/bank.length);
 const shuffle=(cycleIndex:number)=>{const random=new Rng(replay?seed>>>0:(track.seed+cycleIndex*7919)>>>0),bag=[...bank];for(let n=bag.length-1;n>0;n--){const j=random.int(0,n);[bag[n],bag[j]]=[bag[j]!,bag[n]!];}return bag;};
 const bag=shuffle(cycle);if(!replay&&cycle>0&&bag[0]!.id===shuffle(cycle-1).at(-1)!.id)[bag[0],bag[1]]=[bag[1]!,bag[0]!];
 const items=Array.from({length:pack.count},(_,i)=>structuredClone(bag[(start+i)%bag.length]!));
 return track.run={id:p.nextRun++,level,language,pack:packId,items,index:0,chunk:0,helped:false,evidence:[],value:pack.gold/pack.count,rewardVersion:1,contentVersion:CONTENT_VERSION};
}
export function currentItem(run:Run):ReadingItem {return run.items[run.index]!;}
export function currentText(run:Run):string {return currentItem(run).chunks[run.chunk]!;}
export function completeChunk(p:ReadingProgress,run:Run,identity:{id:number;index:number;chunk:number},source:Evidence):{accepted:boolean;itemComplete:boolean;levelComplete:boolean;gold:number}{
 const track=p.tracks[trackKey(run.language,run.pack)];
 if(track?.run!==run||run.id!==identity.id||run.index!==identity.index||run.chunk!==identity.chunk)return {accepted:false,itemComplete:false,levelComplete:false,gold:0};
 if(source==="adult"||source==="helped")run.helped=true;
 if(source==="self")run.selfConfirmed=true;
 run.chunk++;
 if(run.chunk<currentItem(run).chunks.length)return {accepted:true,itemComplete:false,levelComplete:false,gold:0};
 run.evidence.push(source==="adult"?"adult":run.helped?"helped":run.selfConfirmed?"self":"independent");
 p.practised++;if(run.helped)p.assisted++;
 run.index++;run.chunk=0;run.helped=false;run.selfConfirmed=false;
 const levelComplete=run.index===run.items.length;
 if(levelComplete){p.cargo.push({id:p.nextChest++,area:run.language==="nb"?0:1,gold:run.value*run.items.length});track.cleared=Math.max(track.cleared,run.level);delete track.run;}
 return {accepted:true,itemComplete:true,levelComplete,gold:run.value};
}
export function deliverChest(p:ReadingProgress,id:number):boolean {
 const index=p.cargo.findIndex(c=>c.id===id);if(index<0)return false;
 const c=p.cargo[index]!;p.bank[c.area]=(p.bank[c.area]??0)+c.gold;p.cargo.splice(index,1);return true;
}
export function saveProgress(p:ReadingProgress,storage?:Pick<Storage,"setItem">):boolean {try{if(!storage)return false;const text=JSON.stringify(p);if(text.length>1_000_000)return false;storage.setItem(SAVE_KEY,text);return true;}catch{return false;}}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const lang=(v:unknown):v is Language=>v==="nb"||v==="en";
function validItem(v:unknown):v is ReadingItem {
 if(!obj(v)||typeof v.id!=="string"||v.id.length>80||typeof v.text!=="string"||v.text.length>1600||!Array.isArray(v.chunks)||v.chunks.length<1||v.chunks.length>20||!v.chunks.every(c=>typeof c==="string"&&c.length>0&&c.length<=500))return false;
 if(v.question!==undefined){const q=v.question;if(!obj(q)||typeof q.text!=="string"||q.text.length>200||!Array.isArray(q.answers)||q.answers.length!==3||!q.answers.every(a=>typeof a==="string"&&a.length<=100)||!int(q.correct,0,2))return false;}
 return true;
}
export function readProgress(storage?:Pick<Storage,"getItem">,fallback:Language="en"):{progress:ReadingProgress;warning:boolean}{
 try{
  const text=storage?.getItem(SAVE_KEY);if(!text)return {progress:freshProgress(fallback),warning:false};if(text.length>1_000_000)throw Error("save too large");
  const v:unknown=JSON.parse(text);
  if(!obj(v)||v.version!==1||!lang(v.language)||!lang(v.ui)||typeof v.chosen!=="boolean"||!int(v.nextRun,1)||!int(v.nextChest,1)||!int(v.practised)||!int(v.assisted,0,v.practised)||!Array.isArray(v.bank)||v.bank.length!==4||!v.bank.every(n=>int(n))||!Array.isArray(v.cargo)||!obj(v.tracks))throw Error("invalid save");
  const cargo:ReadingCargo[]=[],ids=new Set<number>();
  for(const c of v.cargo){if(!obj(c)||!int(c.id,1,v.nextChest-1)||ids.has(c.id)||!int(c.area,0,1)||!int(c.gold,100,1000)||c.gold%100)throw Error("invalid cargo");ids.add(c.id);cargo.push({id:c.id,area:c.area,gold:c.gold});}
  const p=freshProgress(v.language);Object.assign(p,{ui:v.ui,chosen:v.chosen,nextRun:v.nextRun,nextChest:v.nextChest,bank:[...v.bank],cargo,practised:v.practised,assisted:v.assisted});
  for(const [key,t] of Object.entries(v.tracks)){
   const match=/^(nb|en)-(10|[1-9])$/.exec(key);if(!match||!obj(t)||!int(t.cleared)||!int(t.seed,0,0xffffffff))throw Error("invalid track");
   const track:Track={cleared:t.cleared,seed:t.seed};p.tracks[key]=track;
   if(t.run!==undefined){const r=t.run,pack=packFor(Number(match[2]));
    if(!obj(r)||r.language!==match[1]||r.pack!==pack.id||!int(r.id,1,p.nextRun-1)||!int(r.level,1,track.cleared+1)||!Array.isArray(r.items)||r.items.length!==pack.count||!r.items.every(validItem)||new Set(r.items.map(i=>i.id)).size!==r.items.length||!int(r.index,0,r.items.length-1)||!int(r.chunk,0,r.items[r.index]!.chunks.length-1)||typeof r.helped!=="boolean"||(r.selfConfirmed!==undefined&&typeof r.selfConfirmed!=="boolean")||!Array.isArray(r.evidence)||r.evidence.length!==r.index||!r.evidence.every(e=>["independent","self","helped","adult"].includes(e))||r.value!==pack.gold/pack.count||r.rewardVersion!==1||(r.contentVersion!==undefined&&!int(r.contentVersion,1,CONTENT_VERSION)))throw Error("invalid run");
    track.run=r as unknown as Run;track.run.contentVersion??=CONTENT_VERSION;
   }
  }
  return {progress:p,warning:false};
 }catch{return {progress:freshProgress(fallback),warning:true};}
}
