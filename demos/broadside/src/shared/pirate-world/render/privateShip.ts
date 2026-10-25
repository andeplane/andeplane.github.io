import '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CaveWalker, type WalkIntent } from '../input/caveWalk';
import { PEARL_BOARDING, PearlDeck, type PearlManifest } from '../input/pearlDeck';
import { isPhoneRendering } from './quality';
import type { TreasureState } from "../types";
import { CargoChests } from './cargoChests';
import { Ocean } from '../../../render/water';
import { buildRelic } from './relics';

/** Full-size purchased ship, with a connected lantern-lit stern treasure room. */
export class PrivateShip {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly walker: CaveWalker;
  private ocean: Ocean;
  private time=0;
  private treasures: TransformNode | null=null;
  private cargo: CargoChests;
  private shadows: ShadowGenerator;
  private constructor(engine: Engine, readonly deck: PearlDeck) {
    const s=this.scene=new Scene(engine); s.useRightHandedSystem=true;
    s.clearColor=Color4.FromHexString('#6c858eff');
    s.fogMode=Scene.FOGMODE_EXP2; s.fogDensity=.002; s.fogColor=Color3.FromHexString('#6c858e');
    this.camera=new FreeCamera('aboard the purchased Pearl',new Vector3(0,7,-8),s);
    this.camera.inputs.clear(); this.camera.minZ=.06; this.camera.maxZ=600;
    this.camera.fovMode=Camera.FOVMODE_VERTICAL_FIXED; this.camera.fov=1.15;
    const sky=new HemisphericLight('soft sea sky',new Vector3(0,1,0),s);
    sky.intensity=.45; sky.diffuse=Color3.FromHexString('#c5dce8'); sky.groundColor=Color3.FromHexString('#40342b');
    const sun=new DirectionalLight('late afternoon',new Vector3(-.5,-.7,.3),s);
    sun.intensity=1.3; sun.diffuse=Color3.FromHexString('#ffd9a5');
    sun.position.set(30,65,-30); sun.shadowFrustumSize=100; sun.shadowMinZ=1; sun.shadowMaxZ=150;
    this.shadows=new ShadowGenerator(isPhoneRendering(engine) ? 1024 : 2048,sun); this.shadows.usePercentageCloserFiltering=true;
    this.shadows.bias=.002; this.shadows.normalBias=.04;
    this.walker=new CaveWalker(
      [
        ...[-5,10].map(z=>({x:0,z,rx:.5,rz:.5,top:40})),
        ...[-4.6,4.6].flatMap(x=>[-8,-3,2,7].map(z=>({x,z,rx:.7,rz:1,top:7}))),
        ...[0,1,2,3].map(i=>({x:-3.2+i*2.15,z:-20,rx:.65,rz:.65,top:5.8})),
      ],
      (x,z)=>deck.floor(x,z,this.walker?.feet ?? 4.5) ?? this.walker?.feet ?? 4.5,
      (x,z)=>deck.walkable(x,z,this.walker.feet), true);
    this.ocean=new Ocean(s,[],s.fogDensity); this.ocean.setChapter(0);
    this.cargo = new CargoChests(s, 'Pearl cargo');
    this.buildCabin(); this.enter();
  }
  static async load(engine: Engine, source: {manifestUrl:string;modelUrl:string}): Promise<PrivateShip> {
    const response=await fetch(source.manifestUrl);
    if (!response.ok) throw new Error('Purchased Pearl deck manifest is missing');
    const manifest: PearlManifest=await response.json();
    if (manifest.version!==1 || !manifest.floorTriangles?.length) throw new Error('Invalid Pearl deck manifest');
    const ship=new PrivateShip(engine,new PearlDeck(manifest));
    try {
      const asset=await LoadAssetContainerAsync(source.modelUrl,ship.scene);
      asset.addAllToScene();
      for (const mesh of asset.meshes) { mesh.receiveShadows=true; mesh.isPickable=false; ship.shadows.addShadowCaster(mesh); }
      ship.shadows.getShadowMap()!.refreshRate=0;
      return ship;
    } catch (error) {ship.scene.dispose(); throw error;}
  }
  enter(treasure=false): void {
    this.walker.reset(); this.walker.x=treasure ? 0 : PEARL_BOARDING.x;
    this.walker.z=treasure ? -13 : PEARL_BOARDING.z;
    this.walker.feet=this.deck.floor(this.walker.x,this.walker.z,5) ?? 4.5;
    this.walker.yaw=treasure ? Math.PI : PEARL_BOARDING.yaw; this.walker.pitch=.08;
  }
  get room(): string {
    const w=this.walker;
    return this.deck.inCabin(w.x,w.z) && w.feet<6.2 ? 'The treasure room'
      : w.z < -11 ? 'The quarterdeck' : w.z>9 ? 'The forecastle' : 'Aboard the Black Pearl';
  }
  get atHelm(): boolean {return this.walker.z < -17 && this.walker.feet>9;}
  walk(intent: WalkIntent,dt: number): void {this.walker.step(intent,dt);}
  look(dx: number,dy: number): void {this.walker.look(dx,dy);}
  render(dt: number): void {
    this.time+=dt; const w=this.walker;
    this.camera.position.set(w.x,w.eyeY+w.bob,w.z);
    this.camera.setTarget(this.camera.position.add(new Vector3(Math.sin(w.yaw)*Math.cos(w.pitch),-Math.sin(w.pitch),Math.cos(w.yaw)*Math.cos(w.pitch))));
    this.ocean.update(this.time,this.camera.position,w,[]); this.scene.render();
  }
  private buildCabin(): void {
    const s=this.scene;
    const wood=new StandardMaterial('warm cabin oak',s); wood.diffuseColor=Color3.FromHexString('#604028'); wood.specularColor.set(.08,.06,.04);
    const grain=new DynamicTexture('oak plank grain',512,s,true);
    const ctx=grain.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle='#ad8052';ctx.fillRect(0,0,512,512);
    for(let i=0;i<1600;i++) {
      const y=(i*79.17)%512,x=(i*137.31)%512;
      ctx.strokeStyle=i%3?'#936b45':'#c29762';ctx.globalAlpha=.3;ctx.lineWidth=.4+(i%3)*.3;
      ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+45,y-2,x+75,y+3,x+135,y);ctx.stroke();
    }
    grain.update();wood.diffuseTexture=grain;
    const dark=new StandardMaterial('tarred cabin beams',s); dark.diffuseColor=Color3.FromHexString('#211913');
    const box=(name:string,x:number,y:number,z:number,width:number,height:number,depth:number,material=wood)=>{
      const m=MeshBuilder.CreateBox(name,{width,height,depth},s); m.position.set(x,y,z); m.material=material;
      m.receiveShadows=true; this.shadows.addShadowCaster(m); return m;
    };
    for(let i=0;i<24;i++) box('stern cabin floor plank',-4.5+i*.39,4.4,-16.7,.37,.2,10.6);
    box('stern panelling',0,7.3,-22,9.4,5.6,.16);
    for(const x of [-4.7,4.7]) box('cabin side',x,7.3,-16.7,.16,5.6,10.6);
    // A central passage leads straight from the main deck into the room.
    for(const x of [-3.1,3.1]) box('door bulkhead',x,7.3,-11.6,3.2,5.6,.18);
    box('door lintel',0,9.1,-11.6,3,2,.2,dark);
    box('door threshold',0,4.4,-11,2.3,.2,2);
    // Place the sign in front of the purchased bulkhead, so the entrance is
    // readable from the deck rather than hidden inside the authored joinery.
    const signTexture=new DynamicTexture('treasure room entrance lettering',{width:1024,height:256},s,false);
    const signCanvas=signTexture.getContext() as CanvasRenderingContext2D;
    signCanvas.fillStyle='#25190f';signCanvas.fillRect(0,0,1024,256);
    signCanvas.strokeStyle='#edc879';signCanvas.lineWidth=10;signCanvas.strokeRect(12,12,1000,232);
    signCanvas.fillStyle='#fff0c4';signCanvas.textAlign='center';signCanvas.textBaseline='middle';
    signCanvas.font='bold 110px Georgia';signCanvas.fillText('GOLD ROOM',512,95);
    signCanvas.font='74px Georgia';signCanvas.fillText('Walk in',512,190);signTexture.update();
    const signMaterial=new StandardMaterial('lit treasure room sign',s);
    signMaterial.diffuseTexture=signTexture;signMaterial.emissiveTexture=signTexture;
    signMaterial.emissiveColor=Color3.White();signMaterial.disableLighting=true;signMaterial.backFaceCulling=false;
    const sign=MeshBuilder.CreatePlane('treasure room doorway sign',{width:1.6,height:.4},s);
    sign.position.set(0,7.05,-9);sign.material=signMaterial;
    for(const x of [-1.65,1.65]) {
      const brass=new StandardMaterial('entrance lantern glow',s);
      brass.diffuseColor=Color3.FromHexString('#ffcd77');brass.emissiveColor=Color3.FromHexString('#ffb34d');
      const lantern=MeshBuilder.CreateCylinder('treasure doorway lantern',{diameter:.25,height:.5,tessellation:8},s);
      lantern.position.set(x,6.65,-10.3);lantern.material=brass;
      const light=new PointLight('warm light at treasure doorway',new Vector3(x,6.7,-10),s);
      light.diffuse=Color3.FromHexString('#ffd69b');light.intensity=1.4;light.range=9;
    }
    for(const z of [-12,-15,-18,-21]) {
      box('ceiling beam',0,10,z,9.4,.22,.25,dark);
      for(const x of [-4.5,4.5]) box('wall rib',x,7.3,z,.22,5.6,.25,dark);
    }
    for(const [x,z] of [[-3.8,-13.5],[3.8,-17],[-3.8,-20]]) {
      const flame=new StandardMaterial('lantern honey light',s); flame.diffuseColor=Color3.FromHexString('#ffd083'); flame.emissiveColor=Color3.FromHexString('#ffb75e');
      const lamp=MeshBuilder.CreateCylinder('brass lantern',{diameter:.3,height:.55,tessellation:8},s); lamp.position.set(x!,8.1,z!); lamp.material=flame;
      const light=new PointLight('treasure lantern',lamp.position.clone(),s); light.diffuse=Color3.FromHexString('#ffc783');light.intensity=1.1;light.range=13;
    }
    for(let i=0;i<4;i++) box('keepsake pedestal',-3.2+i*2.15,5.15,-20,1.3,1.3,1.3,dark);
  }
  refresh(state: TreasureState, relicSlots:readonly number[]): void {
    this.treasures?.dispose(false,true); const root=this.treasures=new TransformNode('earned treasures aboard',this.scene);
    for(let i=0;i<relicSlots.length;i++) {
      const id=relicSlots[i]!; if(!state.relics.includes(id)) continue;
      const relic=buildRelic(this.scene,id); relic.parent=root;
      const bounds=relic.getHierarchyBoundingVectors(true); const size=bounds.max.subtract(bounds.min);
      const scale=1.5/Math.max(size.x,size.y,size.z); relic.scaling.setAll(scale);
      relic.position.set(-3.2+i*2.15,5.8-bounds.min.y*scale,-20);
    }
    // Chests stay individually visible aboard until their gold is delivered to the cave.
    this.cargo.show(state.pending.map((_, i) => ({
      x: i % 2 ? 3.1 : -3.1, y: 4.54 + Math.floor(i / 12) * 1.05,
      z: -12.8 - Math.floor(i % 12 / 2) * 1.15, scale: .37,
    })));

  }
}
