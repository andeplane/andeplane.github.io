import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { DEFAULT_WAVES } from "../sim/waves";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { PALETTE, SUN_DIRECTION } from "./palette";
import type { VoyageWeather } from "../game/weather";
import { wrapCoordinate } from "../sim/math";
import { worldStyle, skyZenith } from "./worldStyle";
import { coastPhase, COAST_GLSL } from "./islandShape";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";

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
  const directions = Array.from({ length: 48 }, (_, i) => {
    const angle = .4 + Math.sin(i * 2.399) * 1.15;
    const frequency = 4 + (i * 17.79) % 53;
    const x = Math.round(Math.cos(angle) * frequency), z = Math.round(Math.sin(angle) * frequency);
    return { x, z, weight: .029 * (1 - i / 180) / Math.hypot(x, z), phase: i * i * 1.739 };
  });
  const hash = (x: number, y: number) => {
    const value = Math.sin(((x + 8) % 8) * 127.1 + ((y + 8) % 8) * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = 0, sz = 0;
    for (const d of directions) {
      const a = Math.cos((x * d.x + y * d.z) * Math.PI * 2 / size + d.phase) * d.weight;
      sx += a * d.x; sz += a * d.z;
    }
    const px = x / size * 8, py = y / size * 8, ix = Math.floor(px), iy = Math.floor(py);
    let nearest = 9, next = 9;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const dx = ix + k + .15 + hash(ix + k, iy + j) * .7 - px;
      const dy = iy + j + .15 + hash(iy + j, ix + k) * .7 - py;
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) { next = nearest; nearest = distance; } else next = Math.min(next, distance);
    }
    const i = (y * size + x) * 4;
    pixels.data[i] = Math.round(128 + sx * 215);
    pixels.data[i + 1] = Math.round(128 + sz * 215);
    // Fine irregular bubble walls with open, transparent centres.
    pixels.data[i + 2] = Math.round(Math.max(0, 1 - (next - nearest) / .11) * 255);
    pixels.data[i + 3] = 255;
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
uniform sampler2D seabed;
uniform vec2 renderSize;
uniform float seabedReady;
uniform float waterLevel;
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
  vec2 wind = vec2(.92, .39);
  vec2 uv = vec2(dot(p, wind), dot(p, vec2(-wind.y, wind.x)));
  vec2 swellSlopes = texture2D(ripples, uv * vec2(.073, .095) + vec2(-time * .008, time * .003)).rg * 2.0 - 1.0;
  vec2 smallSlopes = texture2D(ripples, vec2(uv.y, -uv.x) * vec2(.23, .19) + vec2(-time * .017, -.1)).rg * 2.0 - 1.0;
  vec2 capillary = texture2D(ripples, p * .51 + vec2(time * .019, -time * .013)).gr * 2.0 - 1.0;
  float detailFade = 1.0 - smoothstep(45.0, 230.0, distanceToEye);
  vec2 slopes = swellSlopes * .43 * (.12 + .88 * detailFade) + smallSlopes * .085 * detailFade + capillary * .055 * detailFade;
  vec3 N = normalize(vec3(vNormal.x * .80 + slopes.x, 1.0, vNormal.z * .80 + slopes.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float shoreDist = 1e5;
  float shoreRadius = 20.0;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 isl = islands[i];
    if (isl.z <= 0.0) continue;
    float d = coastDistance(p, isl);
    if (d < shoreDist) { shoreDist = d; shoreRadius = isl.z; }
  }
  // A real shallow seafloor, refracted by surface slopes and filtered through the water column.
  // Depth follows the terrain skirt, with sand bars and channels breaking the optical contour.
  float sandBars = noise(p * .075) * .6 + noise(p * .19 + 7.8) * .4;
  float depth = max(.12, waterLevel + max(shoreDist, 0.0) * 22.0 / max(shoreRadius, 8.0));
  depth *= .75 + sandBars * .5;
  vec2 refractOffset = (N.xz + smallSlopes * .24) * min(3.0, depth) * .004;
  vec2 screenUv = gl_FragCoord.xy / renderSize;
  vec4 bottom = texture2D(seabed, clamp(screenUv + refractOffset, vec2(.002), vec2(.998)));
  float bottomVisible = bottom.a * seabedReady * (1.0 - smoothstep(3.8, 6.5, depth));
  vec3 transmission = exp(-vec3(.85, .16, .10) * depth / max(.35, V.y));
  vec3 waterBody = deepColor * .31;
  vec3 shelfLight = shallowColor * vec3(.28, 1.0, 1.04) * (.88 + .20 * max(0.0, dot(N, sunDirection)));
  vec3 scatter = mix(waterBody, shelfLight, exp(-depth * .20));
  vec3 col = mix(waterBody, scatter * (vec3(1.0) - transmission) + bottom.rgb * vec3(.08, 1.15, 1.85) * transmission, bottomVisible);
  // Coherent long wave faces and slow cloud shadow give the deep water its moving scale hierarchy.
  float facing = dot(N, normalize(vec3(sunDirection.x, .3, sunDirection.z)));
  col *= .80 + .25 * smoothstep(-.2, .7, facing) + .09 * noise(p * .045 + swellSlopes * 1.5);
  float cloudField = fbm(p * .012 + vec2(time * .009, -time * .006));
  col *= 1.0 - (.13 + clouds * .25) * smoothstep(.29, .7, cloudField);
  // Soft caustic nets appear on the actual bottom, disappearing with optical depth.
  vec2 causticUv = p * .55 + slopes * 1.1;
  float caustic = texture2D(ripples, causticUv + vec2(time * .012, -time * .009)).b;
  float caustic2 = texture2D(ripples, causticUv * 1.13 + vec2(-time * .008, time * .01)).b;
  col += shallowColor * min(caustic, caustic2) * exp(-depth * .24) * bottomVisible * .22;
  vec3 R = reflect(-V, N);
  vec3 reflectedSky = mix(horizon, skyTop, smoothstep(-.05, .9, R.y));
  vec2 reflectedUv = R.xz / (max(R.y, 0.0) + .35) * 2.8 + vec2(time * .006, -time * .004);
  float reflectedCloud = smoothstep(.52 - clouds * .16, .78 - clouds * .17, fbm(reflectedUv));
  reflectedSky = mix(reflectedSky * .7, horizon * .94 + sunColor * .035, reflectedCloud * (.35 + clouds * .3));
  float fresnel = .0204 + .9796 * pow(1.0 - max(0.0, dot(N, V)), 5.0);
  col = mix(col, reflectedSky * .48, min(.92, fresnel * .94 + .028));
  // Anisotropic fine glints follow the same wind as the crossed wave slopes.
  vec3 H = normalize(V + sunDirection);
  float nh = max(.01, dot(N, H));
  float hx = dot(H.xz - N.xz * H.y, wind);
  float hz = dot(H.xz - N.xz * H.y, vec2(-wind.y, wind.x));
  float roughness = .028 + storm * .045 + (1.0 - detailFade) * .13;
  float glitter = exp(-(hx * hx / (roughness * roughness * 2.4) + hz * hz / (roughness * roughness * .6)) / (nh * nh));
  float glintF = .0204 + .9796 * pow(1.0 - max(0.0, dot(V, H)), 5.0);
  col += sunColor * glitter * (.16 + glintF * 1.7) * (1.0 - clouds * .68);
  // The low sun catches selected wave ridges even outside the narrow mirror path.
  float ridge = smoothstep(.045, .10, dot(smallSlopes, normalize(sunDirection.xz)));
  col += sunColor * ridge * (.006 + .010 * (1.0 - V.y)) * (1.0 - clouds * .7);
  float through = pow(max(0.0, dot(-sunDirection, V)), 3.0) * max(0.0, vCrest - .12);
  col += shallowColor * through * .4;
  // A thin irregular leading break, separated from receding lace in the wet sand.
  float coastVariation = noise(p * .17 + vec2(time * .015, 0.0));
  float wash = shoreDist + sin(time * .9 + p.x * .025 + p.y * .018) * .65;
  float leading = exp(-pow((wash - .5 - coastVariation * .6) / .30, 2.0));
  float foamLace = texture2D(ripples, p * .28 + slopes * .25 - vec2(time * .014, time * .009)).b;
  float breakup = smoothstep(.18, .60, noise(p * .63 + vec2(time * .04, 0.0)));
  float washTrail = (1.0 - smoothstep(.6, 2.3, wash)) * smoothstep(-.2, .4, wash);
  float shoreFoam = leading * (.35 + foamLace * .6) * (.38 + breakup * .62)
    + washTrail * foamLace * breakup * .28;
  float hullFoam = 0.0;
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    vec4 ship = ships[i];
    if (ship.w <= 0.0) continue;
    vec2 d = p - ship.xy;
    vec2 fwd = vec2(sin(ship.z), cos(ship.z));
    vec2 right = vec2(cos(ship.z), -sin(ship.z));
    vec2 local = vec2(dot(d, right), dot(d, fwd));
    float speed = shipSpeeds[i];
    float e = length(vec2(local.x / (ship.w * .17), local.y / (ship.w * .52)));
    float edge = exp(-pow((e - 1.0) * 28.0, 2.0));
    hullFoam = max(hullFoam, edge * (.2 + foamLace * .8) * (.12 + min(1.0, speed * .12) * .45));
    float back = -local.y - ship.w * .42;
    float trailLength = max(3.0, speed * 5.5);
    if (speed > .2 && back > 0.0 && back < trailLength) {
      float age = back / trailLength;
      float curl = sin(back * .33 - time * 1.1) * (.12 + age * .8);
      float width = ship.w * .065 + back * .17;
      float wakeEdge = exp(-pow((abs(local.x + curl) - width) / (.22 + back * .018), 2.0));
      float churn = exp(-pow((local.x - curl) / max(.2, width * .55), 2.0)) * .27;
      float turbulence = texture2D(ripples, vec2(local.x * .35, back * .20 + time * .03) + swellSlopes * .2).b;
      float trail = max(wakeEdge * (.3 + turbulence * .7), churn * turbulence)
        * smoothstep(0.0, 1.2, back) * pow(1.0 - age, 1.5) * min(1.0, speed * .18);
      hullFoam = max(hullFoam, trail * .8);
      col += shallowColor * churn * (1.0 - age) * min(1.0, speed * .18) * .08;
    }
  }
  col = mix(col, foamColor, clamp(max(shoreFoam * .9, hullFoam), 0.0, .88));

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
  private readonly seabed: RenderTargetTexture;
  private seabedDirty = true;
  private seabedAspect = 0;
  private readonly shipData = new Float32Array(MAX_SHIPS * 4);
  private readonly shipSpeeds = new Float32Array(MAX_SHIPS);
  private chapter = 0;
  private readonly shores: readonly { pos: { x: number; z: number }; radius: number }[];
  private shoreFocus = { x: Infinity, z: Infinity };

  constructor(
    private readonly scene: Scene,
    islands: readonly { pos: { x: number; z: number }; radius: number }[],
    fogDensity: number,
    private readonly periodicBounds?: number,
  ) {
    this.shores = islands;
    this.mesh = oceanGrid(scene);
    this.rippleMap = rippleTexture(scene);
    // Only the local terrain and submerged reef heads enter this pass, never ships, props or sky.
    this.seabed = new RenderTargetTexture("refracted shallow seafloor", { width: 384, height: 768 }, scene, {
      generateMipMaps: false, generateDepthBuffer: true, samplingMode: Texture.BILINEAR_SAMPLINGMODE,
    });
    this.seabed.clearColor = new Color4(0, 0, 0, 0);
    this.seabed.renderList = [];
    this.seabed.ignoreCameraViewport = true;
    const seaClip = new Plane(0, 1, 0, -.02);
    let savedClipPlane = scene.clipPlane;
    this.seabed.onBeforeRenderObservable.add(() => {
      savedClipPlane = scene.clipPlane;
      seaClip.d = -this.mesh.position.y - .02;
      scene.clipPlane = seaClip;
    });
    this.seabed.onAfterRenderObservable.add(() => { scene.clipPlane = savedClipPlane; });
    scene.onNewMeshAddedObservable.add(() => { this.seabedDirty = true; });
    scene.onMeshRemovedObservable.add(() => { this.seabedDirty = true; });
    // Cabin/hold water has no associated shore list and uses the same surface without the seafloor pass.
    if (islands.length) scene.customRenderTargets.push(this.seabed);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial(
      "ocean",
      scene,
      { vertex: "ocean", fragment: "ocean" },
      {
        attributes: ["position"],
        samplers: ["ripples", "seabed"],
        uniforms: [
          "seabedReady",
          "waterLevel",
          "renderSize",
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
    m.setTexture("seabed", this.seabed);
    m.setFloat("seabedReady", 0);
    this.seabed.onAfterRenderObservable.add(() => m.setFloat("seabedReady", 1));
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
    const engine = this.scene.getEngine();
    const width = engine.getRenderWidth(), height = engine.getRenderHeight();
    const aspect = width / height;
    if (Math.abs(aspect - this.seabedAspect) > .001) {
      const scale = 768 / Math.max(width, height);
      this.seabed.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
      this.seabedAspect = aspect;
    }
    this.material.setVector2("renderSize", new Vector2(width, height));
    this.material.setFloat("waterLevel", this.mesh.position.y);
    if (this.seabedDirty) {
      this.seabed.renderList = this.scene.meshes.filter(mesh =>
        /^island--?[\d.]+--?[\d.]+$/.test(mesh.name) || mesh.name.startsWith("submerged reef head-"));
      this.seabedDirty = false;
    }
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
