/** Uniform block shared by every shader. Keep in sync with `Uniforms` in solver.ts. */
export const UNIFORMS = /* wgsl */ `
struct Uniforms {
  n: u32,
  dt: f32,
  dx: f32,
  time: f32,

  jetRadius: f32,
  gamma: f32,
  nu: f32,
  relax: f32,

  // x, y in domain coords, strength (signed), radius. strength = 0 → no splat.
  mouse: vec4f,
  // mode, contour density, exposure, aspect (w/h)
  view: vec4f,
  // inject, decay, frameDt, seed
  tracer: vec4f,

  capRadius: f32,
  bandRadius: f32,
  showRing: f32,
  pad0: f32,
};
`;

export const HELPERS = /* wgsl */ `
fn idx(i: u32, j: u32, n: u32) -> u32 { return j * n + i; }
fn wrap(i: i32, n: u32) -> u32 { return u32((i + i32(n)) % i32(n)); }

// Hash noise (Dave Hoskins style) — deterministic per cell, cheap.
fn hash13(p3in: vec3f) -> f32 {
  var p3 = fract(p3in * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise, smooth.
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;
