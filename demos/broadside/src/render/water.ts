import { Effect } from "@babylonjs/core/Materials/effect.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { DEFAULT_WAVES } from "../sim/waves";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PALETTE, SUN_DIRECTION } from "./palette";

export const MAX_ISLANDS = 8;
export const MAX_SHIPS = 8;
const GRID_SIZE = 420;
const GRID_SUBDIVISIONS = matchMedia("(pointer: coarse)").matches ? 100 : 160;

Effect.ShadersStore["oceanVertexShader"] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float amplitude;
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
  float r1 = noise(p * 0.2 + vec2(time * 0.07, 0.0));
  float r2 = noise(p * 0.26 - vec2(0.0, time * 0.08));
  // Broad, calm swells with fine animated ripples, not a field of white foam.
  vec3 N = normalize(vec3(vNormal.x * 0.35 + sin(p.y * 1.2 + time) * 0.015, 1.0,
    vNormal.z * 0.35 + sin(p.x * 1.5 - time * 0.8) * 0.015));
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

  constructor(
    scene: Scene,
    islands: readonly { pos: { x: number; z: number }; radius: number }[],
    fogDensity: number,
  ) {
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
    const isl = new Float32Array(MAX_ISLANDS * 4);
    islands
      .slice(0, MAX_ISLANDS)
      .forEach((i, n) => isl.set([i.pos.x, i.pos.z, i.radius, 0], n * 4));
    m.setArray4("islands", Array.from(isl));
    m.setArray4("ships", Array.from(this.shipData));
    this.mesh.material = m;
  }

  setChapter(chapter: number): void {
    const colors = [
      ["#14364a", "#367f80", "#2c4858"],
      ["#102e44", "#316c74", "#243d50"],
      ["#142c42", "#396771", "#2d3a4c"],
      ["#1b2440", "#435779", "#2a3048"],
    ][chapter]!;
    this.material.setColor3("deepColor", Color3.FromHexString(colors[0]!));
    this.material.setColor3("shallowColor", Color3.FromHexString(colors[1]!));
    this.material.setColor3("fogColor", Color3.FromHexString(colors[2]!));
  }
  update(
    time: number,
    camera: Vector3,
    focus: { x: number; z: number },
    ships: readonly OceanShip[],
  ): void {
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
