/**
 * Counter-based random numbers shared bit-for-bit by the CPU path and the WGSL kernels,
 * so a given valve has the same manufacturing error on both, and a given readout the
 * same flow-meter noise. (lowbias32 integer hash by Chris Wellons.)
 */
export function hash32(x: number): number {
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

export function hash3(a: number, b: number, c: number): number {
  return hash32((a ^ hash32((b ^ hash32(c >>> 0)) >>> 0)) >>> 0)
}

/** Uniform in [0, 1) with 24 bits (exact in f32). */
export function uniform3(a: number, b: number, c: number): number {
  return (hash3(a, b, c) >>> 8) / 16777216
}

/** Standard normal via Box–Muller on two hashed uniforms. */
export function gauss3(a: number, b: number, c: number): number {
  const h = hash3(a, b, c)
  const u1 = ((h >>> 8) + 0.5) / 16777216
  const u2 = (hash32(h ^ 0x9e3779b9) >>> 8) / 16777216
  // cos(2πu) written as −cos(2π(u − ½)) so the GPU's cos stays inside [−π, π], where
  // WGSL guarantees its accuracy
  return -Math.sqrt(-2 * Math.log(u1)) * Math.cos(6.283185307179586 * (u2 - 0.5))
}

export const WGSL_RNG = /* wgsl */ `
fn hash32(x0: u32) -> u32 {
  var x = x0;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}
fn hash3(a: u32, b: u32, c: u32) -> u32 {
  return hash32(a ^ hash32(b ^ hash32(c)));
}
fn uniform3(a: u32, b: u32, c: u32) -> f32 {
  return f32(hash3(a, b, c) >> 8u) / 16777216.0;
}
fn gauss3(a: u32, b: u32, c: u32) -> f32 {
  let h = hash3(a, b, c);
  let u1 = (f32(h >> 8u) + 0.5) / 16777216.0;
  let u2 = f32(hash32(h ^ 0x9e3779b9u) >> 8u) / 16777216.0;
  return -sqrt(-2.0 * log(u1)) * cos(6.283185307179586 * (u2 - 0.5));
}
`
