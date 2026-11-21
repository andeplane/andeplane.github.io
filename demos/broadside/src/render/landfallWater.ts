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
// Two warped ripple directions sit inside broad patches of wind and still water.
float hash(vec2 p) { return fract(sin(dot(p,vec2(41.3,117.7)))*43758.5); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
             mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
void main(){
  vec2 p=shore.xy;
  float dist=length(vec3(p.x,0.,p.y)-eye);
  float d=shore.z;
  float windField=noise(p*.065+vec2(clock*.016,0.));
  float drift=noise(p*.19+vec2(1.8,-clock*.031));
  float s=sin(dot(p,vec2(.15,.61))+clock*.85+drift*4.9);
  float r=sin(dot(p,vec2(-.85,.33))-clock*.71+2.6*windField+s*.6);
  float fine=sin(dot(p,vec2(1.77,-.54))+clock*1.26+4.3*drift);
  float nearWeight=1.-smoothstep(10.,115.,dist);
  float breeze=.25+.75*smoothstep(.30,.81,windField);
  float crest=(s*.58+r*.31+fine*.11)*nearWeight*breeze;
  vec3 sea=mix(deep,shallow,(1.-smoothstep(-.12,3.6,d))*.73);
  sea*=.96+.08*windField+.025*crest;
  vec3 v=normalize(eye-vec3(p.x,0.,p.y));
  vec3 n=normalize(vec3(nearWeight*breeze*(.066*s+.02*fine),1.,nearWeight*breeze*.058*r));
  sea=mix(sea,horizon,.32*pow(1.-max(0.,dot(n,v)),3.));
  vec3 halfVec=normalize(v+normalize(vec3(-.48,.54,.69)));
  // The fine sun glints disappear toward the horizon and when the survey camera pulls back.
  sea+=vec3(.97,.9,.72)*pow(max(0.,dot(halfVec,n)),94.)*(.021+.07*nearWeight*nearWeight*breeze);
  float wash=d-.045-.085*sin(clock*.78+p.x*.11+p.y*.07+windField*3.)-.052*r;
  float edge=1.-smoothstep(.012,.085,abs(wash));
  float lace=smoothstep(.30,.70,noise(p*.83+vec2(0.,clock*.12))*.5+drift*.5);
  sea=mix(sea,foam,edge*lace*.58);
  vec3 base=mix(sea,horizon,smoothstep(92.,315.,dist));
  gl_FragColor=vec4(base,1.);
}`;

/** Water carries the actual seabed depth, so the surf curls around each generated cove. */
export function buildLandfallWater(scene: Scene, floor: (x: number, z: number) => number, style: WorldStyle) {
  const mesh = new Mesh("breaking waves over the island shelf", scene);
  const coordinates = [
    -1800,
    -650,
    -290,
    -160,
    -100,
    -65,
    ...Array.from({ length: 145 }, (_, i) => (i * 2) / 3 - 48),
    65,
    100,
    160,
    290,
    650,
    1800,
  ];
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const n = coordinates.length;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = coordinates[i]!,
        z = coordinates[j]!;
      positions.push(x, 0, z);
      uvs.push(Math.max(-2, Math.min(12, -floor(x, z))), 0);
      if (i < n - 1 && j < n - 1) {
        const k = i + j * n;
        indices.push(k, k + 1, k + n, k + 1, k + n + 1, k + n);
      }
    }
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  const m = new ShaderMaterial(
    "tidal bands and sunlight",
    scene,
    { vertex: "landfallWater", fragment: "landfallWater" },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "clock", "deep", "shallow", "foam", "horizon", "eye"],
    },
  );
  m.backFaceCulling = false;
  m.setColor3("deep", Color3.FromHexString(style.deepWater));
  m.setColor3("shallow", Color3.FromHexString(style.shallowWater));
  m.setColor3("foam", Color3.FromHexString(style.foam));
  m.setColor3("horizon", Color3.FromHexString(style.fog));
  mesh.material = m;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return (time: number) => {
    m.setFloat("clock", time);
    m.setVector3("eye", scene.activeCamera!.position);
  };
}
