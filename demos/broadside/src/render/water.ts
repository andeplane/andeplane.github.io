import { Effect } from "@babylonjs/core/Materials/effect.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { DEFAULT_WAVES } from "../sim/waves";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PALETTE, SUN_DIRECTION } from "./palette";
import type { VoyageWeather } from "../game/weather";
import { wrapCoordinate } from "../sim/math";
import { worldStyle } from "./worldStyle";

export const MAX_ISLANDS = 12;
export const MAX_SHIPS = 8;
const MAX_WHIRLPOOLS = 3;
const GRID_SIZE = 420;
const GRID_SUBDIVISIONS = 160;

Effect.ShadersStore["oceanVertexShader"] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float amplitude;
uniform vec4 whirlpools[3]; // x, z, radius, spin
uniform vec4 waves[4]; // dirX, dirZ, wavelength, steepness
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

void main() {
  vec3 p = (world * vec4(position, 1.0)).xyz;
  vec3 disp = vec3(0.0);
  float sx = 0.0;
  float sz = 0.0;
  float crest = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = waves[i];
    float k = 6.2831853 / w.z;
    float c = sqrt(9.8 / k);
    float a = (w.w / k) * amplitude;
    float f = k * (dot(w.xy, p.xz) - c * time);
    float cf = cos(f);
    // Horizontal pinch sharpens crests (kept small so ships stay in sync with the sim).
    disp.xz += w.xy * a * cf * 0.45;
    disp.y += a * sin(f);
    sx += w.x * a * k * cf;
    sz += w.y * a * k * cf;
    crest += max(0.0, sin(f)) * w.w;
  }
  p += disp;
  for (int i=0; i<3; i++) {
    vec4 w = whirlpools[i];
    if (w.z <= 0.0) continue;
    float r = length(p.xz-w.xy)/w.z;
    float dip = 1.0-smoothstep(0.0,1.0,r);
    p.y -= dip*dip*1.25;
  }
  vWorld = p;
  vNormal = normalize(vec3(-sx, 1.0, -sz));
  vCrest = crest;
  gl_Position = viewProjection * vec4(p, 1.0);
}
`;

Effect.ShadersStore["oceanFragmentShader"] = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
uniform float storm;
uniform float rain;
uniform float clouds;
uniform float flash;
uniform vec3 cameraPosition;
uniform vec3 sunDirection; // toward the sun
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 foamColor;
uniform vec3 skyTop;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform vec4 whirlpools[3]; // x, z, radius, spin
uniform vec4 islands[${MAX_ISLANDS}]; // x, z, radius, -
uniform vec4 ships[${MAX_SHIPS}];     // x, z, heading, length (length 0 = unused)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = vWorld.xz;
  // From below: refracted daylight through the wave ceiling and a soft Snell window.
  // The surface must not look like the same opaque aerial ocean turned upside down.
  if (cameraPosition.y < vWorld.y - .12) {
    vec3 up = normalize(vWorld-cameraPosition);
    float window = smoothstep(.62,.76,up.y);
    float shimmer = noise(p*.3+vec2(time*.12,-time*.08));
    vec3 ceiling = mix(deepColor*.7,shallowColor*.7,shimmer*.45);
    vec3 daylight = mix(horizon,skyTop,smoothstep(.65,1.,up.y));
    ceiling = mix(ceiling,daylight,window*(.65+.15*shimmer));
    float sun = pow(max(0.,dot(up,sunDirection)),48.);
    ceiling += sunColor*sun*(.65-storm*.4)+vec3(.09,.17,.19)*flash;
    float haze = 1.-exp(-length(vWorld-cameraPosition)*.008);
    gl_FragColor=vec4(mix(ceiling,vec3(.031,.282,.329),haze),1.);
    return;
  }
  float r1 = noise(p * 0.2 + vec2(time * 0.07, 0.0));
  float r2 = noise(p * 0.26 - vec2(0.0, time * 0.08));
  // Broad, calm swells with fine animated ripples, not a field of white foam.
  vec3 N = normalize(vec3(vNormal.x * (0.35 + storm * 0.55) + sin(p.y * 1.2 + time) * 0.015, 1.0,
    vNormal.z * (0.35 + storm * 0.55) + sin(p.x * 1.5 - time * 0.8) * 0.015));
  vec3 V = normalize(cameraPosition - vWorld);
  float shoreDist = 1e5;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 isl = islands[i];
    if (isl.z <= 0.0) continue;
    shoreDist = min(shoreDist, length(p - isl.xy) - isl.z);
  }
  float shallow = 1.0 - smoothstep(1.0, 23.0, shoreDist);
  vec3 col = mix(deepColor, shallowColor, shallow);
  col *= (0.9 + dot(N, sunDirection) * 0.13) * (0.82 + noise(p * 0.022 + vec2(time * 0.012, -time * 0.008)) * 0.18);
  // Broad drifting cloud shadows give the squall depth without overlay planes.
  col *= 1.0 - clouds * smoothstep(.25, .72, fbm(p * .017 + vec2(time * .027, -time * .015))) * .28;
  float rippleLine = smoothstep(0.96, 1.0, sin(p.y * 0.62 + sin(p.x * 0.18) - time * 0.8));
  float rippleBreak = smoothstep(0.55, 0.75, noise(p * vec2(0.09, 0.18)));
  col = mix(col, shallowColor * 1.15, rippleLine * rippleBreak * 0.045);
  // Delicate caustic threads are confined to the shallows.
  float thread = abs(sin(p.x * 0.72 + sin(p.y * 0.38) + time * 0.35) * sin(p.y * 0.7 - time * 0.22));
  col += shallowColor * smoothstep(0.88, 0.99, thread) * shallow * 0.09;
  vec3 R = reflect(-V, N);
  float spec = pow(max(0.0, dot(R, sunDirection)), 160.0);
  col += sunColor * spec * 0.13;
  float fres = pow(1.0 - max(0.0, dot(N, V)), 4.0);
  col = mix(col, horizon, fres * 0.13);
  // A narrow, softly broken surf line around beaches.
  float shoreFoam = (1.0 - smoothstep(0.2, 2.2, shoreDist)) * smoothstep(-1.6, -0.4, shoreDist);
  float waveBand = 1.0 - smoothstep(0.15, 0.65, abs(shoreDist - (2.0 + sin(time * 0.8) * 0.7)));
  shoreFoam = max(shoreFoam, waveBand * 0.2) * (0.65 + r2 * 0.35);
  float hullFoam = 0.0;
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    vec4 ship = ships[i];
    if (ship.w <= 0.0) continue;
    vec2 d = p - ship.xy;
    vec2 fwd = vec2(sin(ship.z), cos(ship.z));
    vec2 right = vec2(cos(ship.z), -sin(ship.z));
    vec2 local = vec2(dot(d, right), dot(d, fwd));
    float e = length(vec2(local.x / (ship.w * 0.17), local.y / (ship.w * 0.52)));
    float edge = (1.0 - smoothstep(1.02, 1.15, e)) * smoothstep(0.9, 1.02, e);
    hullFoam = max(hullFoam, edge * 0.24);
  }
  col = mix(col, foamColor, clamp(max(shoreFoam * 0.65, hullFoam), 0.0, 0.75));

  // Spiral foam and a dark eye are part of the water itself, with no overlay planes.
  for (int i=0; i<3; i++) {
    vec4 w = whirlpools[i];
    if (w.z <= 0.0) continue;
    vec2 d = p-w.xy;
    float r = length(d)/w.z;
    float mask = 1.0-smoothstep(0.78,1.12,r);
    float a = atan(d.y,d.x);
    float phase = a*3.0 + r*19.0 - time*w.w*2.7;
    float churn = noise(vec2(a*8.0-time*w.w, r*38.0+time*.7));
    float spiral = sin(phase + (churn-.5)*.7);
    float brokenFoam = smoothstep(.28,.7,churn);
    float foam = smoothstep(0.86,0.99,spiral) * smoothstep(0.12,0.38,r) * mask * brokenFoam;
    vec3 swirlingWater = mix(vec3(0.012,0.032,0.055), deepColor*0.8, smoothstep(0.05,0.5,r));
    swirlingWater *= .85 + .15*sin(phase)*mask;
    col = mix(col,swirlingWater,mask*0.88);
    col = mix(col,foamColor,foam*0.58);
    col += shallowColor * (1.0-smoothstep(0.025,0.075,abs(r-0.94))) * churn * 0.18;
  }
  // Wind-torn whitecaps and raindrop rings live on the sea, never on overlay planes.
  float cap = smoothstep(0.28, 0.43, vCrest) * smoothstep(0.5, 0.72, noise(p * 0.32 - time * 0.6));
  col = mix(col, foamColor, cap * storm * 0.38);
  vec2 rainCell = floor(p * 0.45);
  float dropAge = fract(time * 1.1 + hash(rainCell));
  vec2 dropCenter = vec2(hash(rainCell + 3.1), hash(rainCell + 7.8)) * 0.6 + 0.2;
  float ring = 1.0 - smoothstep(0.016, 0.05, abs(length(fract(p * 0.45) - dropCenter) - dropAge * 0.45));
  col += foamColor * ring * (1.0 - dropAge) * rain * 0.06;
  col += vec3(0.22, 0.29, 0.35) * flash;
  float dist = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface OceanShip {
  x: number;
  z: number;
  heading: number;
  length: number;
}

export class Ocean {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly shipData = new Float32Array(MAX_SHIPS * 4);
  private chapter = 0;
  private readonly shores: readonly { pos: { x: number; z: number }; radius: number }[];
  private shoreFocus = { x: Infinity, z: Infinity };

  constructor(
    scene: Scene,
    islands: readonly { pos: { x: number; z: number }; radius: number }[],
    fogDensity: number,
    private readonly periodicBounds?: number,
  ) {
    this.shores = islands;
    this.mesh = MeshBuilder.CreateGround(
      "ocean",
      { width: GRID_SIZE, height: GRID_SIZE, subdivisions: GRID_SUBDIVISIONS },
      scene,
    );
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial(
      "ocean",
      scene,
      { vertex: "ocean", fragment: "ocean" },
      {
        attributes: ["position"],
        uniforms: [
          "world",
          "viewProjection",
          "time",
          "amplitude",
          "storm",
          "rain",
          "clouds",
          "flash",
          "waves",
          "cameraPosition",
          "sunDirection",
          "deepColor",
          "shallowColor",
          "foamColor",
          "skyTop",
          "horizon",
          "sunColor",
          "fogColor",
          "fogDensity",
          "islands",
          "ships",
          "whirlpools",
        ],
      },
    );
    const m = this.material;
    m.backFaceCulling = false;
    m.setArray4(
      "waves",
      DEFAULT_WAVES.flatMap((w) => [
        Math.sin(w.direction),
        Math.cos(w.direction),
        w.wavelength,
        w.steepness,
      ]),
    );
    m.setFloat("amplitude", 1);
    m.setFloat("storm", 0);
    m.setFloat("rain", 0);
    m.setFloat("clouds", 0);
    m.setFloat("flash", 0);
    const sun = new Vector3(
      -SUN_DIRECTION.x,
      -SUN_DIRECTION.y,
      -SUN_DIRECTION.z,
    ).normalize();
    m.setVector3("sunDirection", sun);
    m.setColor3("deepColor", PALETTE.deepWater);
    m.setColor3("shallowColor", PALETTE.shallowWater);
    m.setColor3("foamColor", PALETTE.foam);
    m.setColor3("skyTop", PALETTE.skyTop);
    m.setColor3("horizon", PALETTE.horizon);
    m.setColor3("sunColor", PALETTE.sun);
    m.setColor3("fogColor", PALETTE.fog);
    m.setFloat("fogDensity", fogDensity);
    this.updateShores({ x: 0, z: 0 });
    m.setArray4("ships", Array.from(this.shipData));
    this.setWhirlpools([]);
    this.mesh.material = m;
  }

  setWhirlpools(
    whirlpools: readonly {
      x: number;
      z: number;
      radius: number;
      spin: number;
    }[],
  ): void {
    const data = new Float32Array(MAX_WHIRLPOOLS * 4);
    whirlpools
      .slice(0, MAX_WHIRLPOOLS)
      .forEach((w, i) => data.set([w.x, w.z, w.radius, w.spin], i * 4));
    this.material.setArray4("whirlpools", Array.from(data));
  }
  setChapter(chapter: number): void {
    this.chapter = chapter;
    const style = worldStyle(chapter);
    this.material.setColor3("deepColor", Color3.FromHexString(style.deepWater));
    this.material.setColor3("shallowColor", Color3.FromHexString(style.shallowWater));
    this.material.setColor3("fogColor", Color3.FromHexString(style.fog));
    this.material.setColor3("horizon", Color3.FromHexString(style.horizon));
    this.material.setColor3("foamColor", Color3.FromHexString(style.foam));
    this.material.setColor3("sunColor", Color3.FromHexString(style.sun));
  }
  setWeather(weather: VoyageWeather): void {
    this.material.setFloat("amplitude", weather.waves);
    this.material.setFloat("storm", weather.kind === "storm" ? 1 : weather.rain * 0.5);
    this.material.setFloat("rain", weather.rain);
    this.material.setFloat("clouds", weather.kind === "clear" ? 0 : weather.kind === "storm" ? 1 : .65);
    this.material.setFloat("fogDensity", weather.rain ? .0028 : .0014);
    if (weather.rain) {
      const style = worldStyle(this.chapter), scale = weather.kind === "storm" ? .66 : .78;
      this.material.setColor3("deepColor", Color3.FromHexString(style.deepWater).scale(scale));
      this.material.setColor3("shallowColor", Color3.FromHexString(style.shallowWater).scale(scale));
      this.material.setColor3("fogColor", Color3.FromHexString(style.fog).scale(weather.kind === "storm" ? .78 : 1));
      this.material.setColor3("horizon", Color3.FromHexString(style.horizon).scale(.7));
    }
  }
  setFlash(flash: number): void {
    this.material.setFloat("flash", flash * 0.45);
  }
  private updateShores(focus: { x: number; z: number }): void {
    if (Math.hypot(focus.x - this.shoreFocus.x, focus.z - this.shoreFocus.z) < 20) return;
    this.shoreFocus = { ...focus };
    const nearby = this.shores.map(i => this.periodicBounds ? {
      ...i, pos: { x: focus.x + wrapCoordinate(i.pos.x - focus.x, this.periodicBounds),
        z: focus.z + wrapCoordinate(i.pos.z - focus.z, this.periodicBounds) },
    } : i).sort((a, b) =>
      Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) - a.radius -
      (Math.hypot(b.pos.x - focus.x, b.pos.z - focus.z) - b.radius));
    const data = new Float32Array(MAX_ISLANDS * 4);
    nearby.slice(0, MAX_ISLANDS).forEach((i, n) => data.set([i.pos.x, i.pos.z, i.radius, 0], n * 4));
    this.material.setArray4("islands", Array.from(data));
  }

  update(
    time: number,
    camera: Vector3,
    focus: { x: number; z: number },
    ships: readonly OceanShip[],
  ): void {
    this.updateShores(focus);
    // Follow the camera in whole grid cells so vertices never swim.
    const cell = GRID_SIZE / GRID_SUBDIVISIONS;
    this.mesh.position.x = Math.round(focus.x / cell) * cell;
    this.mesh.position.z = Math.round(focus.z / cell) * cell;
    this.material.setFloat("time", time);
    this.material.setVector3("cameraPosition", camera);
    this.shipData.fill(0);
    ships
      .slice(0, MAX_SHIPS)
      .forEach((s, i) =>
        this.shipData.set([s.x, s.z, s.heading, s.length], i * 4),
      );
    this.material.setArray4("ships", Array.from(this.shipData));
  }
}
