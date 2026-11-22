import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import type { TidalGrotto } from "../game/landfallCoast";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import type { TownHouse } from "../game/landfallTown";
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
#ifdef SHELTERED_POOL
  wave=.008*sin(position.x*2.4+position.z*.85+clock*.67);
#endif
  vec3 p = position + vec3(0.,wave,0.);
  shore = vec3(p.xz,depth+wave);
  gl_Position = worldViewProjection*vec4(p,1.);
}`;
Effect.ShadersStore.landfallWaterFragmentShader = `
precision highp float;
varying vec3 shore;
uniform vec3 deep, shallow, foam, horizon, eye, sunDirection, sunColor;
uniform float clock, night;
uniform vec2 caveAxis;
#ifdef NIGHT_WATER
uniform vec4 windowLights[6], beacon;
uniform vec3 beamDirection;
#endif

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
#ifdef NIGHT_WATER
// A rippled surface reflects each source toward the eye. A window has angular
// size; its reflection stretches into dashes as the swell tips through that angle.
float lampGlint(vec4 lamp, vec3 surface, vec3 sight, vec3 reflected, float width) {
  vec3 delta=lamp.xyz-surface;
  float distance=max(length(delta),.01);
  vec3 incoming=delta/distance;
  float aboveLand=smoothstep(lamp.w-.035,lamp.w+.035,-lamp.y/max(.1,length(delta.xz)));
  float front=smoothstep(.02,.32,dot(incoming.xz,-sight.xz));
  vec2 across=vec2(sight.z,-sight.x)/max(.08,length(sight.xz));
  vec2 error=vec2(dot(incoming.xz-reflected.xz,across), incoming.y-reflected.y);
  vec2 spread=vec2(.017,.060)+vec2(width,.55)/distance;
  vec2 q=error/spread;
  float silver=exp(-dot(q,q)*.78);
  float skirt=exp(-dot(q,q)*.14);
  return aboveLand*front*(silver+.11*skirt)/(1.+.020*distance+.00023*distance*distance);
}
#endif
void main() {
  vec2 p=shore.xy;
  float d=shore.z, dist=length(vec3(p.x,0.,p.y)-eye);
#ifdef SHELTERED_POOL
  // Through the water, the player can see the actual sand and submerged stones.
  // At a grazing angle the surface catches light from the two sea doors.
  vec3 v=normalize(eye-vec3(p.x,0.,p.y));
  float ripple=sin(dot(p,vec2(3.7,.83))+clock*.77+noise(p*1.4)*3.);
  float crossing=sin(dot(p,vec2(-1.15,4.2))-clock*.61+.59*ripple);
  vec3 n=normalize(vec3(ripple*.027,1.,crossing*.021));
  float fresnel=pow(1.-clamp(dot(n,v),0.,1.),3.);
  vec3 sight=reflect(-v,n);
  float door=smoothstep(.48,.98,abs(dot(sight.xz,caveAxis)));
  float depth=smoothstep(.0,.85,d);
  vec3 pigment=mix(vec3(.13,.255,.225),vec3(.036,.13,.14),depth);
  float thread=1.-smoothstep(.025,.23,cells(p*8.,clock*.34));
  pigment+=vec3(.135,.205,.17)*thread*.36*exp(-2.*max(0.,d));
  pigment+=vec3(.16,.32,.38)*door*fresnel*(.66+.34*ripple);
  pigment*=mix(vec3(1.),vec3(.31,.43,.54),night);
  float opacity=.30+.35*depth+.24*fresnel;
  gl_FragColor=vec4(pigment,opacity);
#else
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
  float lowSun=1.-smoothstep(.18,.45,sunDirection.y);
  // The reflection at grazing angles stretches over the long swell even
  // beyond the fine ripples resolved near the camera.
  float path=pow(max(0.,dot(normalize(v.xz),-normalize(sunDirection.xz))),28.);
  float wavelets=.55+.45*sin(swell*.72+drift*2.);
  water+=sunColor*(glitter*(.2+.8*near)*(.38+.62*breeze)
         + lowSun*path*wavelets*(.07+.21*fresnel))*(1.-night*.37);

#ifdef NIGHT_WATER
  vec3 surface=vec3(p.x,0.,p.y);
  // Short capillary waves interrupt the reflection of a window in the gaps
  // between slower swells. Suppress unresolved detail towards the horizon.
  float smallWave=sin(dot(p,vec2(3.5,6.4))+clock*1.36+2.7*drift+.38*sin(crossWave));
  float smallCross=sin(dot(p,vec2(-6.1,2.3))-clock*1.16+2.2*wind);
  vec3 facets=normalize(n+vec3(.023*smallWave+.012*smallCross,0.,.034*smallWave)*near);
  vec3 reflected=reflect(-v,facets);
  float broken=mix(1.,.34+.74*smoothstep(-.62,.52,.68*smallWave+.32*smallCross),near);
  // The moon catches fine wave crests outside its main glitter path.
  water+=vec3(.021,.039,.057)*near*(.24+.76*wind)*(.5+.5*sin(crossWave+swell*.34));
  float litWindows=0.;
  for(int i=0;i<6;i++) {
    if(windowLights[i].w<1.) litWindows+=lampGlint(windowLights[i],surface,v,reflected,.94);
  }
  water+=vec3(.83,.43,.155)*(1.-exp(-litWindows*1.05))*broken;
  if(beacon.w<1.) {
    vec3 toSurface=normalize(surface-beacon.xyz);
    float sweep=smoothstep(.83,.99,dot(toSurface,beamDirection));
    float glint=lampGlint(beacon,surface,v,reflected,.64);
    water+=vec3(1.,.68,.34)*glint*(.38+1.72*sweep)*broken;
  }
#endif

  float breakers=sin(clock*.92+.29*p.x+.17*p.y+drift*2.8);
  float edge=d-.104-.079*breakers-.057*(wind-.5);
  float tidepool=1.-smoothstep(.025,.14,abs(edge));
  float fingers=1.-smoothstep(.09,.38,cells(p*4.1+drift,clock*.67));
  float froth=(tidepool*(.45+.48*fingers)
    + (1.-smoothstep(.07,.45,abs(edge-.19)))*fingers*.47)*(.54+.46*wind);
  water=mix(water,foam,clamp(froth,0.,.86)*near*(1.-.45*night));
  gl_FragColor=vec4(mix(water,horizon,smoothstep(96.,315.,dist)),1.);
#endif
}`;

// A small polar horizon per source measures which generated headlands stand
// between it and the sea. The reflected path lies along the camera bearing.
function lampHorizon(position: Vector3, floor: (x: number, z: number) => number) {
  const slopes = new Float32Array(48);
  for (let i = 0; i < slopes.length; i++) {
    const angle = i * Math.PI * 2 / slopes.length;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    let horizon = -8;
    for (let d = 2; d <= 80; d += 1.75) {
      const land = floor(position.x + dx * d, position.z + dz * d);
      if (land < 0) break;
      horizon = Math.max(horizon, (land - position.y) / d);
    }
    slopes[i] = horizon;
  }
  return (eye: Vector3) => {
    const turns = Math.atan2(eye.x-position.x,eye.z-position.z)/(Math.PI*2);
    const bearing = (turns - Math.floor(turns)) * slopes.length;
    const i = Math.floor(bearing);
    return slopes[i]! + (slopes[(i+1)%slopes.length]! - slopes[i]!) * (bearing-i);
  };
}

/** Water carries the actual seabed depth, so the surf curls around each generated cove. */
export function buildLandfallWater(
  scene: Scene, floor: (x: number, z: number) => number, style: WorldStyle,
  night = false, sunDirection = new Vector3(-.48,.54,.69),
  houses: readonly TownHouse[] = [], lighthouse: SpotLight | null = null, grotto?: TidalGrotto,
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
    indices: number[] = [], poolIndices: number[] = [];
  const axisX = Math.sin(grotto?.yaw ?? 0), axisZ = Math.cos(grotto?.yaw ?? 0);
  const n = coordinates.length;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = coordinates[i]!,
        z = coordinates[j]!;
      positions.push(x, 0, z);
      uvs.push(Math.max(-2, Math.min(12, -floor(x, z))), 0);
      if (i < n - 1 && j < n - 1) {
        const k = i + j * n;
        // The cave pool and ocean are separated by dry sand. Only the small
        // patch beneath the vault uses alpha blending and its shelter from wind.
        let faces = indices;
        if (grotto) {
          const dx = (x+coordinates[i+1]!)/2-grotto.entry.x;
          const dz = (z+coordinates[j+1]!)/2-grotto.entry.z;
          const along = dx*axisX+dz*axisZ, across = dx*axisZ-dz*axisX;
          if (along>2 && along<16.4 && across>-4.7 && across<.25) faces = poolIndices;
        }
        faces.push(k, k + 1, k + n, k + 1, k + n + 1, k + n);
      }
    }
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices.concat(poolIndices);
  data.applyToMesh(mesh);
  const m = new ShaderMaterial(
    "tidal bands and sunlight",
    scene,
    { vertex: "landfallWater", fragment: "landfallWater" },
    {
      attributes: ["position", "uv"],
      defines: night ? ["#define NIGHT_WATER"] : [],
      uniforms: ["worldViewProjection", "clock", "deep", "shallow", "foam", "horizon", "eye", "sunDirection", "sunColor", "night", "windowLights", "beacon", "beamDirection"],
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
  let pool: ShaderMaterial | null = null;
  if (poolIndices.length) {
    pool = new ShaderMaterial("translucent water beneath the sea doors",scene,
      {vertex:"landfallWater",fragment:"landfallWater"},{
        attributes:["position","uv"], uniforms:["worldViewProjection","clock","eye","caveAxis","night"],
        defines:["#define SHELTERED_POOL"], needAlphaBlending:true,
      });
    pool.backFaceCulling = false;
    pool.disableDepthWrite = true;
    pool.setVector2("caveAxis",new Vector2(axisX,axisZ));
    pool.setFloat("night",night ? 1 : 0);
    const waterMaterials = new MultiMaterial("open sea and sheltered tide pool",scene);
    waterMaterials.subMaterials.push(m,pool);
    mesh.material = waterMaterials;
    mesh.releaseSubMeshes();
    new SubMesh(0,0,mesh.getTotalVertices(),0,indices.length,mesh);
    new SubMesh(1,0,mesh.getTotalVertices(),indices.length,poolIndices.length,mesh);
  } else mesh.material = m;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  const townLights = night ? houses.slice(0,6).map(house => {
    // Average the pair of illuminated panes on the seaward façade of each house.
    const seaward = Math.sign(house.x);
    const position = new Vector3(house.x + seaward*(house.depth/2+.13),
      floor(house.x,house.z)+1.45, house.z);
    return { position, horizon: lampHorizon(position,floor) };
  }) : [];
  const windows: number[] = Array.from({length:24}, (_,i) => i%4===3 ? 2 : 0);
  const beacon = [0,0,0,2];
  const beaconHorizon = lighthouse && night ? lampHorizon(lighthouse.position.clone(),floor) : null;
  return (time: number) => {
    m.setFloat("clock", time);
    const eye = scene.activeCamera!.position;
    m.setVector3("eye", eye);
    if (pool) {
      pool.setFloat("clock",time);
      pool.setVector3("eye",eye);
    }
    if (night) {
      for (const [i,lamp] of townLights.entries()) {
        lamp.position.toArray(windows,i*4);
        windows[i*4+3] = lamp.horizon(eye);
      }
      m.setArray4("windowLights",windows);
      if (lighthouse && beaconHorizon) {
        lighthouse.position.toArray(beacon);
        beacon[3] = beaconHorizon(eye);
        m.setVector3("beamDirection",lighthouse.direction);
      }
      m.setArray4("beacon",beacon);
    }
  };
}
