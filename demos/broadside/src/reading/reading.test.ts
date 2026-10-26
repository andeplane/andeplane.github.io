import { describe,it,expect } from "vitest";
import {itemsFor,PACKS,preferredLanguage,matches} from "./content";
import {freshProgress,startRun,currentText,completeChunk,readProgress,saveProgress,deliverChest,trackKey,SAVE_KEY} from "./progress";
import {ReadingAttempt,hearsTarget} from "./recognition";
import {readingAdapter} from "./pirateAdapter";
const finish=(p:ReturnType<typeof freshProgress>,r:NonNullable<ReturnType<typeof startRun>>)=>{while(p.tracks[trackKey(r.language,r.pack)]?.run){const out=completeChunk(p,r,{id:r.id,index:r.index,chunk:r.chunk},"independent");expect(out.accepted).toBe(true);}};
describe("reading content",()=>{
 it("has ten independently populated packs in each language with rising capped rewards",()=>{
  expect(PACKS.map(p=>p.kind)).toEqual([...Array(5).fill("word"),...Array(3).fill("sentence"),...Array(2).fill("paragraph")]);
  for(const language of ["nb","en"] as const)for(const p of PACKS){const bank=itemsFor(language,p.id);expect(bank).toHaveLength(50);expect(new Set(bank.map(i=>i.text)).size).toBe(50);expect(bank.every(i=>i.chunks.join(" ")===i.text)).toBe(true);expect(p.gold).toBe(p.id*100);expect(p.gold/p.count).toBeGreaterThan(0);expect(p.gold).toBeLessThanOrEqual(1000);}
 });
 it("uses ordered language preferences and respects language variants",()=>{expect(preferredLanguage(["fr-FR","nb-NO","en"])).toBe("nb");expect(preferredLanguage(["en-US","nb"])).toBe("en");expect(preferredLanguage(["nn-NO"])).toBe("nb");expect(preferredLanguage(["de"])).toBe("en");});
 it("normalizes punctuation and case without erasing Norwegian sounds or accepting near matches",()=>{expect(matches(" BÅT! ","båt")).toBe(true);expect(matches("bat","båt")).toBe(false);expect(matches("not cat","cat")).toBe(false);expect(matches("hat","cat")).toBe(false);expect(matches("10","ten")).toBe(true);expect(matches("2","to","nb")).toBe(true);expect(matches("one","en","nb")).toBe(false);expect(matches("en","one","en")).toBe(false);expect(matches("ett","et","nb")).toBe(true);expect(matches("near the harbor","near the harbour")).toBe(true);expect(matches("1","et")).toBe(false);expect(matches("The cat is on the ship.","the cat is on the ship")).toBe(true);});
});
describe("voyages and rewards",()=>{
 it("exposes a whole word bank over five levels, resumes frozen prompts, and replays safely",()=>{
  const p=freshProgress("nb"),seen=new Set<string>();
  for(let level=1;level<=5;level++){const r=startRun(p,"nb",1,level,42)!;expect(new Set(r.items.map(i=>i.id)).size).toBe(10);for(const item of r.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);}finish(p,r);}
  expect(seen.size).toBe(50);expect(p.cargo.map(c=>c.gold)).toEqual([100,100,100,100,100]);
  const r=startRun(p,"nb",1,6,12)!;expect(startRun(p,"nb",1,1,123,true)).toBe(r);
  const store=new Map<string,string>();saveProgress(p,{setItem:(k,v)=>{store.set(k,v);}});const loaded=readProgress({getItem:k=>store.get(k)??null});expect(loaded.warning).toBe(false);expect(loaded.progress.tracks["nb-1"]!.run!.items).toEqual(r.items);
 });
 it("awards exactly one chest at the level rate across all ten packs and both languages",()=>{for(const language of ["nb","en"] as const)for(const pack of PACKS){const p=freshProgress(language),r=startRun(p,language,pack.id,1,9)!;finish(p,r);expect(p.cargo).toEqual([{id:1,area:language==="nb"?0:1,gold:pack.gold}]);expect(p.practised).toBe(pack.count);expect(deliverChest(p,1)).toBe(true);expect(deliverChest(p,1)).toBe(false);expect(p.bank.reduce((a,b)=>a+b,0)).toBe(pack.gold);}});
 it("does not award twice for a stale prompt, and keeps chunk progress before an interruption",()=>{
  const p=freshProgress(),r=startRun(p,"en",9,1,33)!,id={id:r.id,index:0,chunk:0};expect(currentText(r)).toBeTruthy();
  expect(completeChunk(p,r,id,"adult")).toMatchObject({accepted:true,itemComplete:false,gold:0});expect(r.chunk).toBe(1);expect(completeChunk(p,r,id,"independent").accepted).toBe(false);expect(p.cargo).toHaveLength(0);finish(p,r);expect(p.cargo[0]!.gold).toBe(900);expect(p.assisted).toBe(1);
 });
 it("preserves unfinished saves created by the first installed test build",()=>{
  const p=freshProgress("nb"),r=startRun(p,"nb",1,1,61)!;completeChunk(p,r,{id:r.id,index:0,chunk:0},"adult");
  const old=JSON.parse(JSON.stringify(p));delete old.tracks["nb-1"].run.contentVersion;
  const restored=readProgress({getItem:()=>JSON.stringify(old)});expect(restored.warning).toBe(false);expect(restored.progress.tracks["nb-1"]!.run!.index).toBe(1);expect(restored.progress.tracks["nb-1"]!.run!.contentVersion).toBe(1);
 });
 it("rejects malformed or duplicate-cargo saves and never touches another game's save",()=>{
  const p=freshProgress();p.cargo=[{id:1,area:0,gold:100},{id:1,area:0,gold:100}];p.nextChest=2;
  const keys:string[]=[];expect(readProgress({getItem:key=>{keys.push(key);return JSON.stringify(p);}}).warning).toBe(true);expect(keys).toEqual([SAVE_KEY]);expect(readProgress({getItem:()=>"{broken"}).warning).toBe(true);expect(saveProgress(freshProgress(),{setItem:()=>{throw Error("full");}})).toBe(false);
 });
 it("journals shared-library delivery before changing the live ledger",()=>{
  const p=freshProgress("nb"),r=startRun(p,"nb",1,1,77)!;finish(p,r);
  const bad=readingAdapter(p,()=>false,false);expect(()=>bad.deliver(1)).toThrow();expect(p.cargo).toHaveLength(1);expect(p.bank[0]).toBe(0);
  const good=readingAdapter(p,()=>true,false);expect(good.deliver(1)).toBe(true);expect(good.deliver(1)).toBe(false);expect(p.bank[0]).toBe(100);expect(good.config.poses.namespace).toBe("captain-reader.coin-poses");
 });
});
describe("recognition lifetime",()=>{
 it("accepts live matching speech without Finish, while ignoring unfinished or wrong readings",()=>{
  const a=new ReadingAttempt(),token=a.begin("cat");a.listening(token);
  expect(a.transcript(token,"ca",false)).toBe(false);expect(a.state).toBe("listening");
  expect(a.transcript(token,"hat",true)).toBe(false);expect(a.state).toBe("listening");
  expect(a.transcript(token,"hat cat",false)).toBe(true);expect(a.state).toBe("accepted");
  expect(a.transcript(token,"cat",true)).toBe(false);
 });
 it("rejects stale/cancelled speech and incomplete sentences, preserving Norwegian sounds",()=>{
  const a=new ReadingAttempt(),old=a.begin("cat");a.listening(old);a.cancel();
  expect(a.transcript(old,"cat",false)).toBe(false);const token=a.begin("the cat is on the ship");a.listening(token);
  expect(a.transcript(token,"the cat is",false)).toBe(false);expect(a.transcript(old,"cat",true)).toBe(false);
  expect(a.transcript(token,"the cat is on the ship",false)).toBe(true);
  expect(hearsTarget("catfish","cat","en")).toBe(false);expect(hearsTarget("bat","båt","nb")).toBe(false);
  expect(hearsTarget("båt","båt","nb")).toBe(true);expect(hearsTarget("one","en","nb")).toBe(false);
 });
 it("remembers self-confirmation across sentence resume without calling it recognized speech",()=>{
  const p=freshProgress(),r=startRun(p,"en",10,1,15)!;
  completeChunk(p,r,{id:r.id,index:0,chunk:0},"self");
  const restored=readProgress({getItem:()=>JSON.stringify(p)});expect(restored.warning).toBe(false);
  const resumed=restored.progress.tracks["en-10"]!.run!;
  while(resumed.index===0)completeChunk(restored.progress,resumed,{id:resumed.id,index:resumed.index,chunk:resumed.chunk},"independent");
  expect(resumed.evidence).toEqual(["self"]);expect(restored.progress.assisted).toBe(0);
 });
 it("persists self-confirmed practice with the same gold, without labelling it adult-assisted",()=>{
  const p=freshProgress(),r=startRun(p,"en",1,1,91)!;
  const identity={id:r.id,index:0,chunk:0};completeChunk(p,r,identity,"self");
  expect(completeChunk(p,r,identity,"independent").accepted).toBe(false);
  expect(r.evidence).toEqual(["self"]);expect(p.practised).toBe(1);expect(p.assisted).toBe(0);
  const restored=readProgress({getItem:()=>JSON.stringify(p)});expect(restored.warning).toBe(false);
  expect(restored.progress.tracks["en-1"]!.run!.evidence).toEqual(["self"]);
  finish(p,r);expect(p.cargo[0]!.gold).toBe(100);
 });
});
