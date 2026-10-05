import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
afterEach(()=>{
  vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();
});
describe('live Rapier chest physics',()=>{
  it.each([1,0])('stays idle while closed then empties the full chest with a %s second turn',async(duration)=>{
    vi.resetModules();
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const frames:{poses?:Float32Array;ready?:boolean;turn?:number;error?:string;done?:boolean;resting?:number;empty?:boolean;time?:number;impacts?:number[]}[]=[];
    // Rapier obtains its WASM random seed from self.crypto in a worker.
    const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>frames.push(data)});
    vi.stubGlobal('self',worker);
    await import('./goldPhysics.worker');
    const bytes=readFileSync(new URL('../../public/assets/hoard/chest.bin',import.meta.url));
    const chest=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const pose={position:{x:8,y:.5,z:-5},rotation:{x:0,y:0,z:0,w:1},lid:0};
    await worker.onmessage!({data:{world:0,previous:new Float32Array(),chest,chestY:4.5,floorY:.7,pose}});
    expect(frames.some(f=>f.ready)).toBe(true);expect(frames.filter(f=>f.error)).toEqual([]);
    await worker.onmessage!({data:{pose:{...pose,position:{x:0,y:4.5,z:0},lid:1}}});
    await vi.advanceTimersByTimeAsync(5000);
    expect(frames.filter(f=>f.poses)).toHaveLength(0);
    expect(frames.flatMap(f=>f.impacts??[])).toEqual([]);
    await worker.onmessage!({data:{start:true,duration}});
    for(let i=0;i<22;i++)await vi.advanceTimersByTimeAsync(34);
    const spilling=frames.find(f=>f.turn!>0&&f.turn!<1&&f.poses!.length===7000);
    if(duration)expect(spilling).toBeDefined();
    expect(frames.at(-1)!.poses!.every(Number.isFinite)).toBe(true);
    // All bodies participate together: no staged/burst creation or invented final poses.
    expect(frames.filter(f=>f.poses).every(f=>f.poses!.length===7000)).toBe(true);
    for(let i=0;i<4000&&!frames.at(-1)!.done;i++)await vi.advanceTimersByTimeAsync(34);
    expect(frames.some(f=>f.error)).toBe(false);
    const sounds=frames.flatMap(f=>f.impacts??[]);
    expect(sounds.length).toBeGreaterThan(0);
    expect(sounds.every(s=>Number.isFinite(s)&&s>0&&s<=1)).toBe(true);
    expect(frames.every(f=>(f.impacts?.length??0)<=3)).toBe(true);
    const final=frames.at(-1)!;
    expect(final.done).toBe(true);expect(final.resting).toBe(1000);
    expect(final.poses!.length).toBe(7000);expect(final.poses!.every(Number.isFinite)).toBe(true);
    for(let i=1;i<final.poses!.length;i+=7)expect(final.poses![i]!).toBeLessThan(4);
  },60000);
});
