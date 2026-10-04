import {describe,expect,it} from 'vitest';
import {CoinDebugQueue,CoinFrameSamples,coinDebugLocation} from './debugCoins';

describe('coin sandbox scheduling',()=>{
  it('routes bare/valued production URLs without depending on QA mode',()=>{
    expect(coinDebugLocation(new URLSearchParams('debugcoins'))).toBe('cave');
    expect(coinDebugLocation(new URLSearchParams('debugcoins=ship&mute=true'))).toBe('ship');
    expect(coinDebugLocation(new URLSearchParams('qa=collection'))).toBeNull();
  });
  it('queues repeated taps and accumulates exact batches without interrupting a pour',()=>{
    const q=new CoinDebugQueue();
    for(let i=0;i<12;i++) expect(q.enqueue(2)).toBe(true);
    for(let i=0;i<12;i++){
      expect(q.start(2,i*20000)).toBe(true);expect(q.start(2,1)).toBe(false);
      expect(q.busy).toBe(true);
      expect(q.complete(i*20000+18000)).toEqual({world:2,coins:(i+1)*1000,seconds:18});
    }
    expect(q.totals).toEqual([0,0,12000,0]);expect(q.busy).toBe(false);
    expect(q.complete(0)).toBeNull();expect(q.start(0,0)).toBe(false);
    expect(q.enqueue(1)).toBe(true);expect(q.start(1,0)).toBe(true);
    q.complete(1000);expect(q.totals).toEqual([0,1000,12000,0]);
  });
  it('bounds queued allocations and stops honestly on physics failure',()=>{
    const q=new CoinDebugQueue();
    expect(q.enqueue(-1)).toBe(false);expect(q.enqueue(4)).toBe(false);expect(q.enqueue(.5)).toBe(false);
    for(let i=0;i<100;i++) expect(q.enqueue(0)).toBe(true);
    expect(q.enqueue(0)).toBe(false);
    q.start(0,0);q.fail('worker failed');
    expect(q.busy).toBe(false);expect(q.error).toBe('worker failed');
    expect(q.totals[0]).toBe(0);expect(q.enqueue(0)).toBe(false);expect(q.start(0,0)).toBe(false);
  });
});
describe('coin sandbox measurements',()=>{
  it('reports frame stalls separately from render CPU cost over a bounded window',()=>{
    const samples=new CoinFrameSamples();expect(samples.values).toEqual({fps:0,p95:0,render:0});
    samples.add(NaN,2);samples.add(0,2);samples.add(10,-1);
    for(let i=0;i<120;i++)samples.add(i<12?100:20,5);
    expect(samples.values.fps).toBeCloseTo(1000/28);expect(samples.values.p95).toBe(100);expect(samples.values.render).toBe(5);
    for(let i=0;i<120;i++)samples.add(20,3);
    expect(samples.values).toEqual({fps:50,p95:20,render:3});
  });
});
