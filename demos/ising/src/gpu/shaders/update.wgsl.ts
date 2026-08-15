import { RNG_WGSL } from './rng.wgsl.ts';
import type { Geometry } from '../../physics/lattice.ts';

/** Single source of truth for the kernel's workgroup shape and the dispatch math. */
export const UPDATE_WORKGROUP = { x: 64, y: 4 } as const;

/**
 * One Metropolis/Glauber color pass. The dispatch covers exactly the cells of one
 * color (x is computed from the invocation id), never the full grid with a mask —
 * masking wastes half to two thirds of the invocations and shreds SIMD lanes.
 *
 * In-place update of the spin buffer is safe because same-color cells are never
 * neighbors; the ordering between colors comes from separate dispatches.
 */
export function buildUpdateShader(geometry: Geometry): string {
  return /* wgsl */ `
struct PassUniforms {
  L: u32,
  color: u32,
  counter: u32,
  seed: u32,
  beta: f32,
  h: f32,
  algo: u32, // 0 = Metropolis, 1 = Glauber
}

@group(0) @binding(0) var<storage, read_write> spins: array<u32>;
@group(0) @binding(1) var<uniform> pass_u: PassUniforms;
@group(0) @binding(2) var<storage, read_write> flips: atomic<u32>;

${RNG_WGSL}

fn spin_at(x: u32, y: u32) -> i32 {
  return 2 * i32(spins[y * pass_u.L + x]) - 1;
}

var<workgroup> wg_flips: atomic<u32>;

@compute @workgroup_size(${UPDATE_WORKGROUP.x}, ${UPDATE_WORKGROUP.y})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) lidx: u32) {
  let L = pass_u.L;
  let y = gid.y;
  let stride = L / ${geometry.colors}u;
  var alive = gid.x < stride && y < L;

  if (alive) {
    ${
      geometry.colors === 2
        ? `let x = 2u * gid.x + ((y + pass_u.color) & 1u);`
        : `let x = 3u * gid.x + ((pass_u.color + 3u - (y % 3u)) % 3u);`
    }
    // Wrapped neighbors via select — never % on a u32 subtraction.
    let xp = select(x + 1u, 0u, x + 1u == L);
    let xm = select(x - 1u, L - 1u, x == 0u);
    let yp = select(y + 1u, 0u, y + 1u == L);
    let ym = select(y - 1u, L - 1u, y == 0u);

    ${geometry.wgslNeighborSum}

    let i = y * L + x;
    let s = 2 * i32(spins[i]) - 1;
    // E = −J Σ s_i s_j − h Σ s_i with J = 1, so ΔE for flipping s is:
    let dE = 2.0 * f32(s) * (f32(nsum) + pass_u.h);

    var accept: bool;
    let r = rand01(x, y, pass_u.counter, pass_u.seed);
    if (pass_u.algo == 0u) {
      accept = dE <= 0.0 || r < exp(-pass_u.beta * dE);
    } else {
      accept = r < 1.0 / (1.0 + exp(pass_u.beta * dE));
    }
    if (accept) {
      spins[i] = 1u - spins[i];
      atomicAdd(&wg_flips, 1u);
    }
  }

  // One global atomic per workgroup, not per flip.
  workgroupBarrier();
  if (lidx == 0u) {
    let n = atomicLoad(&wg_flips);
    if (n > 0u) {
      atomicAdd(&flips, n);
    }
  }
}
`;
}
