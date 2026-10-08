/**
 * GLSL for the water surface, the caustics pass and the tank floor.
 *
 * The heightfield comes straight from the CPU solver as a half-float texture.
 * uv.x runs along the tank (grid x), uv.y across it (grid y), which in world space
 * is z from −D/2 (far wall) to +D/2 (near wall).
 */

export const heightChunk = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uTexel;     // 1 / grid size
uniform vec2 uSize;      // tank interior (x, z) in world units
uniform float uHScale;   // world height per unit of simulated height
uniform float uCell;     // world size of one grid cell

// Displayed height. A gentle soft-clip keeps the water by the wave-makers from
// towering over the far end while leaving the small ripples untouched.
float hgt(vec2 uv) {
  float u = texture2D(uHeight, uv).r;
  return uHScale * u / (1.0 + 3.0 * abs(u));
}

vec3 waterNormal(vec2 uv) {
  vec2 dx = vec2(uTexel.x, 0.0);
  vec2 dz = vec2(0.0, uTexel.y);
  float sx = (hgt(uv + dx) - hgt(uv - dx)) / (2.0 * uCell);
  float sz = (hgt(uv + dz) - hgt(uv - dz)) / (2.0 * uCell);
  return normalize(vec3(-sx, 1.0, -sz));
}

vec2 worldToUv(vec2 xz) {
  return vec2(xz.x / uSize.x + 0.5, xz.y / uSize.y + 0.5);
}
`;

/** Environment the water reflects: a dark gallery with a large overhead softbox. */
export const envChunk = /* glsl */ `
uniform vec3 uSoftbox;    // centre (x, y, z) of the ceiling softbox
uniform vec2 uSoftboxSize;

vec3 envColor(vec3 origin, vec3 d) {
  float up = d.y;
  vec3 c = mix(vec3(0.006, 0.008, 0.012), vec3(0.03, 0.04, 0.06), smoothstep(-0.3, 0.9, up));
  if (up > 0.02) {
    float t = (uSoftbox.y - origin.y) / up;
    vec2 p = origin.xz + d.xz * t;
    // Two long strip lights running along the tank, and a broad dim softbox.
    vec2 q = abs(p - uSoftbox.xz) - uSoftboxSize;
    float box = 1.0 - smoothstep(-0.3, 0.2, max(q.x, q.y));
    c += box * vec3(0.12, 0.13, 0.15);
    float strip1 = 1.0 - smoothstep(0.03, 0.08, abs(p.y - (uSoftbox.z + 0.75)));
    float strip2 = 1.0 - smoothstep(0.03, 0.08, abs(p.y - (uSoftbox.z - 0.9)));
    float along = 1.0 - smoothstep(3.2, 3.8, abs(p.x - uSoftbox.x));
    c += (strip1 + strip2) * along * vec3(9.0, 8.8, 8.4);
    // A warm wall lamp off to one side.
    vec2 lamp = p - vec2(-4.5, -1.5);
    c += vec3(2.4, 1.5, 0.7) * exp(-dot(lamp, lamp) * 0.9);
  }
  return c;
}
`;

export const waterVertex = /* glsl */ `
${heightChunk}
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 uv = worldToUv(wp.xz);
  wp.y += hgt(uv);
  vWorld = wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const waterFragment = /* glsl */ `
${heightChunk}
${envChunk}
uniform sampler2D uRefraction;
uniform vec2 uResolution;
uniform vec3 uToLight;
uniform vec3 uLightColor;
uniform vec3 uDeepColor;
uniform float uRefract;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  vec3 n = waterNormal(vUv);
  vec3 V = normalize(cameraPosition - vWorld);
  float cosT = clamp(dot(n, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  vec3 R = reflect(-V, n);
  vec3 refl = envColor(vWorld, R);

  // Screen-space refraction: bend the lookup into the underwater image by the
  // surface slope, projected into view space.
  vec3 nView = (viewMatrix * vec4(n.x, 0.0, n.z, 0.0)).xyz;
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec2 off = nView.xy * uRefract;
  vec3 refr;
  refr.r = texture2D(uRefraction, suv - off * 1.03).r;
  refr.g = texture2D(uRefraction, suv - off).g;
  refr.b = texture2D(uRefraction, suv - off * 0.97).b;
  // Light absorbed on the way down and back up, with a little blue-green in-scatter.
  vec3 trans = vec3(0.5, 0.8, 0.86);
  refr = refr * trans + uDeepColor * (1.0 - trans);

  vec3 H = normalize(uToLight + V);
  float nh = max(dot(n, H), 0.0);
  vec3 spec = uLightColor * (pow(nh, 900.0) * 5.0 + pow(nh, 160.0) * 0.08);

  vec3 col = mix(refr, refl, F) + spec;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const causticsVertex = /* glsl */ `
${heightChunk}
uniform sampler2D uSolid;
uniform vec3 uLightRay;  // direction light travels (pointing down)
uniform float uDepth;
varying vec3 vOld;
varying vec3 vNew;
varying float vShade;

void main() {
  vec2 uv = position.xy * 0.5 + 0.5;
  float h = hgt(uv);
  vec3 n = waterNormal(uv);
  vec3 P = vec3((uv.x - 0.5) * uSize.x, h, (uv.y - 0.5) * uSize.y);
  vec3 L = normalize(uLightRay);
  vec3 r0 = refract(L, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  vec3 r = refract(L, n, 1.0 / 1.333);
  vOld = vec3(P.x, 0.0, P.z) + r0 * (uDepth / -r0.y);
  vNew = P + r * ((P.y + uDepth) / -r.y);

  // Pillars are opaque: march the refracted ray and let any stone it crosses block it.
  float block = 0.0;
  for (int k = 0; k < 5; k++) {
    vec3 q = mix(P, vNew, (float(k) + 0.5) / 5.0);
    block = max(block, texture2D(uSolid, worldToUv(q.xz)).r);
  }
  vShade = 1.0 - smoothstep(0.25, 0.75, block);

  vec2 fuv = worldToUv(vNew.xz);
  gl_Position = vec4(fuv * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const causticsFragment = /* glsl */ `
varying vec3 vOld;
varying vec3 vNew;
varying float vShade;
void main() {
  float oldArea = length(dFdx(vOld)) * length(dFdy(vOld));
  float newArea = length(dFdx(vNew)) * length(dFdy(vNew));
  float I = oldArea / max(newArea, 1e-10);
  I = min(I, 8.0);
  gl_FragColor = vec4(vec3(I * vShade), 1.0);
}
`;

/** Shared lighting for anything under water: tiles, inner walls, stones. */
export const underwaterChunk = /* glsl */ `
uniform sampler2D uCaustics;
uniform vec2 uSize;
uniform vec3 uToLight;
uniform vec3 uLightColor;
uniform float uWaterLevel;

vec3 causticLight(vec3 worldPos) {
  vec2 cuv = vec2(worldPos.x / uSize.x + 0.5, worldPos.z / uSize.y + 0.5);
  // A whisper of dispersion: red and blue focus at slightly different spots.
  vec2 d = vec2(0.0018, 0.0012);
  vec3 c;
  c.r = texture2D(uCaustics, cuv + d).r;
  c.g = texture2D(uCaustics, cuv).g;
  c.b = texture2D(uCaustics, cuv - d).b;
  return c;
}
`;

export const floorVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const floorFragment = /* glsl */ `
${underwaterChunk}
uniform float uIsWall;
varying vec3 vWorld;
varying vec3 vNormal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // Pale limestone tiles with thin dark grout: the grid makes the refraction readable.
  vec2 p = vWorld.xz / 0.16;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float grout = smoothstep(0.015, 0.05, edge);
  float tone = 0.9 + 0.1 * hash(cell);
  vec3 stone = vec3(0.5, 0.45, 0.37) * tone;
  vec3 albedo = mix(vec3(0.07, 0.075, 0.08), stone, grout);
  if (uIsWall > 0.5) albedo = vec3(0.16, 0.15, 0.14) * (0.9 + 0.1 * hash(floor(vec2(vWorld.x + vWorld.z, vWorld.y) * 40.0)));

  // Contact shadow along the walls of the tank.
  vec2 e = abs(vWorld.xz) - 0.5 * uSize;
  float wallDist = -max(e.x, e.y);
  float ao = mix(0.55, 1.0, smoothstep(0.0, 0.12, wallDist));

  float ndl = max(dot(normalize(vNormal), uToLight), 0.0);
  vec3 caus = causticLight(vWorld);
  vec3 light;
  if (uIsWall > 0.5) {
    float below = clamp((uWaterLevel - vWorld.y) / 0.32, 0.0, 1.0);
    light = vec3(0.10) + uLightColor * 0.22 * (1.0 - below * 0.6);
  } else {
    light = vec3(0.035, 0.045, 0.055) + uLightColor * ndl * 0.8 * caus;
  }
  gl_FragColor = vec4(albedo * light * ao, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const stoneVertex = /* glsl */ `
attribute float aTone;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vTone;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vTone = aTone;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const stoneFragment = /* glsl */ `
${underwaterChunk}
${envChunk}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vTone;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 51.3))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec3 n = normalize(vNormal);
  float grain = noise3(vWorld * 38.0) * 0.6 + noise3(vWorld * 110.0) * 0.4;
  vec3 albedo = mix(vec3(0.075, 0.08, 0.085), vec3(0.16, 0.145, 0.125), vTone) * (0.7 + 0.6 * grain);
  float under = smoothstep(uWaterLevel + 0.004, uWaterLevel - 0.01, vWorld.y);
  // Wet stone is darker and glossier just above and below the waterline.
  float wet = smoothstep(uWaterLevel + 0.035, uWaterLevel, vWorld.y);
  albedo *= mix(1.0, 0.55, wet);

  float ndl = max(dot(n, uToLight), 0.0);
  vec3 col;
  if (under > 0.5) {
    // Under water: lit by the caustic pattern next to the stone.
    vec3 caus = causticLight(vWorld + n * 0.03);
    float depth = clamp(-vWorld.y / 0.3, 0.0, 1.0);
    col = albedo * (vec3(0.03, 0.045, 0.05) + uLightColor * caus * (0.15 + 0.85 * ndl) * (1.0 - 0.5 * depth));
  } else {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(uToLight + V);
    float spec = pow(max(dot(n, H), 0.0), mix(18.0, 90.0, wet)) * mix(0.08, 0.5, wet);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.25;
    vec3 refl = envColor(vWorld, reflect(-V, n)) * mix(0.01, 0.06, wet);
    col = albedo * (vec3(0.05, 0.055, 0.065) + uLightColor * ndl * 1.1) + uLightColor * spec + rim * vec3(0.25, 0.3, 0.35) + refl;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

