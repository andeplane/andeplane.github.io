import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
afterEach(()=>{
  vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();
});
describe('live Rapier chest physics',()=>{
  it.each([2.2,0])('stays idle while closed then empties the full chest with a %s second turn',async(duration)=>{
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
  it('finishes successive cave deposits without a last-coin stall',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const load=(name:string)=>{const b=readFileSync(new URL('../../public/assets/hoard/'+name,import.meta.url));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
    const chest=load('chest.bin');let previous=load('world-0/1000.bin');
    for(let batch=0;batch<2;batch++){
      vi.resetModules();
      const frames:{surface?:number[];poses?:Float32Array;ready?:boolean;done?:boolean;resting?:number;time?:number;error?:string}[]=[];
      const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>frames.push(data)});
      vi.stubGlobal('self',worker);await import('./goldPhysics.worker');
      let peak=0;for(let i=1;i<previous.length;i+=7)peak=Math.max(peak,previous[i]!);
      await worker.onmessage!({data:{world:0,previous,surfacePrevious:previous,chest,chestY:peak+3.8}});
      await worker.onmessage!({data:{start:true,duration:2.2}});
      for(let i=0;i<900&&!frames.at(-1)!.done;i++)await vi.advanceTimersByTimeAsync(34);
      const final=frames.at(-1)!;
      expect(frames.some(f=>f.error)).toBe(false);
      expect(final.done,'successive pour '+batch+' with '+final.resting+' resting at '+final.time+' seconds').toBe(true);
      expect(final.time).toBeLessThan(20);expect(final.resting).toBe(1000);
      const tail=frames.find(f=>(f.resting??0)>=976)!;
      expect(final.time!-tail.time!,'last few coins settle promptly').toBeLessThan(4);
      const frameCount=frames.length;await vi.advanceTimersByTimeAsync(1000);expect(frames).toHaveLength(frameCount);
      expect(final.surface!.length).toBeGreaterThan(100);
      expect(final.surface!.length).toBeLessThan(previous.length/7+1000);
      expect(final.surface!.every(i=>i>=0&&i<previous.length/7+1000)).toBe(true);
      const next=new Float32Array(previous.length+7000);next.set(previous);next.set(final.poses!,previous.length);previous=next;
    }
  },60000);

  it('keeps a late floor escape in place instead of emitting it again from the bank centre',async()=>{
    vi.resetModules();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const frames:{poses?:Float32Array;done?:boolean;resting?:number;time?:number;error?:string}[]=[];
    let escaped=false, target:InstanceType<typeof RAPIER.RigidBody>|undefined;
    const recovered:{fixed:boolean;position:{x:number;y:number;z:number}}[]=[];
    const worker=Object.assign(Object.create(globalThis),{onmessage:null as null|((event:{data:unknown})=>Promise<void>),postMessage:(data:typeof frames[number])=>{
      frames.push(data);
      if(data.poses&&target){recovered.push({fixed:target.isFixed(),position:target.translation()});target=undefined;}
    }});
    vi.stubGlobal('self',worker);await import('./goldPhysics.worker');
    const b=readFileSync(new URL('../../public/assets/hoard/chest.bin',import.meta.url));
    const chest=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    await worker.onmessage!({data:{world:0,previous:new Float32Array(),chest,chestY:4.5,floorY:.7}});
    const step=RAPIER.World.prototype.step;
    vi.spyOn(RAPIER.World.prototype,'step').mockImplementation(function(this:InstanceType<typeof RAPIER.World>,...args){
      step.apply(this,args);
      if(!escaped&&(frames.at(-1)?.time??0)>=6) this.forEachRigidBody(body=>{
        if(escaped||!body.isDynamic())return;
        escaped=true;target=body;
        body.setRotation({x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2},false);
        body.setTranslation({x:2.3,y:.3,z:-2.1},true);
      });
    });
    await worker.onmessage!({data:{start:true,duration:2.2}});
    for(let i=0;i<600&&!frames.at(-1)?.done;i++) {
      await vi.advanceTimersByTimeAsync(34);

    }
    // Inspect during postMessage, before a completed worker frees WASM handles.
    expect(recovered).toHaveLength(1);expect(recovered[0]!.fixed).toBe(true);
    expect(recovered[0]!.position.x).toBeCloseTo(2.3);
    expect(recovered[0]!.position.z).toBeCloseTo(-2.1);
    expect(recovered[0]!.position.y).toBeCloseTo(.7+.14+.005);
    expect(escaped).toBe(true);expect(frames.some(f=>f.error)).toBe(false);
    expect(frames.at(-1)?.done).toBe(true);expect(frames.at(-1)?.resting).toBe(1000);
    expect(frames.filter(f=>f.poses).every(f=>f.poses!.length===7000)).toBe(true);
    const poses=frames.at(-1)!.poses!;
    expect(Array.from({length:1000},(_,i)=>i*7).some(i=>Math.abs(poses[i]!-2.3)<.001&&Math.abs(poses[i+2]!+2.1)<.001)).toBe(true);
  },60000);

});
