import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { VoyageWeather } from "../game/weather";
import { worldStyle } from "./worldStyle";

Effect.ShadersStore.voyageSkyVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 direction;
void main() { direction = position; gl_Position = worldViewProjection * vec4(position, 1.0); }
`;
Effect.ShadersStore.voyageSkyFragmentShader = `
precision highp float;
varying vec3 direction;
uniform vec3 horizon;
uniform vec3 zenith;
uniform float time;
uniform float cloudCover;
uniform float night;
uniform float flash;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
float clouds(vec2 p) {
  float a=.55, v=0.;
  for(int i=0;i<4;i++){ v+=noise(p)*a; p=p*2.03+13.7; a*=.48; }
  return v;
}
void main() {
  vec3 d=normalize(direction);
  vec3 col=mix(horizon,zenith,smoothstep(-.08,.8,d.y));
  vec2 p=d.xz / (max(d.y,0.)+.35)*2.8 + vec2(time*.006,-time*.004);
  float c=clouds(p);
  float mass=smoothstep(.65-cloudCover*.3,.84-cloudCover*.34,c)*smoothstep(-.02,.25,d.y);
  vec3 cloudLight=mix(vec3(.82,.85,.81),horizon*.75,cloudCover);
  col=mix(col,cloudLight,mass*(.5+cloudCover*.42));
  // A moon above the haunted sea, partially hidden by the moving clouds.
  float moon=1.-smoothstep(.00065,.0011,1.-dot(d,normalize(vec3(.25,.5,1.))));
  float halo=pow(max(0.,dot(d,normalize(vec3(.25,.5,1.)))),180.);
  col+=vec3(.46,.59,.84)*halo*night*(1.-mass*.8);
  col=mix(col,vec3(.85,.9,1.),moon*night*(1.-mass*.85));
  col+=vec3(.3,.4,.55)*flash;
  gl_FragColor=vec4(col,1.);
}`;

/** Camera-centred sky: the captain can look up into moving cloud banks. */
export class VoyageSky {
  private mesh: Mesh;
  private material: ShaderMaterial;
  constructor(private scene: Scene, pack: number, weather: VoyageWeather) {
    const style = worldStyle(pack);
    this.mesh = MeshBuilder.CreateSphere("open sea sky", {
      diameter: 1100, segments: 20, sideOrientation: Mesh.BACKSIDE,
    }, scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.material = new ShaderMaterial("cloud banks and moonlight", scene,
      { vertex: "voyageSky", fragment: "voyageSky" }, {
        attributes: ["position"], uniforms: ["worldViewProjection", "horizon", "zenith", "time", "cloudCover", "night", "flash"],
      });
    const cover = weather.kind === "storm" ? 1 : weather.rain ? .8 : pack ? .6 : .12;
    this.material.setColor3("horizon", Color3.FromHexString(style.fog).scale(weather.kind === "storm" ? .78 : 1));
    this.material.setColor3("zenith", Color3.FromHexString(pack === 0 ? "#507ea3" : style.fog).scale(pack ? .65 : 1));
    this.material.setFloat("cloudCover", cover);
    this.material.setFloat("night", pack === 3 ? 1 : 0);
    this.material.disableDepthWrite = true;
    this.mesh.material = this.material;
  }
  update(time: number, flash: number): void {
    this.mesh.position.copyFrom(this.scene.activeCamera!.position);
    this.material.setFloat("time", time);
    this.material.setFloat("flash", flash);
  }
}
