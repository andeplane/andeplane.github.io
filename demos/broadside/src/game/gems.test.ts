import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { gemCount, gemShape, gemSeeds } from "./gems";
import { GOLD_AREAS } from "./goldAreas";
import { caveFloor } from "../input/caveLayout";

afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const load=(name:string)=>{const b=readFileSync(new URL('../../public/assets/hoard/'+name,import.meta.url));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};

describe("bonus gemstone physics",()=>{
  it("bounds stones independently of arbitrarily large earned balances",()=>{
    expect(gemCount(0)).toBe(0);expect(gemCount(100)).toBe(4);expect(gemCount(1000)).toBe(16);expect(gemCount(1000000)).toBe(32);
    for(let kind=0;kind<4;kind++){
      const shape=gemShape(kind);expect(shape.vertices.every(Number.isFinite)).toBe(true);
      const edges=new Map<string,number>();
      for(let i=0;i<shape.indices.length;i+=3)for(let j=0;j<3;j++){
        const a=shape.indices[i+j]!,b=shape.indices[i+(j+1)%3]!,key=[a,b].sort((x,y)=>x-y).join(':');edges.set(key,(edges.get(key)??0)+1);
      }
      expect([...edges.values()].every(n=>n===2),'closed solid hull for every cut').toBe(true);
    }
  });
  it.each([0,1,2,3])("settles actual convex gems on saved world %s gold and releases its worker",async(world)=>{
    vi.resetModules();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const frames:{poses?:Float32Array;done?:boolean;error?:string}[]=[];
    const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>frames.push(data)});
    vi.stubGlobal('self',worker);await import('./gemPhysics.worker');
    const coins=load(`world-${world}/10000.bin`),before=coins.slice(),area=GOLD_AREAS[world]!;
    const poses=gemSeeds(coins,32,area,caveFloor);
    await worker.onmessage!({data:{poses,coins,area,obstacles:[]}});
    let elapsed=0;for(;elapsed<900&&!frames.at(-1)?.done;elapsed++)await vi.advanceTimersByTimeAsync(34);
    expect(frames.filter(f=>f.error)).toEqual([]);expect(frames.at(-1)?.done,`world ${world}, after ${elapsed} ticks, last second changes: ${JSON.stringify(Array.from({length:32},(_,i)=>({i,p:Array.from(frames.at(-1)?.poses?.slice(i*7,i*7+3)??[]),d:Math.hypot(...[0,1,2].map(k=>(frames.at(-1)?.poses?.[i*7+k]??0)-(frames.at(-31)?.poses?.[i*7+k]??0)))})).filter(p=>p.d>.001))}`).toBe(true);
    const final=frames.at(-1)!.poses!;expect(final.length).toBe(32*7);expect(final.every(Number.isFinite)).toBe(true);
    expect(final.some((n,i)=>i%7===1&&n<poses[i]!-.05),'stones move under gravity').toBe(true);
    for(let p=0;p<final.length;p+=7)expect(final[p+1]).toBeGreaterThanOrEqual(caveFloor(final[p]!+area.x,final[p+2]!+area.z)-.28);
    expect(coins).toEqual(before);
    const n=frames.length;await vi.advanceTimersByTimeAsync(1000);expect(frames.length).toBe(n);
  },60000);
  it("pours gems and coins together and waits for both to settle",async()=>{
    vi.resetModules();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const frames:{poses?:Float32Array;gems?:Float32Array;ready?:boolean;done?:boolean;error?:string}[]=[];
    const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>frames.push(data)});
    vi.stubGlobal('self',worker);await import('./goldPhysics.worker');
    const chest=load('chest.bin');
    await worker.onmessage!({data:{world:0,previous:new Float32Array(),chest,chestY:4.5,floorY:.7,gemGold:1000,gems:new Float32Array()}});
    expect(frames.at(-1)?.ready).toBe(true);
    await worker.onmessage!({data:{start:true,duration:2.2}});
    for(let i=0;i<900&&!frames.at(-1)?.done;i++)await vi.advanceTimersByTimeAsync(34);
    expect(frames.filter(f=>f.error)).toEqual([]);expect(frames.at(-1)?.done).toBe(true);
    expect(frames.at(-1)?.poses?.length).toBe(7000);expect(frames.at(-1)?.gems?.length).toBe(16*7);
    const gems=frames.at(-1)!.gems!;expect(gems.every(Number.isFinite)).toBe(true);
    for(let p=0;p<gems.length;p+=7)expect(gems[p+1]).toBeGreaterThan(.5);
    expect(frames.find(f=>f.gems)?.gems).not.toEqual(gems);
  },60000);
});
