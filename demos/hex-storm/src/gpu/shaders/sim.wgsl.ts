import { HELPERS, UNIFORMS } from './common.wgsl.ts';

/**
 * dζ/dt = −J(ψ,ζ) + 2γ r u_r + ν∇²ζ − α(ζ − ζ_jet) − σ ζ   (+ mouse splat)
 * Arakawa Jacobian, 5-point Laplacian, central-difference velocity.
 */
export const RHS = /* wgsl */ `
${UNIFORMS}
${HELPERS}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> zeta: array<f32>;
@group(0) @binding(2) var<storage, read> psi: array<f32>;
@group(0) @binding(3) var<storage, read> zt: array<f32>;
@group(0) @binding(4) var<storage, read> sp: array<f32>;
@group(0) @binding(5) var<storage, read_write> k: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n = u.n;
  if (gid.x >= n || gid.y >= n) { return; }
  let i = i32(gid.x);
  let j = i32(gid.y);
  let c = idx(gid.x, gid.y, n);
  let e = idx(wrap(i + 1, n), gid.y, n);
  let w = idx(wrap(i - 1, n), gid.y, n);
  let nn = idx(gid.x, wrap(j + 1, n), n);
  let s = idx(gid.x, wrap(j - 1, n), n);
  let ne = idx(wrap(i + 1, n), wrap(j + 1, n), n);
  let nw = idx(wrap(i - 1, n), wrap(j + 1, n), n);
  let se = idx(wrap(i + 1, n), wrap(j - 1, n), n);
  let sw = idx(wrap(i - 1, n), wrap(j - 1, n), n);

  let dx = u.dx;
  let d2 = dx * dx;

  let j1 = (psi[e] - psi[w]) * (zeta[nn] - zeta[s]) - (psi[nn] - psi[s]) * (zeta[e] - zeta[w]);
  let j2 = psi[e] * (zeta[ne] - zeta[se]) - psi[w] * (zeta[nw] - zeta[sw])
         - psi[nn] * (zeta[ne] - zeta[nw]) + psi[s] * (zeta[se] - zeta[sw]);
  let j3 = zeta[nn] * (psi[ne] - psi[nw]) - zeta[s] * (psi[se] - psi[sw])
         - zeta[e] * (psi[ne] - psi[se]) + zeta[w] * (psi[nw] - psi[sw]);
  let jac = (j1 + j2 + j3) / (12.0 * d2);

  let vx = -(psi[nn] - psi[s]) / (2.0 * dx);
  let vy = (psi[e] - psi[w]) / (2.0 * dx);
  let x = -1.0 + (f32(gid.x) + 0.5) * dx;
  let y = -1.0 + (f32(gid.y) + 0.5) * dx;
  let r = max(length(vec2f(x, y)), 1e-6);
  let ur = (vx * x + vy * y) / r;
  let beta = 2.0 * u.gamma * r * ur;

  let lap = (zeta[e] + zeta[w] + zeta[nn] + zeta[s] - 4.0 * zeta[c]) / d2;

  var splat = 0.0;
  if (u.mouse.z != 0.0) {
    let d = vec2f(x, y) - u.mouse.xy;
    let q = dot(d, d) / (u.mouse.w * u.mouse.w);
    splat = u.mouse.z * exp(-q);
  }

  k[c] = -jac + beta + u.nu * lap - u.relax * (zeta[c] - zt[c]) - sp[c] * zeta[c] + splat;
}
`;

/** out = A·z0 + B·(zin + dt·k). SSP-RK3 stages via pipeline overrides. */
export const RK = /* wgsl */ `
${UNIFORMS}
override A: f32;
override B: f32;
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> z0: array<f32>;
@group(0) @binding(2) var<storage, read> zin: array<f32>;
@group(0) @binding(3) var<storage, read> k: array<f32>;
@group(0) @binding(4) var<storage, read_write> zout: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= u.n * u.n) { return; }
  zout[c] = A * z0[c] + B * (zin[c] + u.dt * k[c]);
}
`;

/**
 * Passive tracers, semi-Lagrangian. Channel r: clouds (re-seeded with noise, decaying).
 * Channel g: bands (advected only). Channel b: age-of-fluid (for a subtle tint).
 */
export const TRACER_SCALE = 2;

export const TRACER = /* wgsl */ `
${UNIFORMS}
${HELPERS}
const TRACER_SCALE: u32 = ${TRACER_SCALE}u;
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> psi: array<f32>;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;

fn velocity(p: vec2f) -> vec2f {
  // p in domain coords [-1,1]; nearest-cell central differences of ψ.
  let n = u.n;
  let fx = (p.x + 1.0) / u.dx - 0.5;
  let fy = (p.y + 1.0) / u.dx - 0.5;
  let i = i32(round(fx));
  let j = i32(round(fy));
  let e = idx(wrap(i + 1, n), wrap(j, n), n);
  let w = idx(wrap(i - 1, n), wrap(j, n), n);
  let nn = idx(wrap(i, n), wrap(j + 1, n), n);
  let s = idx(wrap(i, n), wrap(j - 1, n), n);
  return vec2f(-(psi[nn] - psi[s]), psi[e] - psi[w]) / (2.0 * u.dx);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tn = u.n * TRACER_SCALE;
  if (gid.x >= tn || gid.y >= tn) { return; }
  let tdx = 2.0 / f32(tn);
  let dt = u.tracer.z;
  let p = vec2f(-1.0 + (f32(gid.x) + 0.5) * tdx, -1.0 + (f32(gid.y) + 0.5) * tdx);
  // RK2 back-trace.
  let v1 = velocity(p);
  let pm = p - 0.5 * dt * v1;
  let v2 = velocity(pm);
  let q = p - dt * v2;
  let uv = fract((q + 1.0) * 0.5);
  var t = textureSampleLevel(src, samp, uv, 0.0);

  // Clouds: forget slowly, re-seed with fine noise so streaks keep forming.
  let cell = vec2f(f32(gid.x), f32(gid.y)) / f32(TRACER_SCALE);
  let noise = hash13(vec3f(cell, u.tracer.w)) - 0.5;
  let coarse = vnoise(cell * 0.05 + vec2f(u.tracer.w * 0.37, -u.tracer.w * 0.21)) - 0.5;
  let r = length(p);
  let outside = smoothstep(u.capRadius, 1.0, r);
  let decay = (u.tracer.y + 3.0 * outside) * dt;
  // Seed clouds where the air moves; still air stays smooth instead of blotchy.
  let inject = u.tracer.x * dt * (1.0 - 0.85 * outside) * (0.1 + 0.9 * smoothstep(0.0, 0.2, length(v1)));
  t.r = t.r * (1.0 - decay) + inject * (0.45 * noise + 1.1 * coarse);
  // Bands: pure advection, but a very slow relaxation toward the printed pattern far
  // outside the cap so the sponge region stays tidy.
  let band = 0.5 + 0.5 * sin(r * u.bandRadius);
  t.g = mix(t.g, band, outside * 0.1);
  t.b = min(t.b + dt * 0.02, 1.0);
  t.a = 1.0;
  textureStore(dst, vec2i(gid.xy), t);
}
`;

/** Initialise the tracer textures. */
export const TRACER_INIT = /* wgsl */ `
${UNIFORMS}
${HELPERS}
const TRACER_SCALE: u32 = ${TRACER_SCALE}u;
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tn = u.n * TRACER_SCALE;
  if (gid.x >= tn || gid.y >= tn) { return; }
  let tdx = 2.0 / f32(tn);
  let p = vec2f(-1.0 + (f32(gid.x) + 0.5) * tdx, -1.0 + (f32(gid.y) + 0.5) * tdx);
  let r = length(p);
  let cell = vec2f(f32(gid.x), f32(gid.y)) / f32(TRACER_SCALE);
  let band = 0.5 + 0.5 * sin(r * u.bandRadius + 0.4 * (vnoise(cell * 0.03) - 0.5));
  let cloud = 0.10 * (vnoise(cell * 0.06) - 0.5) + 0.05 * (vnoise(cell * 0.2) - 0.5);
  textureStore(dst, vec2i(gid.xy), vec4f(cloud, band, 0.0, 1.0));
}
`;

/** Sample ζ around the jet ring for the mode readout (bilinear). */
export const RING = /* wgsl */ `
${UNIFORMS}
${HELPERS}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> zeta: array<f32>;
@group(0) @binding(2) var<storage, read_write> ring: array<f32>;
const SAMPLES: u32 = RING_SAMPLES_U;

fn at(i: i32, j: i32) -> f32 { return zeta[idx(wrap(i, u.n), wrap(j, u.n), u.n)]; }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= SAMPLES) { return; }
  let a = 6.283185307179586 * f32(gid.x) / f32(SAMPLES);
  let p = u.jetRadius * vec2f(cos(a), sin(a));
  let fx = (p.x + 1.0) / u.dx - 0.5;
  let fy = (p.y + 1.0) / u.dx - 0.5;
  let i0 = i32(floor(fx));
  let j0 = i32(floor(fy));
  let tx = fx - f32(i0);
  let ty = fy - f32(j0);
  ring[gid.x] = mix(mix(at(i0, j0), at(i0 + 1, j0), tx), mix(at(i0, j0 + 1), at(i0 + 1, j0 + 1), tx), ty);
}
`;
