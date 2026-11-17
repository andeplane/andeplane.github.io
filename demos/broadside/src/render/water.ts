import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { DEFAULT_WAVES } from "../sim/waves";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PALETTE, SUN_DIRECTION } from "./palette";
import type { VoyageWeather } from "../game/weather";
import { wrapCoordinate } from "../sim/math";
import { worldStyle, skyZenith } from "./worldStyle";
import { coastPhase, COAST_GLSL } from "./islandShape";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";

export const MAX_ISLANDS = 12;
export const MAX_SHIPS = 8;
const MAX_WHIRLPOOLS = 3;
const GRID_RINGS = 112;
const GRID_SEGMENTS = 192;
const GRID_SIZE = 1100;

/** A fixed budget radial surface: dense around the ship and continuous to the horizon. */
function oceanGrid(scene: Scene): Mesh {
  const mesh = new Mesh("ocean", scene);
  const positions = [0, 0, 0], indices: number[] = [];
  for (let ring = 1; ring <= GRID_RINGS; ring++) {
    const radius = GRID_SIZE * Math.pow(ring / GRID_RINGS, 2.3);
    for (let j = 0; j < GRID_SEGMENTS; j++) {
      const a = j / GRID_SEGMENTS * Math.PI * 2;
      positions.push(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    }
  }
  for (let j = 0; j < GRID_SEGMENTS; j++) indices.push(0, 1 + (j + 1) % GRID_SEGMENTS, 1 + j);
  for (let ring = 1; ring < GRID_RINGS; ring++) for (let j = 0; j < GRID_SEGMENTS; j++) {
    const a = 1 + (ring - 1) * GRID_SEGMENTS + j, b = 1 + ring * GRID_SEGMENTS + j;
    const an = 1 + (ring - 1) * GRID_SEGMENTS + (j + 1) % GRID_SEGMENTS;
    const bn = 1 + ring * GRID_SEGMENTS + (j + 1) % GRID_SEGMENTS;
    indices.push(a, an, b, an, bn, b);
  }
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.applyToMesh(mesh);
  return mesh;
}

/** Seamless crossed wave slopes, generated once; mipmaps prevent distant glitter crawling. */
function rippleTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture("crossed ocean ripple slopes", size, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const pixels = ctx.createImageData(size, size);
  const directions = [[1, 2], [2, -3], [3, 1], [-2, 5], [5, 2], [-3, -7], [7, 3], [4, 9], [-5, 6], [9, -4], [2, 11], [-7, -8]]
    .map(([x, z], i) => ({ x: x!, z: z!, weight: 1 / ((12 + i * 2) * Math.hypot(x!, z!)), phase: i * 2.399 }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = 0, sz = 0;
    for (const d of directions) {
      const a = Math.cos((x * d.x + y * d.z) * Math.PI * 2 / size + d.phase) * d.weight;
      sx += a * d.x; sz += a * d.z;
    }
    const i = (y * size + x) * 4;
    pixels.data[i] = Math.round(128 + sx * 190);
    pixels.data[i + 1] = Math.round(128 + sz * 190);
    pixels.data[i + 2] = 128; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); texture.update();
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  return texture;
}

Effect.ShadersStore["oceanVertexShader"] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float amplitude;
uniform vec4 whirlpools[3]; // x, z, radius, spin
uniform vec4 waves[4]; // dirX, dirZ, wavelength, steepness
uniform vec4 islands[${MAX_ISLANDS}];
${COAST_GLSL}
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
  float coast = 1e5;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    if (islands[i].z > 0.0) coast = min(coast, coastDistance(p.xz, islands[i]));
  }
  // A calm shoreline meets the beach; geometric waves stay in navigable water.
  disp *= smoothstep(-1.0, 8.0, coast);
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
uniform vec4 islands[${MAX_ISLANDS}]; // original phase survives periodic wrapping
uniform vec4 ships[${MAX_SHIPS}];     // x, z, heading, length (length 0 = unused)
uniform sampler2D ripples;
uniform float shipSpeeds[${MAX_SHIPS}];
${COAST_GLSL}

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
  float distanceToEye = length(cameraPosition - vWorld);
  vec2 slopes = texture2D(ripples, p * .075 + vec2(time * .014, time * .006)).rg * 2.0 - 1.0;
  slopes += (texture2D(ripples, p * .123 + vec2(-time * .009, time * .012)).gr * 2.0 - 1.0) * .55;
  // Normals keep detail on the water even when geometry is coarse in the distance.
  float detailFade = 1.0 - smoothstep(150.0, 800.0, distanceToEye);
  vec3 N = normalize(vec3(vNormal.x * .75 + slopes.x * (.45 + storm * .30) * detailFade, 1.0,
    vNormal.z * .75 + slopes.y * (.45 + storm * .30) * detailFade));
  vec3 V = normalize(cameraPosition - vWorld);
  float shoreDist = 1e5;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 isl = islands[i];
    if (isl.z <= 0.0) continue;
    shoreDist = min(shoreDist, coastDistance(p, isl));
  }
  // Broad dark sea, a narrow clear shelf, then the warm sand beneath the wash.
  float shelf = exp(-max(shoreDist, 0.0) * .17);
  float shallow = 1.0 - smoothstep(-1.0, 10.0, shoreDist);
  vec3 col = mix(deepColor * .42, shallowColor, shallow * .93);
  float broad = noise(p * .021 + vec2(time * .006, -time * .004));
  col *= .88 + broad * .20 + max(0.0, dot(N, sunDirection)) * .1;
  col *= 1.0 - clouds * smoothstep(.25, .72, fbm(p * .017 + vec2(time * .027, -time * .015))) * .25;
  // The shelf reads through the surface as filtered patches of submerged sand and rock.
  float sandPatch = fbm(p * .29 + slopes * .7);
  col += shallowColor * shelf * (sandPatch - .35) * .28;
  float caustic = abs(sin(p.x * 1.13 + sin(p.y * .71) + time * .7)
    * sin(p.y * 1.07 + sin(p.x * .63) - time * .5));
  col += shallowColor * smoothstep(.83, .98, caustic) * shallow * .13;
  vec3 R = reflect(-V, N);
  vec3 reflectedSky = mix(horizon, skyTop, smoothstep(-.05, .9, R.y));
  // Water's refractive index gives 2% reflection head-on and nearly all at grazing angles.
  float fresnel = .0204 + .9796 * pow(1.0 - max(0.0, dot(N, V)), 5.0);
  col = mix(col, reflectedSky * (.66 - clouds * .12), fresnel * .72);
  // A broad sun path with finer glints, widened as unresolved ripples recede.
  vec3 H = normalize(V + sunDirection);
  float roughness = .065 + storm * .06 + (1.0 - detailFade) * .18;
  float aa = roughness * roughness;
  float nh = max(0.0, dot(N, H));
  float denom = nh * nh * (aa - 1.0) + 1.0;
  float glitter = aa / max(.00003, 3.14159 * denom * denom);
  float glintF = .0204 + .9796 * pow(1.0 - max(0.0, dot(V, H)), 5.0);
  col += sunColor * min(.65, glitter * glintF * .13) * (1.0 - clouds * .65);
  // Backlit crest water stays translucent teal rather than turning every swell white.
  float through = pow(max(0.0, dot(-sunDirection, V)), 3.0) * max(0.0, vCrest - .12);
  col += shallowColor * through * .48;
  // Broken wash follows the actual irregular coast. Two receding fronts leave lace, never a solid ring.
  float wash = shoreDist + sin(time * .85 + p.x * .014) * .75;
  float front = exp(-pow((wash - 1.0) / 1.05, 2.0));
  float outerFront = exp(-pow((wash - 3.8) / .75, 2.0)) * .28;
  float lace = fbm(p * 1.7 + slopes * 2.0 - vec2(time * .11, time * .04));
  float bubbles = smoothstep(.28, .60, lace);
  float shoreFoam = max(front, outerFront) * bubbles * (.58 + .42 * noise(p * .17));
  float hullFoam = 0.0;
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    vec4 ship = ships[i];
    if (ship.w <= 0.0) continue;
    vec2 d = p - ship.xy;
    vec2 fwd = vec2(sin(ship.z), cos(ship.z));
    vec2 right = vec2(cos(ship.z), -sin(ship.z));
    vec2 local = vec2(dot(d, right), dot(d, fwd));
    float e = length(vec2(local.x / (ship.w * .17), local.y / (ship.w * .52)));
    float edge = exp(-pow((e - 1.0) * 12.0, 2.0));
    hullFoam = max(hullFoam, edge * bubbles * .54);
    // Surface-bound stern turbulence and a spreading V, with a fading broken trail.
    float speed = shipSpeeds[i];
    float back = -local.y - ship.w * .42;
    float trailLength = max(3.0, speed * 4.3);
    if (speed > .2 && back > 0.0 && back < trailLength) {
      float age = back / trailLength;
      float width = ship.w * .07 + back * .16;
      float outer = exp(-pow((abs(local.x) - width) / (.35 + back * .025), 2.0));
      float churn = exp(-pow(local.x / max(.2, width * .7), 2.0)) * .48;
      float trail = max(outer, churn) * smoothstep(0.0, 1.5, back)
        * pow(1.0 - age, 1.2) * min(1.0, speed * .15);
      hullFoam = max(hullFoam, trail * (.18 + bubbles * .82) * .7);
    }
  }
  col = mix(col, foamColor, clamp(max(shoreFoam * .82, hullFoam), 0.0, .88));

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
  speed?: number;
}

export class Ocean {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly rippleMap: DynamicTexture;
  private readonly shipData = new Float32Array(MAX_SHIPS * 4);
  private readonly shipSpeeds = new Float32Array(MAX_SHIPS);
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
    this.mesh = oceanGrid(scene);
    this.rippleMap = rippleTexture(scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial(
      "ocean",
      scene,
      { vertex: "ocean", fragment: "ocean" },
      {
        attributes: ["position"],
        samplers: ["ripples"],
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
          "shipSpeeds",
          "whirlpools",
        ],
      },
    );
    const m = this.material;
    m.setTexture("ripples", this.rippleMap);
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
    m.setFloats("shipSpeeds", Array.from(this.shipSpeeds));
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
    this.material.setColor3("skyTop", Color3.FromHexString(skyZenith(chapter)));
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
    } : i).map((i, n) => ({ ...i, phase: coastPhase(this.shores[n]!) })).sort((a, b) =>
      Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) - a.radius -
      (Math.hypot(b.pos.x - focus.x, b.pos.z - focus.z) - b.radius));
    const data = new Float32Array(MAX_ISLANDS * 4);
    nearby.slice(0, MAX_ISLANDS).forEach((i, n) => data.set([i.pos.x, i.pos.z, i.radius, i.phase], n * 4));
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
    const cell = .5;
    this.mesh.position.x = Math.round(focus.x / cell) * cell;
    this.mesh.position.z = Math.round(focus.z / cell) * cell;
    this.material.setFloat("time", time);
    this.material.setVector3("cameraPosition", camera);
    this.shipData.fill(0);
    this.shipSpeeds.fill(0);
    ships
      .slice(0, MAX_SHIPS)
      .forEach((s, i) =>
        this.shipData.set([s.x, s.z, s.heading, s.length], i * 4),
      );
    ships.slice(0, MAX_SHIPS).forEach((ship, i) => { this.shipSpeeds[i] = Math.max(0, ship.speed ?? 0); });
    this.material.setArray4("ships", Array.from(this.shipData));
    this.material.setFloats("shipSpeeds", Array.from(this.shipSpeeds));
  }
}
