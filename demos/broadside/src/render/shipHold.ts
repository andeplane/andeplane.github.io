import { Scene } from '@babylonjs/core/scene.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { Ocean } from './water';
import { buildIslands, type IslandsView } from './islands';
import { RewardChest, revealPose } from './chest';
import { buildRelic } from './relics';
import { antialiasSamples, isPhoneRendering } from './quality';
import type { VoyageDef } from '../game/voyage';
import { cargoChests } from '../game/rewards';
import type { Progress } from '../game/progress';
import { CoinHoard } from './coinHoard';
import { chestCarry, chestExit, CHEST_EXIT_SECONDS, pourTilt } from '../game/coinPour';

/** A shipboard cabin with an open stern window onto the island just reached. */
export class ShipHold {
  readonly scene: Scene;
  private camera: FreeCamera;
  private chest: RewardChest;
  private ocean: Ocean;
  private islands: IslandsView;
  private time = 0;
  private revealTime = 0;
  private special: ReturnType<typeof buildRelic> | null = null;
  private cargoMeshes: Mesh[] = [];
  private wood: StandardMaterial;
  private metal: StandardMaterial;
  private revealing = true;
  private coins = 0;
  private reducedMotion = false;
  private debugHoard: CoinHoard | null = null;
  private debugAge = 0;
  private debugFinished: number | null = null;
  private debugExitAt:number|null=null;
  private debugPour = false;
  constructor(engine: Engine, voyage: VoyageDef) {
    const s = this.scene = new Scene(engine);
    s.clearColor = Color4.FromHexString('#839aabff');
    s.fogMode = Scene.FOGMODE_EXP2; s.fogDensity = .0015; s.fogColor = Color3.FromHexString('#839aab');
    this.camera = new FreeCamera('inside the treasure hold', new Vector3(0,3.6,-8),s);
    this.camera.inputs.clear(); this.camera.minZ = .06; this.camera.maxZ = 350;
    const sky = new HemisphericLight('sea light through the stern windows',new Vector3(0,1,1),s);
    sky.diffuse=Color3.FromHexString('#c3d0dc');sky.groundColor=Color3.FromHexString('#33271e');sky.intensity=.55;
    const sun = new DirectionalLight('late sun across the treasure',new Vector3(-.4,-.9,-.7).normalize(),s);
    sun.position.set(35,65,25);sun.diffuse=Color3.FromHexString('#ffdc9a');sun.intensity=1.3;
    sun.shadowFrustumSize=100;sun.shadowMinZ=1;sun.shadowMaxZ=170;
    const shadows = new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;
    shadows.bias=.003;shadows.normalBias=.06;
    const mat = (name:string,hex:string) => {const m=new StandardMaterial(name,s);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=Color3.FromHexString('#66503a');m.maxSimultaneousLights=4;return m;};
    this.wood=mat('weathered oak of the Pearl','#6d4b31');
    this.metal=mat('aged brass in the treasure hold','#ad8540');
    const grain=new DynamicTexture('oak grain',{width:512,height:256},s,true),ctx=grain.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle='#785338';ctx.fillRect(0,0,512,256);
    for(let i=0;i<550;i++){ctx.strokeStyle=i%3?'#63432d':'#8a6243';ctx.lineWidth=i%5?1:2;ctx.beginPath();const y=(i*53.83)%256;ctx.moveTo(0,y);ctx.bezierCurveTo(120,y+Math.sin(i)*8,360,y-Math.cos(i)*10,512,y);ctx.stroke();}
    grain.update();this.wood.diffuseTexture=grain;
    const dark=mat('tarred curved hull beams','#2c241d'),rope=mat('hemp rope','#897754');
    const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,m:StandardMaterial)=>{const b=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},s);b.position.set(x,y,z);b.material=m;b.receiveShadows=true;return b;};
    for(let i=0;i<18;i++) box('individual deck plank',.5,.16,15,(i-8.5)*.52,.62,0,this.wood);
    for(const x of [-4.7,4.7]) {
      box('oak hull wall',.22,5.3,15,x,3.2,0,this.wood);
      for(const z of [-6,-2,2,6]) {
        const rib=MeshBuilder.CreateTube('curved ship rib',{path:[new Vector3(x*.87,.7,z),new Vector3(x,.9,z),new Vector3(x,4.3,z),new Vector3(x*.65,5.9,z),new Vector3(0,6.2,z)],radius:.19,tessellation:10},s);
        rib.material=dark;
      }
    }
    box('cabin ceiling',9.8,.18,15,0,6.25,0,this.wood);
    box('rear hold wall',9.6,5.6,.2,0,3.3,-7.6,this.wood);
    // The large stern windows really open onto the sea: no backdrop painted on glass.
    box('window breast wall',9.6,1,.24,0,1.15,7.4,this.wood);
    box('window upper wall',9.6,1.4,.24,0,5.6,7.4,this.wood);
    for(const x of [-4.65,-2.25,0,2.25,4.65]) box('stern window mullion',.18,3.4,.28,x,3.25,7.4,dark);
    box('brass window ledge',9.5,.12,.55,0,1.72,7.25,this.metal);
    for(const x of [-3.7,3.7]) for(const z of [-3.8,3.8]) {
      const lantern = new PointLight('warm hanging lantern',new Vector3(x,4.5,z),s);lantern.diffuse=Color3.FromHexString('#ffce82');lantern.intensity=.9;lantern.range=9;
      const glass=mat('warm lantern glass','#ffd68e');glass.emissiveColor=Color3.FromHexString('#ffc578');
      const lamp=MeshBuilder.CreateCylinder('ship lantern glass',{height:.5,diameter:.26,tessellation:10},s);lamp.position.copyFrom(lantern.position);lamp.material=glass;
      for(const y of [4.23,4.77])box('lantern brass cap',.34,.06,.34,x,y,z,this.metal);
      const chain=MeshBuilder.CreateCylinder('lantern chain',{height:1.4,diameter:.03,tessellation:6},s);chain.position.set(x,5.4,z);chain.material=this.metal;
    }
    for(const x of [-3.7,3.7]) {
      const barrel=MeshBuilder.CreateCylinder('provisions barrel',{height:1.4,diameterTop:.94,diameterBottom:.84,tessellation:16},s);barrel.position.set(x,1.4,5);barrel.material=this.wood;
      for(const y of [1,1.8]) {const band=MeshBuilder.CreateTorus('barrel iron hoop',{diameter:.94,thickness:.05,tessellation:20},s);band.position.set(x,y,5);band.material=dark;}
      const coil=MeshBuilder.CreateTorus('coiled rope on deck',{diameter:1.1,thickness:.09,tessellation:32},s);coil.position.set(x,.8,-5);coil.material=rope;
    }
    this.ocean=new Ocean(s,[],s.fogDensity);this.ocean.setChapter(voyage.pack);
    // The cabin is above the waterline, even at the crest of a swell.
    this.ocean.mesh.position.y=-3;
    const island = [...voyage.level.islands].filter(i=>i.kind==='sand').sort((a,b)=>Math.hypot(a.pos.x-voyage.finish.x,a.pos.z-voyage.finish.z)-Math.hypot(b.pos.x-voyage.finish.x,b.pos.z-voyage.finish.z))[0];
    this.islands=buildIslands(s,island?[{...island,pos:{x:0,z:island.radius+29}}]:[],shadows,voyage.level.seed,voyage.pack);
    this.chest=new RewardChest(s);
    const pipeline=new DefaultRenderingPipeline('golden light in the treasure hold', !isPhoneRendering(engine),s,[this.camera]);
    pipeline.bloomEnabled=true;pipeline.bloomThreshold=1.1;pipeline.bloomWeight=.1;pipeline.bloomKernel=24;
    pipeline.samples=antialiasSamples(engine);pipeline.fxaaEnabled=true;s.imageProcessingConfiguration.exposure=1.05;
  }
  open(progress: Progress, special: number | null, reveal = true): void {
    this.revealTime=0;this.revealing=reveal;
    this.coins=cargoChests(progress).length ? 1000 : 0;
    this.special?.dispose(false,true);this.special=null;
    if(special!==null) {this.special=buildRelic(this.scene,special);this.special.parent=this.chest.root;this.special.scaling.setAll(.3);const b=this.special.getHierarchyBoundingVectors(true);this.special.position.set(.1,1.25-b.min.y,-.04);}
    this.cargoMeshes.forEach(m=>m.dispose());this.cargoMeshes=[];
    const timber:Mesh[]=[],fittings:Mesh[]=[];
    for(let i=0;i<Math.max(0,cargoChests(progress).length-1);i++) {
      const side=i%2?-1:1, n=Math.floor(i/2),x=side*3.25,z=4.4-(n%7)*1.35,y=.78+Math.floor(n/7)*1.04;
      const crate=MeshBuilder.CreateBox('stowed chest of one thousand gold',{width:1.3,height:.74,depth:.92},this.scene);crate.position.set(x,y+.37,z);crate.material=this.wood;timber.push(crate);
      const lid=MeshBuilder.CreateCylinder('stowed rounded chest lid',{height:1.3,diameter:.92,arc:.5,enclose:true,tessellation:16},this.scene);lid.rotation.set(Math.PI/2,Math.PI/2,0);lid.position.set(x,y+.74,z);lid.material=this.wood;timber.push(lid);
      for(const dx of [-.4,.4]) {const band=MeshBuilder.CreateBox('stowed chest brass strap',{width:.055,height:.78,depth:.96},this.scene);band.position.set(x+dx,y+.37,z);band.material=this.metal;fittings.push(band);}
    }
    for(const meshes of [timber,fittings]) if(meshes.length) {const m=Mesh.MergeMeshes(meshes,true,true)!;m.receiveShadows=true;this.cargoMeshes.push(m);}
  }
  get pose() { return revealPose(this.revealTime,this.reducedMotion); }
  debugCoinBank(_world = 0, add = false): void {
    this.debugHoard ??= new CoinHoard(this.scene, false, undefined, {
      areas: [{world:0,name:'Ship hold',x:0,z:0,radius:3.8}], floorY:.7, strictPhysics:true,
    });
    if (add) this.debugHoard.addBatch(0);
    this.debugAge = 0; this.debugFinished = null;this.debugExitAt=null; this.debugPour = add;
  }
  get coinCounts(): number[] { return this.debugHoard?.counts ?? [0]; }
  get restingCoinCounts(): number[] { return this.debugHoard?.restingCounts ?? [0]; }
  get coinPhysicsMetrics() { return this.debugHoard?.metrics(0)??{lastMs:0,meanMs:0,maxMs:0,staticTriangles:0}; }
  get goldPhysicsActive(): boolean { return this.debugHoard?.physicsActive ?? false; }
  get coinError(): string | null { return this.debugHoard?.pouring(0).error ?? null; }
  get depositComplete(): boolean { return this.debugFinished !== null && this.debugExitAt!==null && this.debugAge-this.debugExitAt>=CHEST_EXIT_SECONDS; }
  render(dt:number,reduced=false):void {
    this.reducedMotion=reduced;
    this.time+=dt;if(this.revealing)this.revealTime+=dt;else this.revealTime=5;
    this.chest.animate(this.revealTime,0,reduced);this.chest.root.position.set(0,1.05,0);
    this.chest.setCoinCount(this.coins);
    const bob=reduced?0:Math.sin(this.time*.75)*.035;
    this.camera.position.set(.75+Math.sin(this.time*.35)*.015,5.4+bob,-6.8);
    this.camera.fov=innerWidth<600?1.25:.85;this.camera.setTarget(new Vector3(0,2.05,.55));
    if (this.debugHoard) {
      this.debugAge += dt;
      const pour = this.debugHoard.pouring(0), height = this.debugHoard.span(0).height;
      this.camera.position.set(.75,Math.min(5.5,height+3.2),-6.8);
      this.camera.setTarget(new Vector3(0,Math.min(4,height*.5+1),0));
      if (this.debugPour) {
        this.chest.animate(5,0,reduced);
        const carried=chestCarry(this.debugAge,{x:0,y:1.05,z:-5.4},{x:0,y:pour.chestY,z:0},reduced);
        this.chest.root.position.set(carried.x,carried.y,carried.z);
        this.camera.setTarget(new Vector3(0,(carried.y+1)*(1-pour.turn)+Math.min(4,height*.5+1)*pour.turn,0));
        this.chest.root.rotation.set(0,0,pourTilt(pour.turn));
        const lid=reduced?1:Math.max(0,Math.min(1,(this.debugAge-3.4)/.6));
        this.chest.open(lid);
        this.debugHoard.carryChest(0,this.chest.root.position,this.chest.root.rotation,lid,dt);
        this.debugHoard.preparePour(0);
        this.chest.setCoinCount(1000-pour.spawned);
        if(this.debugExitAt===null&&(pour.withdraw>0||pour.done))this.debugExitAt=this.debugAge-pour.withdraw*CHEST_EXIT_SECONDS;
        if(this.debugExitAt!==null){
          const t=Math.max(0,(this.debugAge-this.debugExitAt)/CHEST_EXIT_SECONDS),exit=chestExit(t);
          this.chest.root.position.addInPlaceFromFloats(exit.x,exit.y,exit.z);
          if(t>=1)this.chest.hide();
        }
        if(this.debugAge>=(reduced ? .1 : 4.2)&&pour.physicsReady&&!pour.started&&!pour.done&&!pour.error) this.debugHoard.startPour(0,reduced?0:2.2);
        if(pour.done)this.debugFinished??=this.debugAge;
      } else this.chest.hide();
      this.debugHoard.animate(dt);
    }
    this.ocean.update(this.time,this.camera.position,{x:0,z:0},[]);this.islands.update(this.time);
    this.scene.render();
  }
}
