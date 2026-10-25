import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { gemCount, gemSeeds, gemShape, GEM_NAMES } from "../game/gems";
import { caveFloor } from "../input/caveLayout";
import { exposedGold } from "../game/goldSurface";
import type { CoinBankArea } from "./coinHoard";

/** Small, bounded bonus collection. Settled poses survive revisits; no currency is stored here. */
export class CaveTreasure {
  private static settling: Promise<void> = Promise.resolve();
  private cancel: (()=>void) | null = null;
  private generation = 0;
  poses: Float32Array = new Float32Array();
  worker: Worker | null = null;
  error: string | null = null;
  status = "idle";
  private meshes: Mesh[];
  private stars: Mesh[];
  private starMaterial: StandardMaterial;
  private time = 0;
  private disposed = false;
  private settled = false;
  private matrix = Matrix.Identity();
  private q = Quaternion.Identity();
  private v = Vector3.Zero();
  private scale = Vector3.One();
  constructor(private scene: Scene, private area: CoinBankArea, private persistent: boolean, private namespace: string,
    private obstacles: readonly {x:number;z:number;rx:number;rz:number;top:number}[]) {
    this.meshes = GEM_NAMES.map((name,kind)=>{
      const mesh=new Mesh(`${area.name} physical ${name}`,scene), shape=gemShape(kind),data=new VertexData();
      data.positions=Array.from(shape.vertices);data.indices=shape.indices;
      const normals:number[]=[];VertexData.ComputeNormals(data.positions,shape.indices,normals);data.normals=normals;data.applyToMesh(mesh);mesh.convertToFlatShadedMesh();
      const m=new StandardMaterial(`${name} polished facets`,scene);
      m.diffuseColor=Color3.FromHexString(["#c8f5ff","#df1745","#13c987","#245de8"][kind]!);
      m.specularColor=new Color3(1,1,1);m.specularPower=110;m.emissiveColor=m.diffuseColor.scale(kind===0?.14:.09);m.maxSimultaneousLights=6;
      mesh.material=m;mesh.position.set(area.x,0,area.z);mesh.isPickable=false;mesh.setEnabled(false);mesh.alwaysSelectAsActiveMesh=true;
      return mesh;
    });
    const tex=new DynamicTexture("soft treasure star",64,scene,false),c=tex.getContext() as CanvasRenderingContext2D;
    c.clearRect(0,0,64,64);
    const glow=c.createRadialGradient(32,32,0,32,32,30);glow.addColorStop(0,"rgba(255,255,255,1)");glow.addColorStop(.12,"rgba(255,247,195,.85)");glow.addColorStop(1,"rgba(255,230,150,0)");
    c.fillStyle=glow;c.fillRect(0,0,64,64);c.fillStyle="#fffbe9";
    c.beginPath();c.moveTo(32,3);c.lineTo(35,29);c.lineTo(58,32);c.lineTo(35,35);c.lineTo(32,61);c.lineTo(29,35);c.lineTo(6,32);c.lineTo(29,29);c.closePath();c.fill();tex.hasAlpha=true;tex.update();
    this.starMaterial=new StandardMaterial("warm gold glints",scene);this.starMaterial.diffuseTexture=tex;this.starMaterial.emissiveColor=Color3.White();this.starMaterial.disableLighting=true;this.starMaterial.useAlphaFromDiffuseTexture=true;this.starMaterial.disableDepthWrite=true;this.starMaterial.backFaceCulling=false;
    this.stars=Array.from({length:8},(_,i)=>{
      const star=MeshBuilder.CreatePlane(`${area.name} treasure glint ${i}`,{size:.22},scene);star.material=this.starMaterial;star.billboardMode=Mesh.BILLBOARDMODE_ALL;star.isPickable=false;star.setEnabled(false);return star;
    });
    scene.onDisposeObservable.add(()=>{this.disposed=true;this.cancel?.();this.cancel=null;this.worker?.terminate();this.worker=null;});
  }
  private get key(){return `${this.namespace}.gems.v1.${this.area.world}`;}
  async prepare(coins:Float32Array,gold:number):Promise<void> {
    this.cancel?.();this.cancel=null;this.worker?.terminate();this.worker=null;this.error=null;
    const generation=++this.generation;
    const count=gemCount(gold);
    if(this.settled&&this.poses.length===count*7){this.upload();return;}
    this.settled=false;this.poses=new Float32Array();this.upload();
    if(!count){this.settled=true;return;}
    if(this.persistent)try{
      const saved=JSON.parse(localStorage.getItem(this.key)??"null");
      if(saved?.gold===gold&&Array.isArray(saved.poses)&&saved.poses.length===count*7&&saved.poses.every((n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<10000)
        &&saved.poses.every((_:number,i:number)=>i%7!==3||Math.abs(Math.hypot(...saved.poses.slice(i,i+4))-1)<.02)){
        this.poses=new Float32Array(saved.poses);this.settled=true;this.upload();return;
      }
    }catch{/* Cosmetic cache can be unavailable in private browsing. */}
    const poses=gemSeeds(coins,count,this.area,caveFloor);
    // Hydrating four old banks must not instantiate four WASM worlds together on a phone.
    const settle=async()=>{
      if(this.disposed||generation!==this.generation)return;
      await new Promise<void>((resolve)=>{
      this.cancel=resolve;
      let worker:Worker;
      const fail=(error:unknown)=>{this.error=`Gem physics: ${String(error)}`;this.worker?.terminate();this.worker=null;this.cancel=null;resolve();};
      try{worker=new Worker(new URL("../game/gemPhysics.worker.ts",import.meta.url),{type:"module"});this.worker=worker;}
      catch(error){fail(error);return;}
      worker.onerror=event=>fail(event.message);
      worker.onmessage=(event:MessageEvent<{poses?:Float32Array;done?:boolean;error?:string;frames?:number;moving?:number}>)=>{
        if(this.disposed||this.worker!==worker)return;
        this.status=event.data.error ?? `${event.data.frames}:${event.data.moving}`;
        if(event.data.error){fail(event.data.error);return;}
        if(event.data.poses){this.poses=event.data.poses;this.upload();}
        if(event.data.done){worker.terminate();this.worker=null;this.cancel=null;this.save(gold);resolve();}
      };
      worker.postMessage({poses,coins,area:this.area,obstacles:this.obstacles});
      });
    };
    const task=CaveTreasure.settling.then(settle,settle);
    CaveTreasure.settling=task.catch(()=>{});
    await task;
  }
  update(poses:Float32Array):void{this.settled=false;this.poses=poses;this.upload();}
  save(gold:number):void{
    this.settled=true;
    if(this.persistent&&!this.error)try{localStorage.setItem(this.key,JSON.stringify({gold,poses:Array.from(this.poses)}));}catch{/* Gold saves are independent. */}
  }
  private upload():void {
    this.meshes.forEach((mesh,kind)=>{
      const n=Math.max(0,Math.ceil((this.poses.length/7-kind)/4)),matrices=new Float32Array(n*16);
      for(let j=0;j<n;j++){
        const p=(kind+j*4)*7;this.v.set(this.poses[p]!,this.poses[p+1]!,this.poses[p+2]!);this.q.set(this.poses[p+3]!,this.poses[p+4]!,this.poses[p+5]!,this.poses[p+6]!);
        Matrix.ComposeToRef(this.scale,this.q,this.v,this.matrix);this.matrix.copyToArray(matrices,j*16);
      }
      if(n)mesh.thinInstanceSetBuffer("matrix",matrices,16,true);
      mesh.thinInstanceCount=n;mesh.setEnabled(n>0);
      if(n)mesh.thinInstanceRefreshBoundingInfo();
    });
  }
  surface(coins:Float32Array):void {
    const surface=exposedGold(coins);
    this.stars.forEach((star,i)=>{
      const coin=surface[Math.floor((i+.37)/this.stars.length*surface.length)];
      star.setEnabled(coin!==undefined);
      if(coin!==undefined){const p=coin*7;star.position.set(this.area.x+coins[p]!,coins[p+1]!+.1,this.area.z+coins[p+2]!);}
    });
  }
  animate(dt:number,reduced:boolean):void {
    this.time+=Math.min(dt,.1);
    this.stars.forEach((star,i)=>{
      // Slow, isolated catches of light, with no strobes or per-stone lights.
      const phase=(this.time*.19+i*.381+this.area.world*.17)%1;
      const light=reduced?0:Math.max(0,1-Math.abs(phase-.5)/.095);
      star.visibility=light*light*.85;star.scaling.setAll(.6+light*.65);
    });
  }
  get count(){return this.poses.length/7;}
}
