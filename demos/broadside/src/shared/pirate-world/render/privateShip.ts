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
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CaveWalker, type WalkIntent, type CaveObstacle } from '../input/caveWalk';
import { PEARL_BOARDING, PearlDeck, type PearlManifest } from '../input/pearlDeck';
import { isPhoneRendering } from './quality';
import type { TreasureState } from "../types";
import { CargoChests } from './cargoChests';
import { Ocean } from '../../../render/water';
import { buildRelic } from './relics';
import { buildTreasureCabin, type TreasureCabin } from './treasureCabin';
import { clearPrivateCabinShell } from './privateCabinShell';
import { fitPearlCabinFinish } from './pearlCabinFinish';
import { RELICS } from '../catalog';
import { VoyageSky } from '../../../render/voyageSky';
import { RewardChest } from './chest';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';

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
  private cabin!: TreasureCabin;
  private skyView: VoyageSky;
  private heroChest: RewardChest;
  private displays: TransformNode | null=null;
  private displayObstacles: CaveObstacle[]=[];
  private displayBrass!:StandardMaterial;
  private displayVelvet!:StandardMaterial;
  private constructor(engine: Engine, readonly deck: PearlDeck) {
    const s=this.scene=new Scene(engine); s.useRightHandedSystem=true;
    s.clearColor=Color4.FromHexString('#7d9eacff');
    s.fogMode=Scene.FOGMODE_EXP2; s.fogDensity=.0014; s.fogColor=Color3.FromHexString('#7d9eac');
    this.camera=new FreeCamera('aboard the purchased Pearl',new Vector3(0,7,-8),s);
    this.camera.inputs.clear(); this.camera.minZ=.06; this.camera.maxZ=600;
    this.camera.fovMode=Camera.FOVMODE_VERTICAL_FIXED; this.camera.fov=1.15;
    const sky=new HemisphericLight('soft sea sky',new Vector3(0,1,0),s);
    sky.intensity=.8; sky.diffuse=Color3.FromHexString('#c5dce8'); sky.groundColor=Color3.FromHexString('#5d4e3c');
    const sun=new DirectionalLight('late afternoon',new Vector3(-.5,-.7,.3),s);
    sun.intensity=1.05; sun.diffuse=Color3.FromHexString('#ffe3b6');
    sun.position.set(30,65,-30); sun.shadowFrustumSize=100; sun.shadowMinZ=1; sun.shadowMaxZ=150;
    this.shadows=new ShadowGenerator(isPhoneRendering(engine) ? 1024 : 2048,sun); this.shadows.usePercentageCloserFiltering=true;
    this.shadows.bias=.002; this.shadows.normalBias=.04;
    this.walker=new CaveWalker(
      [
        ...[-5,10].map(z=>({x:0,z,rx:.5,rz:.5,top:40})),
        ...[-4.6,4.6].flatMap(x=>[-8,-3,2,7].map(z=>({x,z,rx:.7,rz:1,top:7}))),
      ],
      (x,z)=>deck.floor(x,z,this.walker?.feet ?? 4.5) ?? this.walker?.feet ?? 4.5,
      (x,z)=>deck.walkable(x,z,this.walker.feet), true);
    this.ocean=new Ocean(s,[],s.fogDensity); this.ocean.setChapter(0);
    this.skyView=new VoyageSky(s,0,{kind:'clear',name:'At anchor',rain:0,drift:0,turbulence:0,waves:.8,lightning:false,direction:0,phase:0});
    s.imageProcessingConfiguration.toneMappingEnabled=true;
    s.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    s.imageProcessingConfiguration.exposure=1.1;
    this.cargo = new CargoChests(s, 'Pearl cargo');
    this.buildCabin();this.heroChest=new RewardChest(s);
    const chestMaterials=new Set(this.heroChest.root.getChildMeshes().map(mesh=>mesh.material));
    for(const material of chestMaterials)if(material instanceof StandardMaterial) {
      if(material.name==='aged mahogany'||material.name==='warm teak planks') {
        material.name='Pearl chest '+material.name;
        material.diffuseColor=Color3.FromHexString('#76604b');material.specularColor.set(.08,.065,.045);
      }else if(material.name==='hammered gold fittings') {
        material.diffuseColor=Color3.FromHexString('#8c7959');material.emissiveColor.set(0,0,0);
        material.specularColor=Color3.FromHexString('#b7a179');material.specularPower=48;
      }
    }
    const bandIron=s.getMaterialByName('cabin forged black iron');
    for(const mesh of this.heroChest.root.getChildMeshes())if(/^(forged band|curved lid gold band)$/.test(mesh.name))mesh.material=bandIron;
    const glow=s.getLightByName("chest's hidden glow");if(glow)glow.includedOnlyMeshes=this.heroChest.root.getChildMeshes();
    for(const mesh of this.heroChest.root.getChildMeshes())if(!/doubloon|light at lid seam/.test(mesh.name))this.shadows.addShadowCaster(mesh,false);
    this.enter();
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
      clearPrivateCabinShell(asset.meshes);
      await fitPearlCabinFinish(ship.scene,asset.materials);
      for (const mesh of asset.meshes) { mesh.receiveShadows=true; mesh.isPickable=false; ship.shadows.addShadowCaster(mesh); }
      ship.shadows.getShadowMap()!.refreshRate=0;
      return ship;
    } catch (error) {ship.scene.dispose(); throw error;}
  }
  enter(treasure=false): void {
    this.walker.reset(); this.walker.x=treasure ? 0 : PEARL_BOARDING.x;
    this.walker.z=treasure ? -12.75 : PEARL_BOARDING.z;
    this.walker.feet=this.deck.floor(this.walker.x,this.walker.z,5) ?? 4.5;
    this.walker.yaw=treasure ? Math.PI : PEARL_BOARDING.yaw; this.walker.pitch=.08;
  }
  get room(): string {
    const w=this.walker;
    return this.deck.inCabin(w.x,w.z) && w.feet<6.2 ? 'The treasure room'
      : w.z < -11 ? 'The quarterdeck' : w.z>9 ? 'The forecastle' : 'Aboard the Black Pearl';
  }
  get atHelm(): boolean {return this.walker.z < -17 && this.walker.feet>9;}
  walk(intent: WalkIntent,dt: number): void {
    this.walker.step(intent,dt);
    const w=this.walker;
    if(this.deck.inCabin(w.x,w.z)&&w.feet<6.2) {
      const ceiling=w.x>2.2&&w.z>-16.25 ? 7.02 : 9.77;
      if(w.eyeY>ceiling-.15){w.feet-=w.eyeY-(ceiling-.15);w.verticalSpeed=Math.min(0,w.verticalSpeed);w.grounded=false;}
    }
  }
  look(dx: number,dy: number): void {this.walker.look(dx,dy);}
  render(dt: number): void {
    this.time+=dt; const w=this.walker;
    this.camera.position.set(w.x,w.eyeY+w.bob,w.z);
    this.camera.setTarget(this.camera.position.add(new Vector3(Math.sin(w.yaw)*Math.cos(w.pitch),-Math.sin(w.pitch),Math.cos(w.yaw)*Math.cos(w.pitch))));
    this.ocean.update(this.time,this.camera.position,w,[]); this.skyView.update(this.time,0); this.scene.render();
  }
  private buildCabin(): void {
    const s=this.scene, room=this.cabin=buildTreasureCabin(s,this.shadows,{walkable:true});
    // The reward cabin's fitted joinery is reused at native ship scale, facing
    // aft. This is one connected room, not a scene portal or an opaque backdrop.
    const fitted=new TransformNode('fitted lower stern cabin',s);
    fitted.position.set(0,3.8,-16.75);fitted.scaling.z=-.7;
    for(const mesh of room.meshes)mesh.parent=fitted;
    for(const light of room.lamps)light.parent=fitted;
    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=room.timber)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},s);
      mesh.position.set(x,y,z);mesh.material=mat;mesh.receiveShadows=true;return mesh;
    };
    // A real stair soffit encloses the preserved starboard staircase above the
    // entrance. Its low headroom has the same bound in the walking controller.
    box('fitted staircase soffit',3.35,7.14,-13.8,2.3,.24,4.7);
    box('stairwell inboard panelling',2.25,8.5,-13.8,.18,2.7,4.7);
    box('stairwell aft panelling',3.35,8.5,-16.18,2.3,2.7,.18);
    box('flush oak doorway threshold',0,4.39,-10.9,2.35,.22,1.5);
    const brass=this.displayBrass=new StandardMaterial('keepsake display antique brass',s);
    brass.diffuseColor=Color3.FromHexString('#9f7a3e');brass.specularColor=Color3.FromHexString('#d3b272');brass.specularPower=64;
    const cushion=this.displayVelvet=new StandardMaterial('keepsake dark velvet rests',s);cushion.diffuseColor=Color3.FromHexString('#182323');cushion.specularColor.set(.02,.025,.025);
    // Functional cabinetry fills the low stair bay without pretending it is
    // another window or leaving a featureless box at the captain's eye level.
    box('under-stair stowage cabinet',4.02,5.48,-13.85,.48,1.9,3.2,room.frame);
    for(const z of[-14.65,-13.05]) {
      box('framed stowage cabinet door',3.75,5.48,z,.08,1.68,1.42);
      for(const edge of[-.65,.65])box('cabinet door oak stile',3.67,5.48,z+edge,.14,1.74,.11,room.frame);
      for(const y of[4.65,6.31])box('cabinet door oak rail',3.67,y,z,.14,.12,1.44,room.frame);
      for(const y of[4.9,6.05])box('forged cupboard strap',3.59,y,z,.045,.055,1.2,this.scene.getMaterialByName('cabin forged black iron') as StandardMaterial);
      const handle=MeshBuilder.CreateTorus('forged cabinet ring pull',{diameter:.14,thickness:.025,tessellation:16},s);
      handle.position.set(3.69,5.55,z+.35);handle.rotation.z=Math.PI/2;handle.material=this.scene.getMaterialByName('cabin forged black iron') as StandardMaterial;
    }
    const hemp=new StandardMaterial('secured cabin running rigging',s);hemp.diffuseColor=Color3.FromHexString('#8d7957');hemp.specularColor.set(.03,.025,.015);
    box('belaying rack fitted backing',-4.58,6.45,-13.05,.12,1.4,2.7,room.frame);
    for(const y of[5.78,7.12])box('belaying rack oak rail',-4.47,y,-13.05,.17,.12,2.85,room.frame);
    for(const z of[-14.4,-11.7])box('belaying rack oak stile',-4.47,6.45,z,.17,1.42,.12,room.frame);
    for(const z of[-13.9,-13.05,-12.2]) {
      const pin=MeshBuilder.CreateCylinder('turned belaying pin',{height:.28,diameter:.075,tessellation:12},s);pin.position.set(-4.32,6.92,z);pin.rotation.z=Math.PI/2;pin.material=room.timber;
      for(let i=0;i<4;i++) {
        const h=.44+(-z-12.2)*.045+i*.018,w=.17+i*.023;
        const path=Array.from({length:49},(_,n)=>{const a=n/48*Math.PI*2;return new Vector3(-4.3+i*.022+Math.sin(a)*.01,6.92-h+Math.cos(a)*h,z+Math.sin(a)*w+(1-Math.cos(a))*.025);});
        const coil=MeshBuilder.CreateTube('hanging bight of running rigging',{path,radius:.018,tessellation:6,cap:3},s);coil.material=hemp;
      }
      const hitch=MeshBuilder.CreateCylinder('rope hitch around belaying pin',{height:.1,diameter:.12,tessellation:12},s);hitch.position.set(-4.25,6.92,z);hitch.rotation.z=Math.PI/2;hitch.material=hemp;
      const tail=MeshBuilder.CreateTube('loose secured rope tail',{path:Array.from({length:22},(_,n)=>{const t=n/21;return new Vector3(-4.25-t*.14,6.6-t*.95,z+.16+t*.14+Math.sin(t*Math.PI)*.07);}),radius:.018,tessellation:6,cap:3},s);tail.material=hemp;
    }
  }
  refresh(state: TreasureState, relicSlots:readonly number[]): void {
    this.treasures?.dispose(false,true); const root=this.treasures=new TransformNode('earned treasures aboard',this.scene);
    this.displays?.dispose();this.displays=new TransformNode('mounted keepsake collection',this.scene);
    for(const obstacle of this.displayObstacles){const i=this.walker.obstacles.indexOf(obstacle);if(i>=0)this.walker.obstacles.splice(i,1);}this.displayObstacles=[];
    const earned=relicSlots.filter(id=>state.relics.includes(id));
    const places=earned.length===1?[state.pending.length ? .95 : 0]:earned.length===2?[-1.2,1.2]:earned.length===3?[-2.4,0,2.4]:[-2.7,-.9,.9,2.7];
    for(let i=0;i<earned.length;i++) {
      const id=earned[i]!,x=places[i]!,z=earned.length<=2?-19.35:-19;
      const stand=MeshBuilder.CreateLathe('turned keepsake stand',{shape:[new Vector3(.33,0),new Vector3(.36,.1),new Vector3(.25,.18),new Vector3(.19,.96),new Vector3(.28,1.07),new Vector3(.35,1.16)],tessellation:20,cap:3},this.scene);
      stand.parent=this.displays;stand.position.set(x,4.5,z);stand.material=this.cabin.frame;stand.receiveShadows=true;this.shadows.addShadowCaster(stand);
      const plate=MeshBuilder.CreateCylinder('brass keepsake tray',{height:.055,diameter:.73,tessellation:24},this.scene);plate.parent=this.displays;plate.position.set(x,5.69,z);plate.material=this.displayBrass;
      const rest=MeshBuilder.CreateCylinder('fitted velvet keepsake rest',{height:.075,diameter:.61,tessellation:24},this.scene);rest.parent=this.displays;rest.position.set(x,5.75,z);rest.material=this.displayVelvet;
      for(let j=0;j<3;j++){const a=j*Math.PI*2/3,claw=MeshBuilder.CreateSphere('brass keepsake cradle',{diameter:.07,segments:8},this.scene);claw.parent=this.displays;claw.position.set(x+Math.sin(a)*.21,5.81,z+Math.cos(a)*.21);claw.material=this.displayBrass;}
      const relic=buildRelic(this.scene,id);relic.parent=root;
      for(const mesh of relic.getChildMeshes())if(mesh.metadata?.sparkle!==undefined)mesh.dispose();
      const materials=new Set(relic.getChildMeshes().map(mesh=>mesh.material));
      for(const material of materials)if(material instanceof StandardMaterial){
        material.emissiveColor.scaleInPlace(.1);
        if(material.name==='luminous relic'){material.diffuseColor=id===2?Color3.FromHexString('#66213d'):material.diffuseColor.scale(.62);material.specularColor=Color3.FromHexString('#efd0dc');material.specularPower=140;}
        if(material.name==='polished ancient gold'){material.diffuseColor=Color3.FromHexString('#9d7b43');material.specularColor=Color3.FromHexString('#d6b77a');material.specularPower=72;}
      }
      const bounds=relic.getHierarchyBoundingVectors(true),size=bounds.max.subtract(bounds.min),scale=.66/Math.max(size.x,size.y,size.z);
      relic.scaling.setAll(scale);relic.position.set(x,5.82-bounds.min.y*scale,z);
      for(const mesh of relic.getChildMeshes()){mesh.receiveShadows=true;this.shadows.addShadowCaster(mesh);}
      const label=new DynamicTexture('engraved keepsake name',{width:512,height:128},this.scene,false),c=label.getContext() as CanvasRenderingContext2D;
      c.fillStyle='#241f19';c.fillRect(0,0,512,128);c.strokeStyle='#a98a50';c.lineWidth=5;c.strokeRect(5,5,502,118);c.fillStyle='#ead7a8';c.textAlign='center';c.textBaseline='middle';c.font='36px Georgia';c.fillText(RELICS[id]!.name,256,64,472);label.update();
      const mat=new StandardMaterial('engraved keepsake brass plaque',this.scene);mat.diffuseTexture=label;mat.specularColor.set(.12,.09,.04);mat.backFaceCulling=false;
      const plaque=MeshBuilder.CreatePlane('mounted keepsake name',{width:.85,height:.19},this.scene);plaque.parent=root;plaque.position.set(x,5.4,z+.4);plaque.material=mat;
      this.displayObstacles.push({x,z,rx:.55,rz:.6,top:6.12});
    }
    if(state.pending.length){
      this.heroChest.animate(5,0,true);this.heroChest.root.position.set(-.55,4.55,-18.4);this.heroChest.root.scaling.set(.5,.5,-.5);this.heroChest.root.rotation.set(0,0,0);
      this.displayObstacles.push({x:-.55,z:-18.4,rx:.9,rz:.6,top:6.4});
    }else this.heroChest.hide();
    this.walker.obstacles.push(...this.displayObstacles);
    this.cargo.show(state.pending.slice(1).map((_,i)=>({x:i%2?3.05:-3.05,y:4.48+Math.floor(i/10)*.575,z:-12.8-Math.floor(i%10/2)*1.1,scale:.37})),false);
    this.shadows.getShadowMap()?.resetRefreshCounter();
    const cargoWood=this.scene.getMaterialByName('Pearl cargo oak') as StandardMaterial;
    cargoWood.diffuseTexture=this.cabin.timber.diffuseTexture;cargoWood.bumpTexture=this.cabin.timber.bumpTexture;
    cargoWood.diffuseColor=Color3.FromHexString('#8b7a60');cargoWood.specularColor.set(.12,.1,.07);
  }
}
