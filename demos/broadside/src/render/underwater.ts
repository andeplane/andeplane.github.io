import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { Rng } from '../sim/rng';
import { reefDepth } from './sinkingCamera';

export const UNDERWATER_COLOR=Color3.FromHexString('#084854');
const vertex=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float vegetation;
varying vec3 p;
varying vec3 n;
void main(){
  vec3 v=position;
  v.x+=vegetation*uv.y*uv.y*(sin(time*1.15+v.z*.27)*.3+sin(time*.67+v.x*.6)*.22);
  p=(world*vec4(v,1.)).xyz;
  n=normalize(mat3(world)*normal);
  gl_Position=viewProjection*vec4(p,1.);
}`;
const fragment=`
precision highp float;
varying vec3 p;
varying vec3 n;
uniform vec3 cameraPosition;
uniform vec3 tint;
uniform float time;
uniform float vegetation;
uniform float daylight;
uniform float immersion;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float cells(vec2 v){vec2 i=floor(v),f=fract(v);float a=8.,b=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 o=vec2(float(x),float(y));vec2 q=o+vec2(hash(i+o),hash(i+o+7.3))-f;
  float d=dot(q,q);if(d<a){b=a;a=d;}else b=min(b,d);
}return sqrt(b)-sqrt(a);}
void main(){
  float grain=noise(p.xz*7.)*.12+noise(p.xz*27.)*.06;
  float ripples=sin(p.x*.95+sin(p.z*.12)*1.6)*.055;
  float moss=smoothstep(.45,.74,noise(p.xz*.12));
  vec3 sand=mix(tint,vec3(.22,.37,.32),moss*.36)*(1.+grain+ripples);
  vec3 leaf=tint*(.7+noise(p.xz*2.)*.3);
  float light=.48+.52*max(0.,dot(normalize(n),normalize(vec3(-.35,1.,-.2))));
  vec3 col=mix(sand,leaf,vegetation)*light*(.7+.3*daylight);
  vec2 flow=p.xz*.38+vec2(sin(time*.18+p.z*.05),cos(time*.17+p.x*.06))*.2;
  float caustic=pow(1.-smoothstep(.018,.15,cells(flow)),2.);
  col+=vec3(.25,.57,.5)*caustic*daylight*(.16+.3*max(0.,n.y));
  float fog=immersion*(1.-exp(-pow(length(cameraPosition-p)*.019,1.35)));
  col=mix(col,vec3(.031,.282,.329),fog);
  gl_FragColor=vec4(col,1.);
}`;
Effect.ShadersStore.reefVertexShader=vertex;
Effect.ShadersStore.reefFragmentShader=fragment;

/** A continuous rippled floor; the hull's landing area stays flatter than the surrounding reef. */
export function seabedHeight(x:number,z:number,depth:number):number {
  const outer=Math.min(1,Math.hypot(x*.8,z)/24);
  return -depth+outer*(Math.sin(x*.07+1)*Math.cos(z*.095)*1.35+Math.sin(x*.19+z*.11)*.38)
    +Math.sin(x*.8+Math.sin(z*.11))* .07;
}

function paint(mesh:Mesh,color:Color3):void {
  const colors:number[]=[];
  for(let i=0;i<mesh.getTotalVertices();i++)colors.push(color.r,color.g,color.b,1);
  mesh.setVerticesData('color',colors);
}
function merge(name:string,parts:Mesh[],material:Material,root:TransformNode):Mesh {
  const mesh=Mesh.MergeMeshes(parts,true,true)!;
  mesh.name=name;mesh.material=material;mesh.parent=root;mesh.isPickable=false;return mesh;
}
function fishModel(scene:Scene,color:Color3,root:TransformNode,material:StandardMaterial):Mesh {
  const body=MeshBuilder.CreateSphere('reef fish body',{diameter:1,segments:12},scene);
  body.scaling.set(.25,.4,1.35);paint(body,color);
  const tail=MeshBuilder.CreateCylinder('forked swimming tail',{diameter:.65,height:.05,tessellation:3},scene);
  tail.rotation.x=Math.PI/2;tail.position.z=-.8;paint(tail,color.scale(.7));
  const fin=MeshBuilder.CreateCylinder('dorsal fin',{diameter:.45,height:.045,tessellation:3},scene);
  fin.rotation.z=Math.PI/2;fin.position.set(0,.24,-.15);paint(fin,color.scale(.78));
  const parts=[body,tail,fin];
  for(const side of [-1,1]){
    const eye=MeshBuilder.CreateSphere('reef fish eye',{diameter:.065,segments:6},scene);
    eye.position.set(side*.18,.08,.44);paint(eye,Color3.FromHexString('#10282b'));parts.push(eye);
  }
  return merge('school of reef fish',parts,material,root);
}
interface School {mesh:Mesh;fish:{phase:number;radius:number;height:number;size:number;speed:number;matrix:Matrix}[];centre:Vector3}

/** Built lazily on sinking, with merged reef scenery and instanced fish/bubbles. */
export class UnderwaterView {
  readonly root:TransformNode;
  readonly depth:number;
  private readonly materials:ShaderMaterial[]=[];
  private readonly schools:School[]=[];
  private readonly bubbles:Mesh;
  private readonly bubbleBuffer:Float32Array;
  private readonly bubbleSeeds:{x:number;z:number;phase:number;size:number;matrix:Matrix}[]=[];
  private readonly scale=Vector3.One();
  private readonly rotation=Quaternion.Identity();
  private readonly identity=Quaternion.Identity();
  private readonly position=Vector3.Zero();
  constructor(private scene:Scene,seed:number,length:number,x:number,z:number,heading:number,phone=false) {
    this.depth=reefDepth(length);const depth=this.depth,rng=new Rng(seed^Math.round(x*19+z*31));
    this.root=new TransformNode('reef beneath the wreck',scene);this.root.position.set(x,0,z);this.root.rotation.y=heading;
    const surface=(name:string,hex:string,vegetation=0)=>{
      const m=new ShaderMaterial(name,scene,{vertex:'reef',fragment:'reef'}, {
        attributes:['position','normal','uv'],uniforms:['world','viewProjection','time','cameraPosition','tint','vegetation','daylight','immersion'],
      });
      m.setColor3('tint',Color3.FromHexString(hex));m.setFloat('vegetation',vegetation);
      m.setFloat('time',0);m.setFloat('daylight',1);m.setFloat('immersion',0);m.setVector3('cameraPosition',Vector3.Zero());
      m.backFaceCulling=false;this.materials.push(m);return m;
    };
    const floor=MeshBuilder.CreateGround('rippled sandy seabed',{width:240,height:240,subdivisions:phone?64:96},scene);
    const p=floor.getVerticesData('position')!;
    for(let i=0;i<p.length;i+=3)p[i+1]=seabedHeight(p[i]!,p[i+2]!,depth);
    const normals:number[]=[];VertexData.ComputeNormals(p,floor.getIndices()!,normals);
    floor.setVerticesData('position',p);floor.setVerticesData('normal',normals);
    floor.parent=this.root;floor.material=surface('sand ripples and refracted sunlight','#8cab8b');floor.isPickable=false;
    const rockMat=surface('weathered reef limestone','#52756c');
    const coralMat=new StandardMaterial('living coral',scene);coralMat.diffuseColor=Color3.White();coralMat.specularColor.set(.08,.09,.1);
    const rocks:Mesh[]=[],coral:Mesh[]=[],fronds:Mesh[]=[];
    const leaf=surface('swaying sea grass','#246c56',1);
    const coralColors=['#bd765c','#be965e','#6d8c9f','#936c91'];
    for(let i=0;i<(phone?42:66);i++){
      const a=rng.range(0,Math.PI*2),r=rng.range(13,88),px=Math.sin(a)*r,pz=Math.cos(a)*r;
      const y=seabedHeight(px,pz,depth),size=rng.range(1.1,4.2);
      const rock=MeshBuilder.CreateSphere('weathered reef rock',{diameter:2,segments:12},scene);
      rock.position.set(px,y+size*.23,pz);rock.scaling.set(size,size*.48,size*rng.range(.7,1.3));rock.rotation.set(rng.range(-.2,.2),a,0);rocks.push(rock);
      if(i%2===0){
        const c=Color3.FromHexString(rng.pick(coralColors));
        for(let j=0;j<5;j++){
          const stem=MeshBuilder.CreateCylinder('branching coral',{height:1,diameterTop:.15,diameterBottom:.25,tessellation:8},scene);
          const h=rng.range(.8,2);stem.scaling.y=h;
          stem.position.set(px+Math.sin(j*2.4)*size*.55,y+size*.6+h*.4,pz+Math.cos(j*2.4)*size*.45);
          stem.rotation.z=(j-2)*.22;paint(stem,c);coral.push(stem);
          const crown=MeshBuilder.CreateSphere('soft coral crown',{diameter:.6,segments:8},scene);
          crown.position.copyFrom(stem.position).addInPlace(new Vector3((j-2)*.12,h*.5,0));crown.scaling.set(1.4,.8,1.2);paint(crown,c);coral.push(crown);
        }
      }
      for(let j=0;j<4;j++){
        const h=rng.range(2.2,5.8),bx=px+size+rng.range(-1,1),bz=pz+rng.range(-2,2),by=seabedHeight(bx,bz,depth);
        const vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
        for(let k=0;k<=8;k++){
          const t=k/8,w=Math.sin(Math.PI*(t*.92+.03))*.16;
          for(const side of [-1,1]){vertices.push(bx+Math.sin(t*2.4+j)*t*.75+side*w,by+h*t,bz+t*.35);uvs.push((side+1)/2,t);}
          if(k<8){const v=k*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);}
        }
        const blade=new Mesh('kelp ribbon',scene),data=new VertexData();data.positions=vertices;data.indices=indices;data.uvs=uvs;
        const n:number[]=[];VertexData.ComputeNormals(vertices,indices,n);data.normals=n;data.applyToMesh(blade);fronds.push(blade);
      }
    }
    merge('sculpted reef outcrops',rocks,rockMat,this.root);
    merge('coral gardens',coral,coralMat,this.root);
    const kelp=Mesh.MergeMeshes(fronds,true,true)!;kelp.name='swaying kelp beds';kelp.material=leaf;kelp.parent=this.root;kelp.isPickable=false;
    const fishMat=new StandardMaterial('silver scales beneath the waves',scene);
    fishMat.diffuseColor=Color3.White();fishMat.specularColor.set(.65,.8,.75);fishMat.specularPower=90;
    for(let group=0;group<3;group++){
      const mesh=fishModel(scene,Color3.FromHexString(['#a9ced0','#d6b966','#6ba9c0'][group]!),this.root,fishMat);
      const fish=Array.from({length:phone?14:22},()=>({phase:rng.range(0,Math.PI*2),radius:rng.range(3,8),height:rng.range(-2,2),size:rng.range(.65,1.25),speed:rng.range(.18,.28),matrix:Matrix.Identity()}));
      const buffer=new Float32Array(fish.length*16);mesh.thinInstanceSetBuffer('matrix',buffer,16,false);mesh.alwaysSelectAsActiveMesh=true;
      const centre=[new Vector3(-14,-depth+6,-12),new Vector3(16,-8,8),new Vector3(-6,-depth*.58,-20)][group]!;
      this.schools.push({mesh,fish,centre});
    }
    this.bubbles=MeshBuilder.CreateSphere('air rising from the wreck',{diameter:1,segments:8},scene);this.bubbles.parent=this.root;
    const bubbleMat=new StandardMaterial('translucent air bubbles',scene);
    bubbleMat.diffuseColor.set(.28,.58,.61);bubbleMat.specularColor.set(.9,1,1);bubbleMat.specularPower=120; bubbleMat.alpha=.32;
    this.bubbles.material=bubbleMat;this.bubbles.isPickable=false;this.bubbles.alwaysSelectAsActiveMesh=true;
    for(let i=0;i<(phone?28:44);i++)this.bubbleSeeds.push({x:rng.range(-length*.18,length*.18),z:rng.range(-length*.32,length*.32),phase:rng.next(),size:rng.range(.06,.19),matrix:Matrix.Identity()});
    this.bubbleBuffer=new Float32Array(this.bubbleSeeds.length*16);this.bubbles.thinInstanceSetBuffer('matrix',this.bubbleBuffer,16,false);
    this.update(0,Vector3.Zero(),1,false,0);
  }
  update(time:number,camera:Vector3,daylight:number,reduced:boolean,sink=1):void {
    const immersion=Math.max(0,Math.min(1,-camera.y/3));
    for(const m of this.materials){m.setFloat('time',reduced?0:time);m.setVector3('cameraPosition',camera);m.setFloat('daylight',daylight);m.setFloat('immersion',immersion);}
    for(const school of this.schools){
      school.fish.forEach((fish,i)=>{
        const a=fish.phase+time*fish.speed;
        this.position.set(school.centre.x+Math.sin(a)*fish.radius,school.centre.y+fish.height+Math.sin(a*2)*.35,school.centre.z+Math.cos(a)*fish.radius*.65);
        this.scale.set(fish.size,fish.size,fish.size*(1+Math.sin(time*7+fish.phase)*.045));
        Quaternion.FromEulerAnglesToRef(0,Math.atan2(Math.cos(a),-Math.sin(a)*.65),Math.sin(a*2)*.05,this.rotation);
        Matrix.ComposeToRef(this.scale,this.rotation,this.position,fish.matrix);school.mesh.thinInstanceSetMatrixAt(i,fish.matrix,false);
      });
      school.mesh.thinInstanceBufferUpdated('matrix');
    }
    this.bubbles.setEnabled(sink>0);
    const hullY=-Math.min(1,sink)*Math.min(1,sink)*(this.depth-7);
    this.bubbleSeeds.forEach((bubble,i)=>{
      const age=(bubble.phase+time*.11)%1;
      this.position.set(bubble.x+Math.sin(time*.7+i)*.35,hullY+age*Math.max(0,-hullY-.2),bubble.z+Math.cos(time*.5+i)*.25);
      this.scale.setAll(bubble.size*(.6+age));
      Matrix.ComposeToRef(this.scale,this.identity,this.position,bubble.matrix);this.bubbles.thinInstanceSetMatrixAt(i,bubble.matrix,false);
    });
    this.bubbles.thinInstanceBufferUpdated('matrix');
  }
  dispose():void {this.root.dispose(false,true);}
}
