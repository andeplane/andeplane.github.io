import type { Geometry } from '../../physics/lattice.ts';

/**
 * Sums spin and forward-bond products over the whole lattice.
 *
 * Accumulation is integer end to end: spins and bond products are ±1, and f32
 * accumulation over 16.7M terms exceeds the 24-bit mantissa — a bias that the
 * fluctuation formulas for χ and C_v would amplify. i32 holds the exact sums with
 * room to spare (|sumS| ≤ N ≈ 1.7e7, |sumBonds| ≤ 3N).
 */
export function buildReduceShader(geometry: Geometry): string {
  return /* wgsl */ `
struct ReduceUniforms {
  L: u32,
  n: u32,
}

struct Results {
  sum_s: atomic<i32>,
  sum_bonds: atomic<i32>,
}

@group(0) @binding(0) var<storage, read> spins: array<u32>;
@group(0) @binding(1) var<uniform> red_u: ReduceUniforms;
@group(0) @binding(2) var<storage, read_write> results: Results;

fn spin_at(x: u32, y: u32) -> i32 {
  return 2 * i32(spins[y * red_u.L + x]) - 1;
}

var<workgroup> shared_sums: array<vec2i, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_index) lidx: u32,
  @builtin(num_workgroups) nwg: vec3u,
) {
  let L = red_u.L;
  let total_threads = nwg.x * 256u;
  var local = vec2i(0, 0);

  // Grid-stride loop over cells.
  for (var i = gid.x; i < red_u.n; i += total_threads) {
    let x = i % L;
    let y = i / L;
    let xp = select(x + 1u, 0u, x + 1u == L);
    let yp = select(y + 1u, 0u, y + 1u == L);
    ${geometry.wgslBondSum}
    local += vec2i(s, bsum);
  }
  shared_sums[lidx] = local;
  workgroupBarrier();

  var step = 128u;
  while (step > 0u) {
    if (lidx < step) {
      shared_sums[lidx] += shared_sums[lidx + step];
    }
    workgroupBarrier();
    step >>= 1u;
  }

  if (lidx == 0u) {
    atomicAdd(&results.sum_s, shared_sums[0].x);
    atomicAdd(&results.sum_bonds, shared_sums[0].y);
  }
}
`;
}
