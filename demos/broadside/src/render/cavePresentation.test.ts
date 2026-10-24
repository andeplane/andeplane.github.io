import {afterEach,describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Vector3, Matrix} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
vi.mock('./cavern',()=>({Cavern:class {
  stone:StandardMaterial;ledge:StandardMaterial;gold:StandardMaterial;wood:StandardMaterial;iron:StandardMaterial;
  obstacles=[];lamps=[];shadow={addShadowCaster:vi.fn()};
  constructor(private scene:Scene){this.stone=this.ledge=this.gold=this.wood=this.iron=new StandardMaterial('test rock',scene);}
  rock(name:string,position:Vector3,scale:Vector3){const r=MeshBuilder.CreateBox(name,{height:1.1},this.scene);r.position.copyFrom(position);r.scaling.copyFrom(scale);return r;}
  animate(){}walkHeight(){return 0;}
}}));
vi.mock('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js',()=>({DefaultRenderingPipeline:class {imageProcessing={};}}));
const pourState=vi.hoisted(()=>({spawned:0,empty:false,done:false,withdraw:0,chestY:3.8}));
vi.mock('./coinHoard',()=>({CoinHoard:class {
  counts=[0,0,0,0];restingCounts=[0,0,0,0];physicsActive=false;
  addBatch(){}startPour(){}preparePour(){}carryChest(){}finishPours(){}animate(){}walkHeight(){return 0;}
  pouring(){return {ready:true,physicsReady:true,turn:0,...pourState,active:false,error:null};}
  center(world:number){return new Vector3(world===3?28:world===1?8:-8,.2,world>=2?43:6);}
  span(){return {height:.8,width:7.6};}
}}));
vi.mock('./chest',()=>({revealPose:()=>({rise:0,discovered:false}),RewardChest:class {
  root:TransformNode;
  constructor(scene:Scene){this.root=new TransformNode("captain's treasure chest",scene);this.root.setEnabled(false);}
  hide(){this.root.setEnabled(false);}
  animate(){this.root.setEnabled(true);}
  setCoinCount(){}open(){}fade(){}
}}));
import {TreasureCave} from './cave';
afterEach(()=>{vi.unstubAllGlobals();pourState.spawned=0;pourState.empty=false;pourState.done=false;pourState.withdraw=0;pourState.chestY=3.8;});
const fixture=()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('innerWidth',1440);vi.stubGlobal('innerHeight',900);
  const engine=new NullEngine(),cave=new TreasureCave(engine,false,true);
  vi.spyOn(cave.scene,'render').mockImplementation(()=>{});
  return {engine,cave,close:()=>{cave.scene.dispose();engine.dispose();}};
};
describe('cave chest presentation',()=>{
  it('hides unsupported placeholders from construction and rests supported chests on their ledges',()=>{
    const {engine,cave,close}=fixture();
    const roots=cave.scene.transformNodes.filter(n=>n.name.startsWith('unopened chest'));
    expect(roots).toHaveLength(12);expect(roots.every(n=>!n.isEnabled())).toBe(true);
    cave.render(.016);
    expect(roots.filter(n=>n.isEnabled()).map(n=>n.name)).toEqual(['unopened chest 2','unopened chest 5','unopened chest 8','unopened chest 11']);
    for(const root of roots.filter(n=>n.isEnabled())){
      root.computeWorldMatrix(true);root.getChildMeshes().forEach(m=>m.computeWorldMatrix(true));
      const rock=cave.scene.getMeshByName('treasure rock ledge '+root.name.split(' ').at(-1))!;
      rock.computeWorldMatrix(true);
      expect(root.getHierarchyBoundingVectors(true).min.y).toBeCloseTo(rock.getBoundingInfo().boundingBox.maximumWorld.y,5);
    }
    close();expect(engine.isDisposed).toBe(true);
  });
  it('starts and changes banks with no chest, fade, carry movement or completion event',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    cave.debugCoinBank(0);
    cave.render(.016,true);
    const position=cave.camera.position.clone();
    cave.render(30,true);
    expect(cave.camera.position.equals(position)).toBe(true);
    expect(chest.isEnabled()).toBe(false);expect(cave.depositComplete).toBe(false);
    expect(cave.scene.getMeshByName('chest opening rock')!.isEnabled()).toBe(false);
    expect(cave.scene.transformNodes.filter(n=>n.name.startsWith('unopened chest')).every(n=>!n.isEnabled())).toBe(true);
    cave.debugCoinBank(3);cave.render(.016,true);
    expect(cave.camera.position.x).toBe(28);expect(chest.isEnabled()).toBe(false);
    expect(cave.depositComplete).toBe(false);close();
  });
  it('lifts before crossing existing gold and arrives above the bank',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    cave.debugCoinBank(0,true);cave.render(2,true);
    expect(chest.isEnabled()).toBe(true);expect(chest.position.y).toBeGreaterThan(3.76);
    cave.render(2.3,true);expect(chest.position.y).toBeGreaterThan(3.76);
    cave.debugCoinBank(0);cave.render(.016,true);expect(chest.isEnabled()).toBe(false);close();
  });
  it('frames the whole raised chest and waiting queue in a phone portrait viewport',()=>{
    const {engine,cave,close}=fixture();
    vi.stubGlobal('innerWidth',393);vi.stubGlobal('innerHeight',852);
    vi.spyOn(engine,'getRenderWidth').mockReturnValue(393);vi.spyOn(engine,'getRenderHeight').mockReturnValue(852);
    cave.showCargo([0,1,2,3,4,5],0,true);cave.beginUnload(0,0);cave.render(1.4,true);
    const viewport=cave.camera.viewport.toGlobal(393,852);
    const project=(point:Vector3)=>Vector3.Project(point,Matrix.Identity(),cave.camera.getViewMatrix(true).multiply(cave.camera.getProjectionMatrix(true)),viewport);
    // Fully open active chest, including lid; queue extends across both entrance rows.
    const bounds=[{x:-2.8,y:3.8,z:-8.8,width:3.7,height:3.3,depth:2.8},
      {x:2.8,y:.2,z:-8.8,width:1.85,height:1.65,depth:1.4},
      {x:-2.8,y:.2,z:-6.2,width:1.85,height:1.65,depth:1.4}];
    for(const b of bounds)for(const dx of [-1,1])for(const dy of [0,1])for(const dz of [-1,1]){
      const screen=project(new Vector3(b.x+dx*b.width/2,b.y+dy*b.height,b.z+dz*b.depth/2));
      expect(screen.x).toBeGreaterThan(0);expect(screen.x).toBeLessThan(393);
      expect(screen.y).toBeGreaterThan(0);expect(screen.y).toBeLessThan(852);
    }
    close();
  });
  it('takes each queued chest from its own stable entrance position',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    cave.showCargo([0,1],0,true);cave.beginUnload(0,0);cave.render(0,true);
    expect(chest.position.x).toBe(-2.8);expect(chest.position.z).toBe(-8.8);
    expect(chest.scaling.x).toBe(.5);
    cave.render(1.2,true);
    expect(chest.position.x).toBe(-2.8);expect(chest.position.z).toBe(-8.8);
    expect(chest.position.y).toBeGreaterThan(3.7);
    cave.showCargo([1],1);cave.beginUnload(0,1);cave.render(0,true);
    expect(chest.position.x).toBe(2.8);expect(chest.position.z).toBe(-8.8);
    close();
  });
  it('keeps the empty chest visible and moves it continuously out of view before completing',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    cave.debugCoinBank(0,true);pourState.spawned=1000;cave.render(4.3,true);
    expect(chest.isEnabled()).toBe(true);
    pourState.empty=true;pourState.done=true;cave.render(.016,true);
    const start=chest.position.clone();expect(chest.isEnabled()).toBe(true);expect(cave.depositComplete).toBe(false);
    cave.render(.4,true);expect(chest.isEnabled()).toBe(true);expect(chest.position.y).toBeGreaterThan(start.y);
    expect(chest.position.z).toBeCloseTo(start.z); // lift before travelling sideways
    cave.render(.5,true);expect(chest.isEnabled()).toBe(true);expect(chest.position.z).toBeLessThan(start.z);
    cave.render(1.4,true);expect(chest.isEnabled()).toBe(false);expect(cave.depositComplete).toBe(true);close();
  });

});
