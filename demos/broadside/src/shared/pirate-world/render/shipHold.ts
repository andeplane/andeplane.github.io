import { Scene } from '@babylonjs/core/scene.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { Ocean } from '../../../render/water';
import { buildIslands, type IslandsView } from '../../../render/islands';
import { RewardChest, revealPose } from './chest';
import { buildRelic } from './relics';
import { antialiasSamples, isPhoneRendering } from './quality';
import type { ShipPresentation } from "../types";
import { CargoChests, holdCargoPosition } from './cargoChests';
import { shipHoldCamera } from './shipHoldCamera';
import { CoinHoard } from './coinHoard';
import { buildTreasureCabin } from './treasureCabin';
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
  private cargo: CargoChests;
  private revealing = true;
  private coins = 0;
  private reducedMotion = false;
  private debugHoard: CoinHoard | null = null;
  private debugAge = 0;
  private debugFinished: number | null = null;
  private debugExitAt:number|null=null;
  private debugPour = false;
  constructor(engine: Engine, ship: ShipPresentation) {
    const s = this.scene = new Scene(engine);
    s.clearColor = Color4.FromHexString('#839aabff');
    s.fogMode = Scene.FOGMODE_EXP2; s.fogDensity = .0015; s.fogColor = Color3.FromHexString('#839aab');
    this.camera = new FreeCamera('inside the treasure hold', new Vector3(0,3.6,-8),s);
    this.camera.inputs.clear(); this.camera.minZ = .06; this.camera.maxZ = 350;
    const sky = new HemisphericLight('sea light through the stern windows',new Vector3(0,1,1),s);
    sky.diffuse=Color3.FromHexString('#b7cbd2');sky.groundColor=Color3.FromHexString('#5d4e3c');sky.intensity=.8;
    const sun = new DirectionalLight('late sun across the treasure',new Vector3(-.4,-.9,-.7).normalize(),s);
    sun.position.set(35,65,25);sun.diffuse=Color3.FromHexString('#ffe3b6');sun.intensity=1.0;
    sun.shadowFrustumSize=100;sun.shadowMinZ=1;sun.shadowMaxZ=170;
    const shadows = new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;
    shadows.bias=.003;shadows.normalBias=.06;shadows.darkness=.3;
    const cabin = buildTreasureCabin(s, shadows);
    this.ocean=new Ocean(s,[],s.fogDensity);this.ocean.setChapter(ship.chapter);
    // The cabin is above the waterline, even at the crest of a swell.
    this.ocean.mesh.position.y=-3;
    const island = ship.island;
    this.islands=buildIslands(s,island?[{...island,pos:{x:0,z:island.radius+55}}]:[],shadows,ship.seed,ship.chapter);
    this.chest=new RewardChest(s);
    for(const mesh of this.chest.root.getChildMeshes()) {
      mesh.receiveShadows=true;
      if(!/doubloon|light at lid seam/.test(mesh.name))shadows.addShadowCaster(mesh,false);
    }
    // A soft contact shadow anchors the feet even under the two lanterns.
    const contactTexture=new DynamicTexture('chest contact shadow',128,s,false);
    const contactContext=contactTexture.getContext() as CanvasRenderingContext2D;
    const shade=contactContext.createRadialGradient(64,64,10,64,64,63);
    shade.addColorStop(0,'rgba(18,10,4,.6)');shade.addColorStop(.5,'rgba(18,10,4,.3)');shade.addColorStop(1,'rgba(18,10,4,0)');
    contactContext.fillStyle=shade;contactContext.fillRect(0,0,128,128);contactTexture.hasAlpha=true;contactTexture.update();
    const contactMaterial=new StandardMaterial('soft chest contact',s);contactMaterial.diffuseTexture=contactTexture;
    contactMaterial.useAlphaFromDiffuseTexture=true;contactMaterial.disableLighting=true;contactMaterial.emissiveColor.set(1,1,1);
    const contact=MeshBuilder.CreateGround('shadow under the treasure chest',{width:4.8,height:3.1},s);
    contact.position.set(0,.715,0);contact.material=contactMaterial;contact.isPickable=false;
    this.cargo = new CargoChests(s, 'shipboard cargo');
    const cargoTimber = s.getMaterialByName('shipboard cargo oak') as StandardMaterial;
    cargoTimber.diffuseTexture = cabin.timber.diffuseTexture; cargoTimber.bumpTexture = cabin.timber.bumpTexture;
    cargoTimber.diffuseColor = Color3.FromHexString('#8b7a60'); cargoTimber.specularColor.set(.12, .1, .07);
    const pipeline=new DefaultRenderingPipeline('golden light in the treasure hold', !isPhoneRendering(engine),s,[this.camera]);
    pipeline.bloomEnabled=true;pipeline.bloomThreshold=1.1;pipeline.bloomWeight=.08;pipeline.bloomKernel=24;
    pipeline.samples=antialiasSamples(engine);pipeline.fxaaEnabled=true;
    s.imageProcessingConfiguration.toneMappingEnabled=true;
    s.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    s.imageProcessingConfiguration.exposure=1.1;
    s.imageProcessingConfiguration.contrast=1.08;
  }
  /** Both games use the same hold, open cargo geometry and latest-chest animation. */
  openCargo(count: number, coinsPerChest = 1000, reveal = true, special: number | null = null): void {
    this.revealTime=0;this.revealing=reveal;
    this.coins=count ? coinsPerChest : 0;
    this.special?.dispose(false,true);this.special=null;
    if(special!==null) {this.special=buildRelic(this.scene,special);this.special.parent=this.chest.root;this.special.scaling.setAll(.3);const b=this.special.getHierarchyBoundingVectors(true);this.special.position.set(.1,1.25-b.min.y,-.04);}
    this.cargo.show(Array.from({ length: Math.max(0, count - 1) }, (_, i) => holdCargoPosition(i)));
  }
  get presentationError():string|null { return this.chest.error; }
  get presentationReady():boolean { return this.chest.ready; }
  get pose() { return revealPose(this.revealTime,this.reducedMotion); }
  debugCoinBank(_world = 0, add = false): void {
    this.debugHoard ??= new CoinHoard(this.scene, false, undefined, {
      areas: [{world:0,name:'Ship hold',x:0,z:0,radius:3.8}], floorY:.7, strictPhysics:true,
    });
    if (add) this.debugHoard.addBatch(0);
    this.debugAge = 0; this.debugFinished = null;this.debugExitAt=null; this.debugPour = add;
  }
  get drawnCoinCounts(): number[] { return this.debugHoard?.drawnCounts ?? [0]; }
  get coinRenderTriangles(): number { return this.debugHoard?.renderedTriangles ?? 0; }
  get coinCounts(): number[] { return this.debugHoard?.counts ?? [0]; }
  get restingCoinCounts(): number[] { return this.debugHoard?.restingCounts ?? [0]; }
  get coinPhysicsMetrics() { return this.debugHoard?.metrics(0)??{lastMs:0,meanMs:0,maxMs:0,staticTriangles:0}; }
  get goldPhysicsActive(): boolean { return this.debugHoard?.physicsActive ?? false; }
  get coinError(): string | null { return this.debugHoard?.pouring(0).error ?? null; }
  get depositComplete(): boolean { return this.debugFinished !== null && this.debugExitAt!==null && this.debugAge-this.debugExitAt>=CHEST_EXIT_SECONDS; }
  render(dt:number,reduced=false):void {
    this.reducedMotion=reduced;
    this.time+=dt;if(this.revealing)this.revealTime+=dt;else this.revealTime=5;
    this.chest.animate(this.revealTime,0,reduced);this.chest.root.position.set(0,.79,0);
    this.chest.setCoinCount(this.coins);
    const portrait = innerWidth < innerHeight;
    const ledgerLayout = !this.revealing ? null
      : !portrait && innerHeight <= 520 ? "side"
        : portrait && innerHeight <= 650 ? "compact" : null;
    const framing = shipHoldCamera(this.revealing ? portrait : innerWidth < 600, this.time, reduced, this.coins >= 1000, ledgerLayout);
    this.camera.position.set(framing.position.x,framing.position.y,framing.position.z);
    this.camera.fov=framing.fov;
    this.camera.setTarget(new Vector3(framing.target.x,framing.target.y,framing.target.z));
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
