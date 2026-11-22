import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import daySky from "./landfallAssets/sky/day.webp";
import sunsetSky from "./landfallAssets/sky/sunset.webp";
import nightSky from "./landfallAssets/sky/night.webp";

export type IslandLight = "day" | "sunset" | "night";
export type LightSetting = IslandLight | "pack";

export function resolveLight(setting: LightSetting, world: number): IslandLight {
  if (setting !== "pack") return setting;
  return world === 3 ? "night" : world === 1 ? "sunset" : "day";
}

// Elevation and panorama azimuth match the source sun. The scene light, shadows
// and glints on the sea all use the same surface-to-light direction.
const lighting = {
  day: {
    sky: daySky, azimuth: -1.05, elevation: .84, solarU: .60, fog: "#a1bcc6",
    sun: "#ffe3bb", skyFill: "#c3d9f5", bounce: "#a28b72", key: 1.13, fill: .81,
  },
  sunset: {
    sky: sunsetSky, azimuth: -.88, elevation: .145, solarU: .595, fog: "#d3a298",
    sun: "#ffbd82", skyFill: "#b8cdef", bounce: "#867486", key: 1.12, fill: .69,
  },
  night: {
    sky: nightSky, azimuth: 2.71, elevation: .58, solarU: .573, fog: "#192b40",
    sun: "#a6c6ef", skyFill: "#8aa8d0", bounce: "#635d72", key: .42, fill: .29,
  },
};

export function islandLighting(light: IslandLight) {
  const p = lighting[light];
  const flat = Math.cos(p.elevation);
  return { ...p, direction: new Vector3(Math.sin(p.azimuth) * flat, Math.sin(p.elevation), Math.cos(p.azimuth) * flat) };
}

Effect.ShadersStore.landfallDomeVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 direction;
void main() { direction=position; gl_Position=worldViewProjection*vec4(position,1.); }`;
Effect.ShadersStore.landfallDomeFragmentShader = `
precision highp float;
varying vec3 direction;
uniform sampler2D panorama;
uniform vec3 horizon, lightDirection;
uniform float rotation, night, sunset;
void main() {
  vec3 d=normalize(direction);
  float az=atan(d.x,d.z)*.159154943+rotation;
  float elevation=asin(clamp(d.y,0.,1.))*.636619772;
  // Frame the diagonal dust lane above the shore and suppress the
  // photographed light pollution below the useful night-sky field.
  float latitude=mix(elevation,.19+.81*elevation,night);
  vec3 sky=texture2D(panorama,vec2(az,1.-latitude)).rgb;
  if(night>.5) {
    // Remove the long exposure sky pedestal to reveal the photographed dust lanes.
    vec3 exposure=max(sky-vec3(.278,.267,.241),0.);
    float luma=dot(exposure,vec3(.2126,.7152,.0722));
    vec3 stars=pow(mix(vec3(luma),exposure,.60)*1.60,vec3(2.10));
    sky=vec3(.008,.017,.035)+stars*vec3(.84,.93,1.04);
  } else if(sunset>.5) {
    float warmth=exp(-max(d.y,0.)*3.8);
    sky*=mix(vec3(.9,.90,1.04),vec3(1.11,.82,.74),warmth);
    float sun=max(dot(d,lightDirection),0.);
    sky+=vec3(.23,.12,.045)*pow(sun,100.);
  }
  float haze=smoothstep(-.016,night>.5?.20:.12,d.y);
  gl_FragColor=vec4(mix(horizon,sky,haze),1.);
}`;

export function buildIslandSky(scene: Scene, light: IslandLight, horizon: Color3) {
  const p = islandLighting(light);
  const dome = MeshBuilder.CreateSphere("coastal panorama", {diameter:1060,segments:24,sideOrientation:Mesh.BACKSIDE}, scene);
  const material = new ShaderMaterial("photographed hemisphere", scene, {vertex:"landfallDome",fragment:"landfallDome"}, {
    attributes:["position"], samplers:["panorama"], uniforms:["worldViewProjection","horizon","lightDirection","rotation","night","sunset"],
  });
  const panorama = new Texture(p.sky, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  panorama.wrapU = Texture.WRAP_ADDRESSMODE;
  panorama.wrapV = Texture.CLAMP_ADDRESSMODE;
  material.setTexture("panorama",panorama);
  material.setColor3("horizon",horizon);
  material.setVector3("lightDirection",p.direction);
  material.setFloat("rotation",p.solarU-p.azimuth/(Math.PI*2));
  material.setFloat("night",light==="night"?1:0);
  material.setFloat("sunset",light==="sunset"?1:0);
  material.disableDepthWrite = true;
  dome.material = material;
  dome.isPickable = false;
  dome.alwaysSelectAsActiveMesh = true;
  return () => dome.position.copyFrom(scene.activeCamera!.position);
}
