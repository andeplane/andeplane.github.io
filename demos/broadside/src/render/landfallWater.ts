import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { WorldStyle } from "./worldStyle";

Effect.ShadersStore.landfallWaterVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform float clock;
varying vec3 shore;
void main() {
  float depth = uv.x;
  float tide = smoothstep(.18, 3., depth);
  float wave = tide*(.07*sin(dot(position.xz,vec2(.31,.24))+clock*1.2)
                   +.045*sin(dot(position.xz,vec2(.12,-.46))+clock*.83));
  vec3 p=position+vec3(0.,wave,0.); shore=vec3(p.xz,depth+wave);
  gl_Position=worldViewProjection*vec4(p,1.);
}`;
Effect.ShadersStore.landfallWaterFragmentShader = `
precision highp float;
varying vec3 shore;
uniform vec3 deep, shallow, foam, horizon, eye;
uniform float clock;
void main(){
  vec2 p=shore.xy;
  float dist=length(vec3(p.x,0.,p.y)-eye);
  float d=shore.z;
  float s=sin(dot(p,vec2(.64,1.1))+clock*1.46+.75*sin(p.x*.38));
  float r=sin(dot(p,vec2(-1.4,.39))-clock*.92+s*1.1);
  float tiny=sin(dot(p,vec2(2.53,-1.82))+clock*1.57+r);
  vec3 base=mix(shallow,deep,smoothstep(.0,5.8,d));
  float height=s*.44+r*.32+tiny*.19;
  vec3 n=normalize(vec3(.13*s+.07*tiny,1.,.12*r+.05*tiny));
  vec3 v=normalize(eye-vec3(p.x,0.,p.y));
  float fres=pow(1.-max(0.,dot(n,v)),3.);
  base=mix(base,horizon,.44*fres);
  base*=1.+height*.06*(1.-smoothstep(38.,165.,dist));
  vec3 halfVec=normalize(v+normalize(vec3(-.48,.54,.69)));
  base+=vec3(1.,.94,.78)*pow(max(0.,dot(halfVec,n)),150.)*.52;
  float ripple=d+.075*s+.04*r;
  float edge=1.-smoothstep(.015,.11,abs(ripple-.10-.10*sin(clock*.85+p.x*.09+p.y*.12)));
  float band=1.-smoothstep(.015,.10,abs(ripple-.58-.14*sin(clock*.77+p.y*.16)));
  base=mix(base,foam,(.74*edge+.38*band)*smoothstep(-.12,.17,height+.36));
  base=mix(base,horizon,smoothstep(80.,520.,dist));
  gl_FragColor=vec4(base,1.);
}`;

/** Water carries the actual seabed depth, so the surf curls around each generated cove. */
export function buildLandfallWater(scene: Scene, floor:(x:number,z:number)=>number, style:WorldStyle) {
  const mesh=new Mesh("breaking waves over the island shelf",scene);
  const coordinates=[-650,-290,-160,-100,-65,...Array.from({length:145},(_,i)=>i*2/3-48),65,100,160,290,650];
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const n=coordinates.length;
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const x=coordinates[i]!,z=coordinates[j]!;
    positions.push(x,0,z);uvs.push(Math.max(-2,Math.min(12,-floor(x,z))),0);
    if(i<n-1 && j<n-1) {
      const k=i+j*n;indices.push(k,k+1,k+n,k+1,k+n+1,k+n);
    }
  }
  const data=new VertexData(); data.positions=positions;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);
  const m=new ShaderMaterial("tidal bands and sunlight",scene,{vertex:"landfallWater",fragment:"landfallWater"},
    {attributes:["position","uv"],uniforms:["worldViewProjection","clock","deep","shallow","foam","horizon","eye"]});
  m.backFaceCulling=false;
  m.setColor3("deep",Color3.FromHexString(style.deepWater));m.setColor3("shallow",Color3.FromHexString(style.shallowWater));
  m.setColor3("foam",Color3.FromHexString(style.foam));m.setColor3("horizon",Color3.FromHexString(style.fog));
  mesh.material=m;mesh.isPickable=false;mesh.freezeWorldMatrix();
  return (time:number)=>{m.setFloat("clock",time);m.setVector3("eye",scene.activeCamera!.position);};
}
