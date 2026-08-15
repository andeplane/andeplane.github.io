import { RNG_WGSL } from './rng.wgsl.ts';

/** Reset the lattice: all down, all up, or independent coin flips. */
export const FILL_WGSL = /* wgsl */ `
struct FillUniforms {
  mode: u32, // 0 = all down, 1 = all up, 2 = random
  seed: u32,
  n: u32,
  L: u32,
}

@group(0) @binding(0) var<storage, read_write> spins: array<u32>;
@group(0) @binding(1) var<uniform> fill_u: FillUniforms;

${RNG_WGSL}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= fill_u.n) {
    return;
  }
  var v: u32;
  switch fill_u.mode {
    case 0u: { v = 0u; }
    case 1u: { v = 1u; }
    default: { v = select(0u, 1u, rand01(i % fill_u.L, i / fill_u.L, 0u, fill_u.seed) < 0.5); }
  }
  spins[i] = v;
}
`;
