/**
 * Shared GLSL noise routines, injected into the planet and moon shaders.
 *
 * Everything is procedural and evaluated in the body's own object space, so surface
 * features are welded to the body and rotate with it. That is what lets you see the moon
 * turning at all -- and, later, see it stop.
 */
export const NOISE_GLSL = /* glsl */ `
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Gradient noise, Inigo Quilez style.
float gnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash33(i + vec3(0,0,0)) * 2.0 - 1.0, f - vec3(0,0,0)),
                     dot(hash33(i + vec3(1,0,0)) * 2.0 - 1.0, f - vec3(1,0,0)), u.x),
                 mix(dot(hash33(i + vec3(0,1,0)) * 2.0 - 1.0, f - vec3(0,1,0)),
                     dot(hash33(i + vec3(1,1,0)) * 2.0 - 1.0, f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33(i + vec3(0,0,1)) * 2.0 - 1.0, f - vec3(0,0,1)),
                     dot(hash33(i + vec3(1,0,1)) * 2.0 - 1.0, f - vec3(1,0,1)), u.x),
                 mix(dot(hash33(i + vec3(0,1,1)) * 2.0 - 1.0, f - vec3(0,1,1)),
                     dot(hash33(i + vec3(1,1,1)) * 2.0 - 1.0, f - vec3(1,1,1)), u.x), u.y), u.z);
}

float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    sum += amp * gnoise(p);
    p *= lacunarity;
    amp *= gain;
  }
  return sum;
}

// Ridged variant: sharp crests, good for coastlines and mountain chains.
float ridged(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    sum += amp * (1.0 - abs(gnoise(p)) * 2.0);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// Warping the sample point before the fbm is what turns amoeba blobs into
// coastlines -- plain fbm always reads as a lava lamp.
vec3 warp(vec3 p, float amount) {
  return p + amount * vec3(
    fbm(p + vec3(11.3, 5.1, 2.7), 4, 2.0, 0.5),
    fbm(p + vec3(3.9, 17.2, 8.4), 4, 2.0, 0.5),
    fbm(p + vec3(6.2, 1.8, 13.5), 4, 2.0, 0.5));
}
`;

/**
 * Crater field. Worley cells give each crater a centre; the radius, depth and freshness
 * are hashed per cell. fbm alone makes lumpy oatmeal -- craters need cells.
 */
export const CRATERS_GLSL = /* glsl */ `
// Worley cells give each crater a centre. The things that keep it from looking like a
// sheet of stamped rings: crater diameters follow a steep power law so most cells hold
// something small, the depth-to-diameter ratio falls with size the way real ones do,
// only a minority of cells are occupied at all, and the rim is a narrow soft ridge
// rather than a hard annulus.
vec3 craterCell(vec3 sp, vec3 c, float seed) {
  vec3 h = hash33(c + seed);
  float pick = hash13(c * 1.7 + seed + 3.1);
  if (pick < 0.42) return vec3(0.0);

  // Power law: cube the uniform sample so small craters dominate.
  float u = h.x;
  float radius = mix(0.10, 0.55, u * u * u);
  vec3 centre = c + vec3(0.5) + (h - 0.5) * 0.75;
  float q = length(sp - centre) / radius;
  if (q > 1.7) return vec3(0.0);

  // Shallower as they get bigger, as gravity relaxes the floor.
  float depth = radius * mix(0.55, 0.20, u) * mix(0.7, 1.3, h.y);

  // Flat floor, steep inner wall, narrow raised rim, ejecta fading outward.
  float floorMask = 1.0 - smoothstep(0.55, 1.0, q);
  float rim = exp(-pow((q - 1.0) / 0.22, 2.0));
  float ejecta = exp(-pow((q - 1.15) / 0.55, 2.0)) * 0.25;
  float height = -depth * floorMask + depth * (rim * 0.55 + ejecta);

  // Fresh craters are brighter; hashed so only some of them are.
  float freshness = smoothstep(0.55, 1.0, h.z) * (rim + ejecta * 1.5);
  return vec3(height, freshness, floorMask);
}

// Returns (height, freshness, floorCoverage) for one octave.
vec3 craterLayer(vec3 p, float scale, float seed) {
  vec3 sp = p * scale + seed;
  vec3 cell = floor(sp);
  vec3 total = vec3(0.0);
  for (int i = -1; i <= 1; i++)
  for (int j = -1; j <= 1; j++)
  for (int k = -1; k <= 1; k++) {
    total += craterCell(sp, cell + vec3(float(i), float(j), float(k)), seed);
  }
  return vec3(total.x / scale, total.y, total.z);
}

// Elevation of the lunar surface at an object-space direction. z carries how much of
// this point sits inside a crater floor, used to keep mare basalt smooth.
vec3 lunarHeight(vec3 dir, float mareMask) {
  vec3 c1 = craterLayer(dir, 2.6, 0.0);
  vec3 c2 = craterLayer(dir, 7.0, 21.7);
  vec3 c3 = craterLayer(dir, 18.0, 57.3);
  // Maria are young flood basalt: far fewer craters, and much smoother between them.
  float cratering = mix(1.0, 0.25, mareMask);
  float h = (c1.x + c2.x * 0.7 + c3.x * 0.45) * cratering;
  // Regolith at a scale below the craters, so the surface is never flat.
  h += 0.006 * fbm(dir * 22.0, 4, 2.1, 0.5) * mix(1.0, 0.5, mareMask);
  float fresh = max(c1.y, max(c2.y * 0.85, c3.y * 0.6)) * cratering;
  return vec3(h, fresh, max(c1.z, c2.z));
}
`;
