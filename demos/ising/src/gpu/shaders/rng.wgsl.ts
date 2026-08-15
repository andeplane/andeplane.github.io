/**
 * Counter-based RNG: no per-cell state buffer, just a hash of (x, y, pass counter,
 * run seed). The pass counter increments on every color pass and never repeats for a
 * given seed — reusing a (cell, counter) pair would replay decisions and freeze the
 * dynamics.
 *
 * pcg4d (Jarzynski & Olano) with the cell coordinates in two dedicated components.
 * This is load-bearing: hashing the flattened cell index in a single component (with
 * counter and seed constant across a pass) degenerates into a weak 1D permutation
 * whose stride correlations show up as huge diagonal stripe domains — worst exactly
 * where this demo gets stared at, near and below T_c.
 */
export const RNG_WGSL = /* wgsl */ `
fn pcg4d(seed: vec4u) -> vec4u {
  var v = seed * 1664525u + 1013904223u;
  v.x += v.y * v.w;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v.w += v.y * v.z;
  v ^= v >> vec4u(16u);
  v.x += v.y * v.w;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v.w += v.y * v.z;
  return v;
}

/* Uniform in [0, 1) with 24 bits of mantissa. */
fn rand01(x: u32, y: u32, counter: u32, seed: u32) -> f32 {
  let h = pcg4d(vec4u(x, y, counter, seed)).x;
  return f32(h >> 8u) * (1.0 / 16777216.0);
}
`;
