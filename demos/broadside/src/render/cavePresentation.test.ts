import {afterEach,describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Vector3, Matrix} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
vi.mock('../shared/pirate-world/render/cavern',()=>({Cavern:class {
  stone:StandardMaterial;ledge:StandardMaterial;gold:StandardMaterial;wood:StandardMaterial;iron:StandardMaterial;
  obstacles=[];lamps=[];shadow={addShadowCaster:vi.fn()};
  constructor(private scene:Scene){this.stone=this.ledge=this.gold=this.wood=this.iron=new StandardMaterial('test rock',scene);}
  rock(name:string,position:Vector3,scale:Vector3){const r=MeshBuilder.CreateBox(name,{height:1.1},this.scene);r.position.copyFrom(position);r.scaling.copyFrom(scale);return r;}
  animate(){}walkHeight(){return 0;}
}}));
vi.mock('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js',()=>({DefaultRenderingPipeline:class {imageProcessing={};}}));
const pourState=vi.hoisted(()=>({spawned:0,empty:false,done:false,withdraw:0,chestY:3.8}));
vi.mock('../shared/pirate-world/render/coinHoard',()=>({CoinHoard:class {
  counts=[0,0,0,0];restingCounts=[0,0,0,0];physicsActive=false;
  addBatch(){}startPour(){}preparePour(){}carryChest(){}finishPours(){}animate(){}walkHeight(){return 0;}
  pouring(){return {ready:true,physicsReady:true,turn:0,...pourState,active:false,error:null};}
  center(world:number){return new Vector3(world===3?28:world===1?8:-8,.2,world>=2?43:6);}
  span(){return {height:.8,width:7.6};}
}}));
vi.mock('../shared/pirate-world/render/chest',()=>({revealPose:()=>({rise:0,discovered:false}),RewardChest:class {
  root:TransformNode;
  constructor(scene:Scene){this.root=new TransformNode("captain's treasure chest",scene);this.root.setEnabled(false);}
  hide(){this.root.setEnabled(false);}
  animate(){this.root.setEnabled(true);}
  setCoinCount(){}open(){}fade(){}
}}));
import {TreasureCave} from '../shared/pirate-world/render/cave';
import {bankCargoPosition} from '../shared/pirate-world/render/cargoChests';
import {GOLD_AREAS} from '../shared/pirate-world/game/goldAreas';
import {caveWalkable} from '../shared/pirate-world/input/caveLayout';
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
  it.each([[390,844],[320,568],[844,390]])('frames the waiting queue and deposit at %i×%i', (width,height)=>{
    const {engine,cave,close}=fixture();
    vi.stubGlobal('innerWidth',width);vi.stubGlobal('innerHeight',height);
    vi.spyOn(engine,'getRenderWidth').mockReturnValue(width);vi.spyOn(engine,'getRenderHeight').mockReturnValue(height);
    for(const area of GOLD_AREAS) {
      const ids=[0,1,2,3,4,5],world=area.world;
      cave.showCargo(ids,ids[0],world);cave.beginUnload(world,ids[0]);cave.render(0,true);
      const camera=cave.camera.position.clone(),rotation=cave.camera.rotation.clone();
      const viewport=cave.camera.viewport.toGlobal(width,height);
      const project=(point:Vector3)=>Vector3.Project(point,Matrix.Identity(),cave.camera.getViewMatrix(true).multiply(cave.camera.getProjectionMatrix(true)),viewport);
      for(const slot of ids){
        const p=bankCargoPosition(slot,ids.length,area);
        const screen=project(new Vector3(p.x,p.y+p.scale*1.5,p.z));
        expect(screen.x).toBeGreaterThan(width*.055);expect(screen.x).toBeLessThan(width*.945);
        expect(screen.y, JSON.stringify({world,screen})).toBeGreaterThan(height*.12);expect(screen.y, JSON.stringify({world,screen})).toBeLessThan(height*.84);
      }
      for(const point of [new Vector3(area.x,.2,area.z),new Vector3(area.x,6.95,area.z+.8)]){
        const screen=project(point);
        expect(screen.x).toBeGreaterThan(width*.055);expect(screen.x).toBeLessThan(width*.945);
        expect(screen.y, JSON.stringify({world,screen})).toBeGreaterThan(height*.12);expect(screen.y, JSON.stringify({world,screen})).toBeLessThan(height*.84);
      }
      cave.render(3,true);
      expect(cave.camera.position.equals(camera)).toBe(true);
      expect(cave.camera.rotation.equalsWithEpsilon(rotation)).toBe(true);
    }
    close();
  });
  it('lifts each chest in place before travelling to its bank and holds the same frame between chests',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    const area=GOLD_AREAS[0],first=bankCargoPosition(0,2,area),second=bankCargoPosition(1,2,area);
    cave.showCargo([0,1],0,0);cave.beginUnload(0,0);cave.render(0,true);
    const camera=cave.camera.position.clone();
    expect(chest.position.x).toBe(first.x);expect(chest.position.z).toBe(first.z);
    expect(chest.scaling.x).toBe(first.scale);
    cave.render(1.3,true);
    expect(chest.position.x).toBe(first.x);expect(chest.position.z).toBe(first.z);
    expect(chest.position.y).toBeCloseTo(pourState.chestY);
    cave.render(1.8,true);
    expect(chest.position.asArray()).toEqual([area.x,pourState.chestY,area.z]);
    expect(chest.scaling.x).toBe(1);
    cave.showCargo([1],1,0);cave.beginUnload(0,1);cave.render(0,true);
    expect(chest.position.x).toBe(second.x);expect(chest.position.z).toBe(second.z);
    expect(cave.camera.position.equals(camera)).toBe(true);
    close();
  });
  it('starts walking on a safe path facing the bank after unloading',()=>{
    const {cave,close}=fixture();
    for(const area of GOLD_AREAS) {
      cave.showCargo([7],7,area.world);cave.beginUnload(area.world,7);cave.render(.1,true);
      cave.finishUnloadForWalk();cave.render(.1);
      expect(caveWalkable(cave.walker.x,cave.walker.z)).toBe(true);
      expect(Math.sin(cave.walker.yaw)*(area.x-cave.walker.x)+Math.cos(cave.walker.yaw)*(area.z-cave.walker.z)).toBeGreaterThan(5);
      expect(cave.scene.getTransformNodeByName("captain's treasure chest")!.isEnabled()).toBe(false);
    }
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
