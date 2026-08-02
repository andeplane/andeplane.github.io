import {
  AdditiveBlending,
  FrontSide,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';
import { asset, loadMap } from './textures.ts';

/** How far the atmosphere shell reaches past the surface. */
const ATMOSPHERE_SCALE = 1.018;
/** The cloud deck, exaggerated from the real ~12 km so it shows visible parallax. */
const CLOUD_SCALE = 1.008;

/**
 * The planet. Gravitationally it is a point mass; visually it carries the whole frame.
 *
 * The surface is NASA imagery -- Blue Marble Next Generation with topography and
 * bathymetry for the day side, Black Marble for the night. Procedural continents were
 * tried first, and the honest verdict is that they never read as *Earth*: the eye
 * rejects wrong coastlines immediately, however good the noise is. What procedural does
 * win at is anything that moves, so the clouds and the atmosphere are still shaders.
 */
export class EarthView {
  readonly group = new Group();
  private readonly surface: ShaderMaterial;
  private readonly clouds: ShaderMaterial;
  private readonly atmosphere: ShaderMaterial;

  constructor(renderer: WebGLRenderer, radius: number) {
    this.surface = new ShaderMaterial({
      uniforms: {
        uDay: { value: loadMap(renderer, asset('earth_day.jpg'), true) },
        uNight: { value: loadMap(renderer, asset('earth_night.jpg'), true) },
        uWater: { value: loadMap(renderer, asset('earth_water.png'), false) },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uSpin: { value: 0 },
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
    });
    // A coarse sphere leaves a visibly polygonal silhouette against black, which is one
    // of the more reliable tells of a hobby project.
    this.group.add(new Mesh(new SphereGeometry(radius, 256, 128), this.surface));

    this.clouds = new ShaderMaterial({
      uniforms: {
        uSunDir: { value: new Vector3(1, 0, 0) },
        uSpin: { value: 0 },
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.group.add(new Mesh(new SphereGeometry(radius * CLOUD_SCALE, 128, 64), this.clouds));

    this.atmosphere = new ShaderMaterial({
      uniforms: { uSunDir: { value: new Vector3(1, 0, 0) } },
      vertexShader: SURFACE_VERT,
      fragmentShader: ATMO_FRAG,
      side: FrontSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(
      new Mesh(new SphereGeometry(radius * ATMOSPHERE_SCALE, 128, 64), this.atmosphere),
    );
  }

  update(sunDir: Vector3, spin: number): void {
    for (const m of [this.surface, this.clouds, this.atmosphere]) {
      (m.uniforms.uSunDir.value as Vector3).copy(sunDir);
    }
    this.surface.uniforms.uSpin.value = spin;
    // The cloud deck drifts relative to the ground. Without this the planet reads as a
    // painted globe rather than as a weather system.
    this.clouds.uniforms.uSpin.value = spin * 1.15 + 0.15;
  }
}

const SURFACE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vObj = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * vObj);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SPIN_GLSL = /* glsl */ `
// Turning the planet is a shift in the equirectangular u coordinate.
vec2 spunUv(vec2 uv, float a) {
  return vec2(fract(uv.x + a * 0.15915494), uv.y);
}
vec3 spun(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}
`;

const SURFACE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uWater;
uniform vec3 uSunDir;
uniform float uSpin;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

${SPIN_GLSL}

// A raw ShaderMaterial gets no colour management, so sRGB maps must be decoded here.
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec2 uv = spunUv(vUv, uSpin);
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 halfway = normalize(viewDir + uSunDir);
  float ndl = dot(n, uSunDir);

  vec3 day = toLinear(texture2D(uDay, uv).rgb);
  float water = texture2D(uWater, uv).r;

  // The sun subtends half a degree, so the true terminator is nearly a step. Widening
  // it to a few degrees reads soft rather than blurry, and hides the tessellation.
  float dayMask = smoothstep(-0.03, 0.07, ndl);
  float diffuse = max(ndl, 0.0) * 1.45 + 0.012;

  vec3 color = day * diffuse * dayMask;

  // Rayleigh in-scattering over the whole lit disc -- not just a rim glow.
  //
  // This is the single thing that makes Earth photograph the way it does. Deep ocean
  // has an albedo near 0.03, darker than forest; left to its own reflectance it renders
  // almost black, which is what a texture-only globe looks like. What the eye reads as
  // bright blue ocean is mostly sunlight scattered by the air column above it. The path
  // through that column lengthens toward the limb, hence the airmass term, and the
  // effect is strongest over dark ground because there is less surface light to compete.
  float airmass = 1.0 / max(dot(n, viewDir), 0.22);
  vec3 rayleigh = vec3(0.115, 0.265, 0.60);
  color += rayleigh * max(ndl, 0.0) * dayMask * airmass * mix(0.55, 1.0, water) * 0.40;

  // Sun glint, on water only -- specular on the Sahara is the classic giveaway. Kept
  // tight and modest: from orbit this is a small bright patch, not a headlight.
  float ndh = max(dot(n, halfway), 0.0);
  color += vec3(0.90, 0.94, 1.0) * pow(ndh, 340.0) * 0.30 * water
         * clamp(ndl * 6.0, 0.0, 1.0);

  // Terminator warmth: that light has taken the long path through the atmosphere.
  float band = dayMask * (1.0 - dayMask) * 4.0;
  color = mix(color, color * vec3(1.30, 0.82, 0.58), band * 0.45);

  // City lights come up just before the surface goes dark, which is how it looks from
  // orbit. Squaring crushes Black Marble's airglow floor and leaves only real cities.
  vec3 night = toLinear(texture2D(uNight, uv).rgb);
  color += night * night * smoothstep(0.05, -0.07, ndl) * 5.5;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const CLOUD_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uSpin;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vWorld;

${NOISE_GLSL}
${SPIN_GLSL}

void main() {
  vec3 p = spun(normalize(vObj), uSpin);

  // One level of domain warp, which is what turns fbm blobs into fronts and swirls. A
  // second level looks slightly better and costs three times as much: this shader runs
  // over a full-screen planet, and the honest budget is about a hundred noise taps a
  // pixel, not four hundred. A lacunarity of 2.13 rather than 2 keeps the octaves from
  // lining up on the lattice and grid-patterning the result.
  vec3 base = p * 2.6;
  vec3 warpTo = vec3(
    fbm(base, 3, 2.13, 0.5),
    fbm(base + vec3(5.2, 1.7, 3.3), 3, 2.13, 0.5),
    fbm(base + vec3(2.4, 6.1, 4.7), 3, 2.13, 0.5));
  float density = fbm(base * 1.25 + warpTo * 2.0 + vec3(3.3, 2.1, 7.7), 5, 2.13, 0.5) + 0.5;

  // General circulation: a wet band at the equator, the dry subtropics where the great
  // deserts sit, and storm tracks at mid latitude. This is most of what makes a cloud
  // field read as Earth rather than as marble.
  float lat = abs(p.y);
  float itcz = (1.0 - smoothstep(0.0, 0.17, lat)) * 0.22;
  float subtropical = smoothstep(0.28, 0.46, lat) * (1.0 - smoothstep(0.52, 0.65, lat));
  float midLat = smoothstep(0.63, 0.77, lat) * (1.0 - smoothstep(0.88, 0.97, lat)) * 0.20;
  density *= (1.0 - 0.52 * subtropical) + itcz + midLat;

  // A narrow coverage band is the whole difference between clouds and smoke: fbm used
  // directly as opacity is a smooth ramp, and a smooth ramp is exactly what smoke is.
  float alpha = pow(smoothstep(0.60, 0.86, density), 1.35);

  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uSunDir);
  float diffuse = max(ndl, 0.0) * 0.88 + 0.12;
  float forward = pow(max(dot(-viewDir, uSunDir), 0.0), 7.0) * 0.5;

  vec3 color = mix(vec3(0.68, 0.73, 0.80), vec3(1.0, 0.99, 0.97), diffuse);
  color += vec3(0.98, 0.96, 0.88) * forward * (1.0 - diffuse * 0.5);
  color = mix(vec3(0.04, 0.045, 0.06), color, smoothstep(-0.12, 0.12, ndl));

  gl_FragColor = vec4(color, alpha * 0.88);
}
`;

const ATMO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uSunDir);

  // A high exponent keeps the glow hugging the limb. At 2 or 3 it spreads over the
  // whole disc and the planet ends up sitting inside a visible bubble.
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 5.5);

  float dayF = smoothstep(-0.20, 0.35, ndl);
  // The orange ring on the terminator side is the detail that sells it as air.
  float dusk = clamp(1.0 - abs(ndl * 2.2 - 0.2), 0.0, 1.0) * smoothstep(-0.1, 0.1, ndl);

  vec3 color = mix(vec3(0.02, 0.04, 0.12), vec3(0.16, 0.46, 1.0), dayF);
  color = mix(color, vec3(0.70, 0.35, 0.10), dusk * 0.55);

  gl_FragColor = vec4(color, rim * (0.38 + 0.62 * dayF) * 0.30);
}
`;
