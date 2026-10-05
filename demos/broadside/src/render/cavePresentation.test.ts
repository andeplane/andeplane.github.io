import {afterEach,describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
vi.mock('./cavern',()=>({Cavern:class {
  stone:StandardMaterial;ledge:StandardMaterial;gold:StandardMaterial;wood:StandardMaterial;iron:StandardMaterial;
  obstacles=[];lamps=[];shadow={addShadowCaster:vi.fn()};
  constructor(private scene:Scene){this.stone=this.ledge=this.gold=this.wood=this.iron=new StandardMaterial('test rock',scene);}
  rock(name:string,position:Vector3,scale:Vector3){const r=MeshBuilder.CreateBox(name,{height:1.1},this.scene);r.position.copyFrom(position);r.scaling.copyFrom(scale);return r;}
  animate(){}walkHeight(){return 0;}
}}));
vi.mock('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js',()=>({DefaultRenderingPipeline:class {imageProcessing={};}}));
vi.mock('./coinHoard',()=>({CoinHoard:class {
  counts=[0,0,0,0];restingCounts=[0,0,0,0];physicsActive=false;
  addBatch(){}startPour(){}preparePour(){}carryChest(){}finishPours(){}animate(){}walkHeight(){return 0;}
  pouring(){return {ready:true,physicsReady:true,turn:0,spawned:0,done:false,chestY:3.8,active:false,error:null};}
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
afterEach(()=>vi.unstubAllGlobals());
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
  it('only carries after Add, holds a steady height en route, then lifts for pouring',()=>{
    const {cave,close}=fixture(),chest=cave.scene.getTransformNodeByName("captain's treasure chest")!;
    cave.debugCoinBank(0,true);cave.render(2,true);
    expect(chest.isEnabled()).toBe(true);expect(chest.position.y).toBeGreaterThan(.4);expect(chest.position.y).toBeLessThan(.6);
    cave.render(2.3,true);expect(chest.position.y).toBeCloseTo(3.8);
    cave.debugCoinBank(0);cave.render(.016,true);expect(chest.isEnabled()).toBe(false);close();
  });
});
