// GLSL ES 3.0 sources. The LBM kernel is generated from the same constants as
// the CPU reference (sim/d2q9.ts) and is a line-by-line port of CpuLbm.step().
// Populations live in three RGBA32F textures: (f0..f3), (f4..f7), (f8, ρ, ux, uy).

import { CELL, EX, EY, OPP, PHYS, Q, W } from '../sim/d2q9.ts'

const f = (x: number) => {
  const s = x.toPrecision(9)
  return s.includes('.') || s.includes('e') ? s : `${s}.0`
}

export const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/** Read population i at integer cell p (unrolled per i). */
function fetchPop(i: number, p: string): string {
  if (i < 4) return `texelFetch(uF0, ${p}, 0)[${i}]`
  if (i < 8) return `texelFetch(uF1, ${p}, 0)[${i - 4}]`
  return `texelFetch(uF2, ${p}, 0).x`
}

export function lbmFS(nozzles: number): string {
  const lines: string[] = []
  // pull streaming with half-way bounce-back
  for (let i = 0; i < Q; i++) {
    const sp = `p - ivec2(${EX[i]}, ${EY[i]})`
    const wall = i === 0 ? 'false' : `(dyn ? isWall(${sp}) : (mask & ${1 << (i - 1)}u) != 0u)`
    lines.push(`  fi[${i}] = ${wall} ? ${fetchPop(OPP[i], 'p')} : ${fetchPop(i, sp)};`)
  }
  const feqLines = (target: string, r: string, u: string) =>
    Array.from({ length: Q }, (_, i) => {
      const eu = `(${f(EX[i])} * ${u}.x + ${f(EY[i])} * ${u}.y)`
      return `  ${target}[${i}] = ${f(W[i])} * ${r} * (1.0 + 3.0 * ${eu} + 4.5 * ${eu} * ${eu} - 1.5 * usq);`
    }).join('\n')
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D uF0;
uniform sampler2D uF1;
uniform sampler2D uF2;
uniform usampler2D uGeo;
uniform vec4 uNoz[${nozzles}]; // (ux, uy, opening, dye)
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;

bool isWall(ivec2 q) {
  uvec4 g = texelFetch(uGeo, q, 0);
  if (g.r == ${CELL.SOLID}u) return true;
  if (g.r == ${CELL.NOZZLE}u) return uNoz[g.g].z < ${f(PHYS.valveShut)};
  return false;
}

void emit(float fo[${Q}], float r, vec2 u) {
  o0 = vec4(fo[0], fo[1], fo[2], fo[3]);
  o1 = vec4(fo[4], fo[5], fo[6], fo[7]);
  o2 = vec4(fo[8], r, u);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  uvec4 g = texelFetch(uGeo, p, 0);
  float fo[${Q}];
  float usq;
  if (g.r == ${CELL.SOLID}u || (g.r == ${CELL.NOZZLE}u && uNoz[g.g].z < ${f(PHYS.valveShut)})) {
    // walls hold no state; write rest so a reopened valve starts clean
${Array.from({ length: Q }, (_, i) => `    fo[${i}] = ${f(W[i])};`).join('\n')}
    emit(fo, 1.0, vec2(0.0));
    return;
  }
  if (g.r == ${CELL.NOZZLE}u) {
    vec4 nz = uNoz[g.g];
    vec2 u = nz.xy;
    usq = dot(u, u);
${feqLines('fo', '1.0', 'u')}
    emit(fo, 1.0, u);
    return;
  }
  if (g.r == ${CELL.DRAIN}u) {
    int code = int(g.b & 15u);
    ivec2 nrm = ivec2(code % 3 - 1, code / 3 - 1);
    ivec2 s = p - nrm;
    vec4 a = texelFetch(uF0, s, 0);
    vec4 b = texelFetch(uF1, s, 0);
    vec4 c = texelFetch(uF2, s, 0);
    float fs[${Q}] = float[${Q}](a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w, c.x);
    float rs = 0.0; float ms = 0.0; float ns = 0.0;
    for (int i = 0; i < ${Q}; i++) { rs += fs[i]; }
${Array.from({ length: Q }, (_, i) => `    ms += fs[${i}] * ${f(EX[i])}; ns += fs[${i}] * ${f(EY[i])};`).join('\n')}
    float un = (ms / rs) * float(nrm.x) + (ns / rs) * float(nrm.y);
    if (un < 0.0) un *= ${f(PHYS.drainInflow)};
    vec2 u = un * vec2(nrm);
    usq = dot(u, u);
${feqLines('fo', '1.0', 'u')}
    emit(fo, 1.0, u);
    return;
  }
  // static walls come from a precomputed per-cell link mask (one fetch instead
  // of nine); only cells next to a nozzle check the live valve state
  uint mask = g.a;
  bool dyn = (g.b & 16u) != 0u;
  float fi[${Q}];
${lines.join('\n')}
  float r = 0.0; float mx = 0.0; float my = 0.0;
${Array.from({ length: Q }, (_, i) => `  r += fi[${i}]; mx += fi[${i}] * ${f(EX[i])}; my += fi[${i}] * ${f(EY[i])};`).join('\n')}
  vec2 u = vec2(mx, my) / r;
  float sp = length(u);
  if (sp > ${f(PHYS.uClamp)}) u *= ${f(PHYS.uClamp)} / sp;
  usq = dot(u, u);
  float fe[${Q}];
${feqLines('fe', 'r', 'u')}
  float pxx = 0.0; float pyy = 0.0; float pxy = 0.0;
${Array.from({ length: Q }, (_, i) => {
  const parts: string[] = []
  if (EX[i] !== 0) parts.push(`pxx += fi[${i}] - fe[${i}];`)
  if (EY[i] !== 0) parts.push(`pyy += fi[${i}] - fe[${i}];`)
  if (EX[i] * EY[i] !== 0) parts.push(`pxy += ${f(EX[i] * EY[i])} * (fi[${i}] - fe[${i}]);`)
  return parts.length ? `  ${parts.join(' ')}` : ''
})
  .filter(Boolean)
  .join('\n')}
  float qn = sqrt(pxx * pxx + pyy * pyy + 2.0 * pxy * pxy);
  float tau = ${f(PHYS.tau)};
  float te = 0.5 * (tau + sqrt(tau * tau + ${f(18 * Math.SQRT2 * PHYS.smagorinsky * PHYS.smagorinsky)} * qn / r));
  float om = 1.0 / te;
  for (int i = 0; i < ${Q}; i++) fo[i] = fi[i] + om * (fe[i] - fi[i]);
  emit(fo, r, u);
}`
}

/** Semi-Lagrangian dye advection with injection at open nozzles. */
export function dyeFS(nozzles: number): string {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D uDye;
uniform sampler2D uF2;
uniform usampler2D uGeo;
uniform vec4 uNoz[${nozzles}];
uniform vec2 uSize;
uniform float uDt;
uniform float uDecay;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  uvec4 g = texelFetch(uGeo, p, 0);
  if (g.r == ${CELL.SOLID}u) { o = vec4(0.0); return; }
  if (g.r == ${CELL.NOZZLE}u) {
    vec4 nz = uNoz[g.g];
    int ch = int(nz.w + 0.5);
    o = vec4(equal(ivec4(0, 1, 2, 3), ivec4(ch))) * clamp(nz.z, 0.0, 1.0);
    return;
  }
  vec2 u = texelFetch(uF2, p, 0).zw;
  vec2 back = gl_FragCoord.xy - u * uDt;
  vec4 d = texture(uDye, back / uSize);
  o = d * uDecay;
}`
}

/** Flux through each probe line: Σ ρ·u_y over its cells. Output is N×1. */
export function probeFS(probes: number): string {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D uF2;
uniform usampler2D uGeo;
uniform ivec3 uProbe[${probes}]; // x0, x1, y
out vec4 o;
void main() {
  int k = int(gl_FragCoord.x);
  ivec3 pr = uProbe[k];
  float s = 0.0;
  for (int x = 0; x < 64; x++) {
    int xx = pr.x + x;
    if (xx > pr.y) break;
    ivec2 q = ivec2(xx, pr.z);
    if (texelFetch(uGeo, q, 0).r == ${CELL.FLUID}u) {
      vec4 c = texelFetch(uF2, q, 0);
      s += c.y * c.w;
    }
  }
  o = vec4(s, 0.0, 0.0, 1.0);
}`
}

/** Glow source: tone-mapped dye colour, rendered at reduced resolution. */
export const COLOURS = {
  // dye 0: left nozzle (A / partial sum), dye 1: right nozzle (B / carry-in)
  // dye 2: power jet, dye 3: control jets (carries)
  c0: [0.22, 0.86, 1.0],
  c1: [1.0, 0.66, 0.22],
  c2: [0.66, 0.6, 1.0],
  c3: [1.0, 0.36, 0.62],
} as const

const vec3s = (c: readonly number[]) => `vec3(${c.map(f).join(', ')})`

const DYE_COLOUR = `
vec3 dyeColour(vec4 d) {
  vec3 c = d.x * ${vec3s(COLOURS.c0)} + d.y * ${vec3s(COLOURS.c1)} + d.z * ${vec3s(COLOURS.c2)} + d.w * ${vec3s(COLOURS.c3)};
  return c;
}`

export const GLOW_FS = `#version 300 es
precision highp float;
uniform sampler2D uDye;
uniform sampler2D uSdf;
uniform vec2 uOut;
out vec4 o;
${DYE_COLOUR}
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec4 d = texture(uDye, uv);
  float wet = 1.0 - smoothstep(-0.5, 0.5, texture(uSdf, uv).r);
  vec3 c = dyeColour(d) * wet;
  o = vec4(1.0 - exp(-c * 1.4), 1.0);
}`

export const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir; // one source texel along the blur axis, in uv units
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSrc, 0));
  vec3 c = texture(uSrc, uv).rgb * 0.2270270270;
  c += (texture(uSrc, uv + uDir * 1.3846153846).rgb + texture(uSrc, uv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uSrc, uv + uDir * 3.2307692308).rgb + texture(uSrc, uv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`

/** Final composite: glass walls, water, dye, vorticity shimmer, bloom. */
export const COMPOSITE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uDye;
uniform sampler2D uSdf;
uniform sampler2D uF2;
uniform sampler2D uGlow;
uniform vec2 uBoard;     // board size in cells
uniform vec4 uView;      // board→pixel: (scale, offsetX, offsetY, devicePixelRatio)
uniform vec2 uCanvas;    // canvas size in pixels
uniform float uTime;
uniform float uMode;     // 0 dye, 1 vorticity
out vec4 o;
${DYE_COLOUR}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // pixel → board coordinates (board y grows downward, canvas y grows upward)
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 b = (px - uView.yz) / uView.x;
  vec2 uv = b / uBoard;
  vec3 bg = mix(vec3(0.016, 0.024, 0.043), vec3(0.03, 0.045, 0.075), 1.0 - px.y / uCanvas.y);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(bg, 1.0); return; }
  // sample textures with board row y → texture row y (rows are stored top-down)
  vec2 tuv = uv;
  float sdf = texture(uSdf, tuv).r;
  float aa = 1.2 / uView.x + 0.35;
  float water = 1.0 - smoothstep(-aa, aa, sdf);
  vec4 d = texture(uDye, tuv);
  ivec2 cell = ivec2(clamp(b, vec2(1.0), uBoard - 2.0));
  vec4 c0 = texelFetch(uF2, cell, 0);
  float vort = (texelFetch(uF2, cell + ivec2(1, 0), 0).w - texelFetch(uF2, cell - ivec2(1, 0), 0).w)
             - (texelFetch(uF2, cell + ivec2(0, 1), 0).z - texelFetch(uF2, cell - ivec2(0, 1), 0).z);
  float speed = length(c0.zw);

  // water: deep blue-green, brighter where it moves
  vec3 wcol = vec3(0.022, 0.075, 0.115) + vec3(0.02, 0.10, 0.14) * smoothstep(0.0, 0.15, speed);
  // meniscus: water glows faintly where it meets the glass
  wcol += vec3(0.10, 0.22, 0.30) * exp(-abs(sdf) * 0.55) * 0.35;
  vec3 dye = dyeColour(d);
  vec3 lit;
  if (uMode < 0.5) {
    lit = wcol + (1.0 - exp(-dye * 1.5)) * 1.05;
    // faint vorticity sheen so eddies read even without dye
    lit += vec3(0.25, 0.45, 0.6) * clamp(abs(vort) * 3.0, 0.0, 0.25);
  } else {
    float v = clamp(vort * 4.0, -1.0, 1.0);
    vec3 vc = v > 0.0 ? vec3(1.0, 0.45, 0.25) : vec3(0.25, 0.65, 1.0);
    lit = wcol + vc * pow(abs(v), 0.7) * 0.9 + (1.0 - exp(-dye * 1.5)) * 0.18;
  }

  // walls: smoked glass with an etched, glowing rim
  float rim = exp(-abs(sdf) * 1.1) * (1.0 - water * 0.6);
  float inner = smoothstep(0.0, 6.0, sdf);
  vec3 glass = mix(vec3(0.07, 0.09, 0.13), vec3(0.035, 0.045, 0.07), inner);
  glass += (hash(floor(px)) - 0.5) * 0.012;
  float farWall = smoothstep(6.0, 10.0, sdf);
  glass = mix(glass, bg, farWall);
  vec3 col = mix(glass, lit, water);
  col += vec3(0.45, 0.62, 0.78) * rim * 0.32 * (1.0 - farWall);

  // bloom
  vec3 glow = texture(uGlow, tuv).rgb;
  col += glow * 0.55;
  col = col / (1.0 + col * 0.12);
  o = vec4(pow(col, vec3(0.95)), 1.0);
}`
