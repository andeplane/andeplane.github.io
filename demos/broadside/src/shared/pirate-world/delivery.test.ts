import { describe, expect, it, vi } from "vitest";
import { Delivery } from "./delivery";
import type { PirateAdapter, TreasureState } from "./types";

const fixture=()=>{
  let state:TreasureState={bankGold:[700,0],relics:[],pending:[{id:0,area:0,gold:900},{id:-1,area:1,gold:1000}]};
  const deliver=vi.fn((id:number)=>{
    const chest=state.pending.find(c=>c.id===id);if(!chest)return false;
    const bankGold=[...state.bankGold];bankGold[chest.area]!+=chest.gold;
    state={...state,bankGold,pending:state.pending.filter(c=>c.id!==id)};return true;
  });
  const adapter={snapshot:()=>state,deliver} as unknown as PirateAdapter;
  return {adapter,deliver,set:(next:TreasureState)=>state=next};
};
describe('shared cargo transaction cursor',()=>{
  it('conserves exact gold through preview, two deliveries and duplicate completions',()=>{
    const f=fixture(),d=new Delivery(f.adapter),token=d.start();
    const wealth=()=>{const s=f.adapter.snapshot();return s.bankGold.reduce((a,b)=>a+b,0)+s.pending.reduce((a,b)=>a+b.gold,0);};
    expect(d.preview().bankGold).toEqual([1600,0]);expect(wealth()).toBe(2600);
    expect(d.complete(token,0)).toBe(true);expect(d.complete(token,0)).toBe(false);
    expect(d.preview().bankGold).toEqual([1600,1000]);expect(wealth()).toBe(2600);
    expect(d.complete(token,-1)).toBe(true);expect(d.complete(token,-1)).toBe(false);
    expect(f.deliver.mock.calls).toEqual([[0],[-1]]);expect(wealth()).toBe(2600);
  });
  it('rejects a cancelled or stale animation even when the same chest is retried',()=>{
    const f=fixture(),d=new Delivery(f.adapter),old=d.start();d.cancel();
    expect(d.complete(old,0)).toBe(false);expect(f.deliver).not.toHaveBeenCalled();
    const next=d.start();expect(d.current?.id).toBe(0);expect(d.complete(old,0)).toBe(false);
    expect(d.complete(next,0)).toBe(true);
  });
  it('leaves refused commits pending for a later retry',()=>{
    const f=fixture(),d=new Delivery(f.adapter),token=d.start();f.deliver.mockReturnValueOnce(false);
    expect(()=>d.complete(token,0)).toThrow('could not be saved');expect(d.current?.id).toBe(0);
    expect(f.adapter.snapshot().bankGold).toEqual([700,0]);expect(d.complete(token,0)).toBe(true);
  });
  it.each([0,-1,1001,1.5,NaN])('rejects invalid coin amount %s without delivery',gold=>{
    const f=fixture();f.set({bankGold:[0],relics:[],pending:[{id:1,area:0,gold}]});
    expect(()=>new Delivery(f.adapter).start()).toThrow('Invalid treasure cargo');expect(f.deliver).not.toHaveBeenCalled();
  });
  it('rejects duplicate IDs and invalid areas',()=>{
    const f=fixture();f.set({bankGold:[0],relics:[],pending:[{id:1,area:0,gold:1},{id:1,area:0,gold:1000}]});
    expect(()=>new Delivery(f.adapter).start()).toThrow();
    f.set({bankGold:[0],relics:[],pending:[{id:1,area:1,gold:100}]});expect(()=>new Delivery(f.adapter).start()).toThrow();
  });
});
