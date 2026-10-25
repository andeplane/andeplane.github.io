import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReserve, reservePlan, readGoldReserve, saveGoldReserve, GOLD_PILE_CAPACITY } from '../shared/pirate-world/game/goldReserve';
afterEach(()=>vi.unstubAllGlobals());
describe('gold reserve without monetary caps',()=>{
  it.each([0,100,900,10000,10100,1000000,900000000])('contains a %s-gold fortune and preserves every unit of value',gold=>{
    const plan=reservePlan(gold);expect(plan.pile+plan.reserve).toBe(gold);expect(plan.pile).toBeLessThanOrEqual(GOLD_PILE_CAPACITY);expect(plan.reserve).toBe(defaultReserve(gold));
  });
  it('secures an old full pile before pouring every coin of the next actual chest',()=>{
    expect(reservePlan(10400,900,0)).toEqual({reserve:9500,pile:900,archived:true});
    expect(reservePlan(11300,900,9500)).toEqual({reserve:9500,pile:1800,archived:false});
    expect(reservePlan(1000900,900,990000)).toEqual({reserve:1000000,pile:900,archived:true});
  });
  it('preserves the irregular reserve across revisits, isolates games, and retains the prior committed snapshot',()=>{
    const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    saveGoldReserve(0,10400,9500,true,'math');saveGoldReserve(0,11300,9500,true,'math');
    expect(readGoldReserve(0,10400,true,'math')).toBe(9500);expect(readGoldReserve(0,11300,true,'math')).toBe(9500);
    expect(readGoldReserve(0,10400,true,'sailing')).toBe(10000);
    expect(readGoldReserve(0,10400,false,'math')).toBe(10000);
    const k=[...data.keys()][0]!;data.set(k,JSON.stringify([{gold:10400,reserve:-1}]));expect(readGoldReserve(0,10400,true,'math')).toBe(10000);
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}});
    expect(readGoldReserve(0,10400,true)).toBe(10000);expect(()=>saveGoldReserve(0,10400,9500,true)).not.toThrow();
  });
  it('rejects invalid amounts rather than manufacturing currency',()=>{
    for(const gold of [-1,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])expect(()=>reservePlan(gold)).toThrow();
    expect(()=>reservePlan(100,200)).toThrow();
  });
});
