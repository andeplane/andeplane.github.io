import {describe,expect,it,vi,afterEach} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
vi.mock('./coin',async(importOriginal)=>{
  const original=await importOriginal<typeof import('./coin')>();
  return {...original,doubloonMaterial:(scene:Scene)=>new StandardMaterial('test coins',scene)};
});
vi.mock('../game/goldLayout',()=>({loadGoldLayout:vi.fn(),saveGoldLayout:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../game/chestCoins',()=>({chestCoinPoses:vi.fn().mockResolvedValue(new Float32Array(7000))}));
import {CoinHoard} from './coinHoard';
import {loadGoldLayout,saveGoldLayout} from '../game/goldLayout';
class FakeWorker {
  static all:FakeWorker[]=[];
  terminated=false;sent:unknown;messages:unknown[]=[];
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(){FakeWorker.all.push(this);}
  postMessage(value:unknown){this.sent=value;this.messages.push(value);}
  terminate(){this.terminated=true;}
  emit(poses:Float32Array,done:boolean){this.onmessage?.({data:{poses,done,resting:done?1000:0}});}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const poses=()=>{const p=new Float32Array(7000);for(let i=0;i<1000;i++){p[i*7]=i%10*.1;p[i*7+1]=.75+Math.floor(i/100)*.055;p[i*7+6]=1;}return p;};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();FakeWorker.all=[];});
describe('real coin sandbox banks',()=>{
  it('retains frozen poses beyond 10k and sends them back as permanent collision geometry',async()=>{
    vi.stubGlobal('Worker',FakeWorker);
    const engine=new NullEngine(),scene=new Scene(engine);
    const hoard=new CoinHoard(scene,false,undefined,{areas:[{world:0,name:'ship',x:0,z:0,radius:3.8}],floorY:.7,strictPhysics:true});
    for(let batch=0;batch<11;batch++){
      hoard.addBatch(0);hoard.startPour(0);await flush();
      const worker=FakeWorker.all.at(-1)!;
      expect(worker.sent).toMatchObject({world:0,floorY:.7,area:{x:0,z:0,radius:3.8}});
      expect((worker.sent as {previous:Float32Array}).previous.length).toBe(batch*7000);
      if(batch)expect((worker.sent as {previous:Float32Array}).previous.slice(0,7000)).toEqual(poses());
      expect(()=>hoard.addBatch(0)).toThrow('already running');
      worker.emit(poses(),false);hoard.animate(1/60);
      expect(hoard.counts).toEqual([(batch+1)*1000]);expect(hoard.physicsActive).toBe(true);
      worker.emit(poses(),true);await flush();
      expect(hoard.restingCounts).toEqual([(batch+1)*1000]);expect(hoard.physicsActive).toBe(false);expect(worker.terminated).toBe(true);
      const mesh=scene.getMeshByName('ship settled gold coins') as Mesh;
      const upload=vi.spyOn(mesh,'thinInstancePartialBufferUpdate');
      hoard.animate(2);expect(upload).not.toHaveBeenCalled();upload.mockRestore();
    }
    expect(loadGoldLayout).not.toHaveBeenCalled();
    expect(saveGoldLayout).toHaveBeenLastCalledWith(0,expect.any(Float32Array),false);
    scene.dispose();engine.dispose();
  });
  it('warms physics during carrying, sends chest motion, and waits for readiness before tilting',async()=>{
    vi.stubGlobal('Worker',FakeWorker);
    const engine=new NullEngine(),scene=new Scene(engine);
    const h=new CoinHoard(scene,false,undefined,{areas:[{world:0,name:'ship',x:2,z:3,radius:3.8}],floorY:.7,strictPhysics:true});
    h.addBatch(0);
    h.carryChest(0,new Vector3(3,2,4),Vector3.Zero(),0,1/60);
    h.preparePour(0);await flush();
    const worker=FakeWorker.all[0]!;
    expect(worker.messages).toHaveLength(1);
    expect(worker.sent).toMatchObject({chestY:4.5,pose:{position:{x:1,y:2,z:1},rotation:{x:0,y:0,z:0,w:1},lid:0}});
    h.carryChest(0,new Vector3(3.1,2.2,4),Vector3.Zero(),.5,1/30);
    expect(worker.sent).toMatchObject({pose:{position:{x:expect.closeTo(1.1),y:2.2,z:1},lid:.5}});
    h.startPour(0,1);expect(worker.messages.some(m=>(m as {start?:boolean}).start)).toBe(false);
    worker.onmessage?.({data:{ready:true}});
    expect(worker.sent).toEqual({start:true,duration:1});expect(h.pouring(0).physicsReady).toBe(true);
    h.preparePour(0);h.startPour(0,1);expect(FakeWorker.all).toHaveLength(1);
    const length=worker.messages.length;
    h.carryChest(0,Vector3.Zero(),Vector3.Zero(),1,1);
    expect(worker.messages).toHaveLength(length);
    scene.dispose();engine.dispose();
  });
  it('reports failed physics without substituting baked results, and terminates workers on reset',async()=>{
    vi.stubGlobal('Worker',FakeWorker);
    const engine=new NullEngine(),scene=new Scene(engine),h=new CoinHoard(scene,false,undefined,{strictPhysics:true});
    h.addBatch(0);h.startPour(0);await flush();
    FakeWorker.all[0]!.onerror?.();expect(h.pouring(0).error).toMatch('failed');expect(loadGoldLayout).not.toHaveBeenCalled();
    h.addBatch(1);h.startPour(1);await flush();const running=FakeWorker.all[1]!;
    scene.dispose();expect(running.terminated).toBe(true);engine.dispose();
  });
});
