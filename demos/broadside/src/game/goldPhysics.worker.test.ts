import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {CARRY_COINS} from './coinPour';
afterEach(()=>{
  vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();
});
describe('live Rapier chest physics',()=>{
  it.each([1,0])('jostles carried coins and empties all coins with a %s second turn',async(duration)=>{
    vi.resetModules();
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const frames:{poses?:Float32Array;ready?:boolean;turn?:number;error?:string;done?:boolean;resting?:number}[]=[];
    // Rapier obtains its WASM random seed from self.crypto in a worker.
    const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>frames.push(data)});
    vi.stubGlobal('self',worker);
    await import('./goldPhysics.worker');
    const bytes=readFileSync(new URL('../../public/assets/hoard/chest.bin',import.meta.url));
    const chest=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const pose={position:{x:8,y:.5,z:-5},rotation:{x:0,y:0,z:0,w:1},lid:0};
    await worker.onmessage!({data:{world:0,previous:new Float32Array(),chest,chestY:4.5,floorY:.7,pose}});
    expect(frames.some(f=>f.ready)).toBe(true);expect(frames.filter(f=>f.error)).toEqual([]);
    const first=frames.find(f=>f.poses)!.poses!.slice();expect(first.length).toBe(CARRY_COINS*7);
    await worker.onmessage!({data:{pose:{...pose,position:{x:8.08,y:.55,z:-5}}}});
    for(let i=0;i<8;i++)await vi.advanceTimersByTimeAsync(34);
    const carried=frames.at(-1)!;
    expect(carried.turn).toBe(0);expect(carried.poses!.length).toBe(CARRY_COINS*7);
    expect(carried.poses).not.toEqual(first);
    // Travel from outside the bank, then lift the chest before tipping.
    for(let i=0;i<=90;i++){
      const t=i/90;
      await worker.onmessage!({data:{pose:{...pose,position:{x:8*(1-t),y:.5+4*t,z:-5*(1-t)}}}});
      await vi.advanceTimersByTimeAsync(34);
    }
    const arrival=frames.at(-1)!.poses!;
    for(let i=0;i<arrival.length;i+=7){
      expect(Math.abs(arrival[i]!)).toBeLessThan(2);
      expect(Math.abs(arrival[i+2]!)).toBeLessThan(1.3);
      expect(arrival[i+1]!).toBeGreaterThan(4.5);
    }
    await worker.onmessage!({data:{start:true,duration}});
    for(let i=0;i<22;i++)await vi.advanceTimersByTimeAsync(34);
    const spilling=frames.find(f=>f.turn!>0&&f.turn!<1&&f.poses!.length>CARRY_COINS*7);
    if(duration)expect(spilling).toBeDefined();
    expect(frames.at(-1)!.poses!.every(Number.isFinite)).toBe(true);
    // Carrying does not lose the buried coins; all 1,000 become permanent poses.
    for(let i=0;i<2000&&!frames.at(-1)!.done;i++)await vi.advanceTimersByTimeAsync(34);
    expect(frames.some(f=>f.error)).toBe(false);
    const final=frames.at(-1)!;
    expect(final.done).toBe(true);expect(final.resting).toBe(1000);
    expect(final.poses!.length).toBe(7000);expect(final.poses!.every(Number.isFinite)).toBe(true);
    for(let i=1;i<final.poses!.length;i+=7)expect(final.poses![i]!).toBeLessThan(4);
  },30000);
});
