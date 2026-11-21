import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
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
  float exposure = smoothstep(-.02, 2.4, depth);
  float swell = .085*sin(dot(position.xz,vec2(.31,.24))+clock*1.12)
              + .046*sin(dot(position.xz,vec2(.12,-.46))+clock*.84);
  float wash = .028+.036*sin(position.x*.14+position.z*.07+clock*.81);
  float wave = mix(wash,swell,exposure);
  vec3 p = position + vec3(0.,wave,0.);
  shore = vec3(p.xz,depth+wave);
  gl_Position = worldViewProjection*vec4(p,1.);
}`;
Effect.ShadersStore.landfallWaterFragmentShader = `
precision highp float;
varying vec3 shore;
uniform vec3 deep, shallow, foam, horizon, eye, sunDirection, sunColor;
uniform float clock, night;

float hash(vec2 p) { return fract(sin(dot(p,vec2(41.3,117.7)))*43758.5); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
             mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
// The zero crossings of two counter-moving wave fields make light and foam
// split and rejoin in irregular cells. These are anchored in world metres.
float cells(vec2 p, float time) {
  vec2 a = p + .54*vec2(sin(p.y*1.41+time*.63),cos(p.x*1.16-time*.52));
  return abs(sin(a.x+.39*a.y+time*.24) + .77*cos(a.y-.26*a.x-time*.27));
}
void main() {
  vec2 p=shore.xy;
  float d=shore.z, dist=length(vec3(p.x,0.,p.y)-eye);
  float near=1.-smoothstep(32.,145.,dist);
  float wind=noise(p*.063+vec2(clock*.016,0.));
  float drift=noise(p*.18+vec2(1.8,-clock*.031));
  float swell=dot(p,vec2(.18,.58))+clock*.86+drift*3.;
  float crossWave=dot(p,vec2(-.89,.35))-clock*.77+wind*3.6+sin(swell)*.55;
  float fine=dot(p,vec2(2.15,-.63))+clock*1.19+drift*4.3;
  float breeze=(.32+.68*smoothstep(.18,.78,wind))*near;
  vec2 slope=vec2(.18,.58)*cos(swell)*.18 + vec2(-.89,.35)*cos(crossWave)*.102
           + vec2(2.15,-.63)*cos(fine)*.028;
  vec3 n=normalize(vec3(-slope.x*breeze,1.,-slope.y*breeze));
  vec3 v=normalize(eye-vec3(p.x,0.,p.y));
  float fresnel=pow(1.-clamp(dot(n,v),0.,1.),3.2);
  // Warm sand is visible through very shallow water. Beyond the shelf the
  // sand contribution drops exponentially until only the pack's deep hue remains.
  float shelf=exp(-max(d,0.)*.43);
  float sand=exp(-max(d,0.)*1.66);
  vec3 water=mix(deep,shallow,shelf);
  vec3 bottom=mix(shallow,foam,.36)*(.91+.13*wind+.05*drift);
  water=mix(water,bottom,sand*.62);
  float caustic=(1.-smoothstep(.055,.26,cells(p*2.2,clock)))*smoothstep(.04,.45,d)
               *exp(-max(d,0.)*.85)*near;
  water+=shallow*caustic*.24*(1.-smoothstep(12.,80.,dist))*(1.-.91*night);
  water=mix(water,horizon,fresnel*.76);
  vec3 h=normalize(v+sunDirection);
  float facing=max(0.,dot(h,n));
  float glitter=pow(facing,145.)*.65+pow(facing,15.)*.085;
  water+=sunColor*glitter*near*(.38+.62*breeze)*(1.-night*.37);

  float breakers=sin(clock*.92+.29*p.x+.17*p.y+drift*2.8);
  float edge=d-.104-.079*breakers-.057*(wind-.5);
  float tidepool=1.-smoothstep(.025,.14,abs(edge));
  float fingers=1.-smoothstep(.09,.38,cells(p*4.1+drift,clock*.67));
  float froth=(tidepool*(.45+.48*fingers)
    + (1.-smoothstep(.07,.45,abs(edge-.19)))*fingers*.47)*(.54+.46*wind);
  water=mix(water,foam,clamp(froth,0.,.86)*near*(1.-.45*night));
  gl_FragColor=vec4(mix(water,horizon,smoothstep(96.,315.,dist)),1.);
}`;

/** Water carries the actual seabed depth, so the surf curls around each generated cove. */
export function buildLandfallWater(
  scene: Scene, floor: (x: number, z: number) => number, style: WorldStyle,
  night = false, sunDirection = new Vector3(-.48,.54,.69),
) {
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
      uniforms: ["worldViewProjection", "clock", "deep", "shallow", "foam", "horizon", "eye", "sunDirection", "sunColor", "night"],
    },
  );
  m.backFaceCulling = false;
  m.setColor3("deep", Color3.FromHexString(style.deepWater));
  m.setColor3("shallow", Color3.FromHexString(style.shallowWater));
  m.setColor3("foam", Color3.FromHexString(style.foam));
  m.setColor3("horizon", Color3.FromHexString(style.fog));
  m.setColor3("sunColor", Color3.FromHexString(night ? "#c7dcf9" : style.sun));
  m.setVector3("sunDirection", sunDirection.normalizeToNew());
  m.setFloat("night", night ? 1 : 0);
  mesh.material = m;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return (time: number) => {
    m.setFloat("clock", time);
    m.setVector3("eye", scene.activeCamera!.position);
  };
}
