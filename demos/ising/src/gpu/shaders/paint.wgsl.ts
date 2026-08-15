import { RNG_WGSL } from './rng.wgsl.ts';

/**
 * Brush stamp: sets spins inside a capsule (segment a→b with a radius, so fast mouse
 * moves leave no gaps). The capsule lives in world space so the brush stays circular
 * on the oblique triangular basis; the dispatch covers an index-space bounding box
 * computed on the CPU. Indices arrive unwrapped (the box may straddle the torus seam)
 * and are wrapped only for the buffer write.
 */
export const PAINT_WGSL = /* wgsl */ `
struct PaintUniforms {
  a: vec2f,
  b: vec2f,
  radius: f32,
  value: u32, // 0 = down, 1 = up, 2 = random
  L: u32,
  geom: u32, // 0 square, 1 triangular, 2 honeycomb
  i0: i32,
  j0: i32,
  seed: u32,
  counter: u32,
}

@group(0) @binding(0) var<storage, read_write> spins: array<u32>;
@group(0) @binding(1) var<uniform> paint_u: PaintUniforms;

${RNG_WGSL}

fn site_pos(i: f32, j: f32, geom: u32, parity_even: bool) -> vec2f {
  switch geom {
    case 0u: {
      return vec2f(i, j);
    }
    case 1u: {
      return vec2f(i + 0.5 * j, 0.8660254 * j);
    }
    default: {
      let dy = select(-0.25, 0.25, parity_even);
      return vec2f(i * 0.8660254, j * 1.5 + dy);
    }
  }
}

fn dist_to_segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return distance(p, a + t * ab);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = paint_u.i0 + i32(gid.x);
  let j = paint_u.j0 + i32(gid.y);
  let parity_even = ((i + j) % 2 + 2) % 2 == 0;
  let p = site_pos(f32(i), f32(j), paint_u.geom, parity_even);
  if (dist_to_segment(p, paint_u.a, paint_u.b) > paint_u.radius) {
    return;
  }
  let L = i32(paint_u.L);
  let xi = u32(((i % L) + L) % L);
  let yj = u32(((j % L) + L) % L);
  let idx = yj * paint_u.L + xi;
  var v = paint_u.value;
  if (v == 2u) {
    v = select(0u, 1u, rand01(xi, yj, paint_u.counter, paint_u.seed) < 0.5);
  }
  spins[idx] = v;
}
`;
