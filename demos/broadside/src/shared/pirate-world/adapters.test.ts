import { describe, expect, it, vi } from "vitest";
import { sailingAdapter } from "../../game/pirateAdapter";
import { readProgress } from "../../game/progress";
import { awardCatch, awardVoyage, goldTotal as sailingGold } from "../../game/rewards";
import { calculusAdapter } from "../../math/pirateAdapter";
import { answerQuestion, freshProgress, goldTotal, questionsFor, startVoyage, readMathProgress, saveMathProgress } from "../../math/academy";

const storage=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}} as Storage & {values:Map<string,string>};};
const mathCargo=()=>{
  const p=freshProgress(),run=startVoyage(p,'add-10',1,19)!;
  const qs=questionsFor('add-10',run.seed,run.questionSet);answerQuestion(p,'add-10',1,qs[0]!.answer+1);
  for(const q of qs)answerQuestion(p,'add-10',1,q.answer);return p;
};
describe('game ledger adapters',()=>{
  it('preserves sailing campaign/fishing IDs and credits each once in the old save namespace',()=>{
    const saved=storage(),p=readProgress();awardVoyage(p,0,3,2);awardCatch(p,'chest',2);
    const a=sailingAdapter(p,saved,false),wealth=sailingGold(p);
    expect(a.snapshot().pending).toEqual([{id:0,area:0,gold:1000},{id:-1,area:2,gold:1000}]);
    expect(a.deliver(0)).toBe(true);expect(a.deliver(0)).toBe(false);expect(a.deliver(-1)).toBe(true);
    expect(a.snapshot().bankGold).toEqual([1000,0,1000,0]);expect(sailingGold(p)).toBe(wealth);
    const loaded=sailingAdapter(readProgress(saved),undefined,false);expect(loaded.snapshot()).toEqual(a.snapshot());
    expect([...saved.values.keys()]).toEqual(['broadside.v1']);
  });
  it('preserves the actual 900-gold math chest and independent namespaces after save/reload',()=>{
    const saved=storage(),math=mathCargo(),sailing=readProgress();awardVoyage(sailing,0,3,2);
    const before=structuredClone(sailing),a=calculusAdapter(math,false,next=>saveMathProgress(next,saved));
    const chest=a.snapshot().pending[0]!;expect(chest.gold).toBe(900);const wealth=goldTotal(math);
    expect(a.deliver(chest.id)).toBe(true);expect(a.deliver(chest.id)).toBe(false);
    expect(goldTotal(math)).toBe(wealth);expect(a.snapshot().bankGold).toEqual([900,0,0,0]);
    expect(calculusAdapter(readMathProgress(saved),false).snapshot()).toEqual(a.snapshot());
    expect(sailing).toEqual(before);expect(saved.values.has('broadside.v1')).toBe(false);
    expect(a.config.poses.namespace).not.toBe(sailingAdapter(sailing,undefined,false).config.poses.namespace);
  });
  it('keeps both ledgers unchanged when persistence refuses delivery',()=>{
    const sailing=readProgress();awardVoyage(sailing,0,3,2);const before=structuredClone(sailing);
    const fail={setItem:()=>{throw new Error('quota');}} as unknown as Storage;
    expect(()=>sailingAdapter(sailing,fail,false).deliver(0)).toThrow('save');expect(sailing).toEqual(before);
    const math=mathCargo(),old=structuredClone(math),commit=vi.fn(()=>false),a=calculusAdapter(math,false,commit);
    expect(()=>a.deliver(a.snapshot().pending[0]!.id)).toThrow('save');expect(math).toEqual(old);
  });
  it('retains legacy sailing treasure and legacy math migration without repricing',()=>{
    const sailing=readProgress({getItem:()=>JSON.stringify({campaignVersion:2,voyages:{0:{stars:2,gems:1}},relics:[2]})});
    expect(sailingAdapter(sailing,undefined,false).snapshot().bankGold[0]).toBe(1000);
    const math=mathCargo();const a=calculusAdapter(math,false);const id=a.snapshot().pending[0]!.id;
    a.deliver(id);const loaded=readMathProgress({getItem:()=>JSON.stringify(math)});
    expect(loaded.banks.add).toBe(900);expect(calculusAdapter(loaded,false).snapshot().pending).toEqual([]);
  });
});
