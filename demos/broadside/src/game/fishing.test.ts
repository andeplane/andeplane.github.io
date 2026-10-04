import { describe, expect, it } from 'vitest';
import { Fishing, TREASURE_CHANCE } from './fishing';
import { readProgress, saveProgress } from './progress';
import { awardCatch, awardVoyage, cargoChests, caveProgress, chestWorld, deliverChest, goldTotal, worldGold } from './rewards';
import { levelUnlocked } from './campaign';
const bite=(f:Fishing)=>{expect(f.cast(true)).toBe(true);f.step(.9);f.step(6);expect(f.phase).toBe('bite');};
describe('fishing on a living sea',()=>{
  it('requires a rail, a bite and reeling, and pays a caught chest just once',()=>{
    const f=new Fishing(()=>.05);
    expect(f.cast(false)).toBe(false);expect(f.reel()).toBe(false);expect(f.collect()).toBeNull();
    bite(f);expect(f.cast(true)).toBe(false);expect(f.reel()).toBe(true);expect(f.reel()).toBe(false);
    f.step(1);expect(f.collect()).toBeNull();f.step(.8);
    expect(f.collect()).toEqual({kind:'chest'});expect(f.collect()).toBeNull();
    f.step(3);expect(f.time).toBe(3);f.cancel();expect(f.phase).toBe('idle');
  });
  it('implements the exact ten percent boundary and does not reward missed or cancelled bites',()=>{
    expect(TREASURE_CHANCE).toBe(.1);
    for(const [roll,kind] of [[0,'chest'],[.099999,'chest'],[.1,'fish'],[.99999,'fish']] as const){
      const f=new Fishing(()=>roll);bite(f);f.reel();f.step(1.8);expect(f.collect()?.kind).toBe(kind);
    }
    const f=new Fishing(()=>0);bite(f);f.step(3);expect(f.phase).toBe('idle');expect(f.collect()).toBeNull();
    bite(f);f.reel();f.cancel();f.step(8);expect(f.collect()).toBeNull();
    expect(f.reel()).toBe(false);f.step(-1);f.step(Infinity);f.step(NaN);expect(f.time).toBe(0);
  });
  it('saves fish and mixed chest cargo without unlocking levels, then delivers it once',()=>{
    const p=readProgress();awardVoyage(p,0,3,2);awardCatch(p,'fish',2);awardCatch(p,'chest',2);awardCatch(p,'chest',3);
    expect(p.fishing.fish).toBe(1);expect(levelUnlocked(p.voyages,2)).toBe(false);
    expect(cargoChests(p)).toEqual([0,-1,-2]);expect(chestWorld(p,0)).toBe(0);expect(chestWorld(p,-1)).toBe(2);
    expect(goldTotal(p)).toBe(3000);expect(goldTotal(caveProgress(p))).toBe(0);
    let save='';saveProgress(p,{setItem:(_,v)=>{save=v;}});const loaded=readProgress({getItem:()=>save});
    expect(loaded.fishing).toEqual(p.fishing);
    expect(deliverChest(loaded,-1)).toBe(true);expect(deliverChest(loaded,-1)).toBe(false);
    expect(deliverChest(loaded,-99)).toBe(false);
    expect(worldGold(caveProgress(loaded),2)).toBe(1000);expect(cargoChests(loaded)).toEqual([0,-2]);
    expect(deliverChest(loaded,0)).toBe(true);expect(worldGold(caveProgress(loaded),0)).toBe(1000);
    expect(goldTotal(loaded)).toBe(3000);
  });
  it('migrates older saves and rejects malformed fishing records',()=>{
    expect(readProgress({getItem:()=>'{"campaignVersion":2}'}).fishing).toEqual({fish:0,chests:[]});
    const p=readProgress({getItem:()=>JSON.stringify({campaignVersion:2,fishing:{fish:-2,chests:[null,{world:-1,delivered:false},{world:4,delivered:true},{world:1,delivered:1},{world:2,delivered:false,extra:'drop'}]}})});
    expect(p.fishing).toEqual({fish:0,chests:[{world:2,delivered:false}]});
  });
});
