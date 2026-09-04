// Wall erosion pass — one dispatch per 60 Hz tick, after the LBM substeps.
// Mirrors sim/core/erosionRule.ts exactly; constants interpolated from CONFIG.

import { CELL } from '../../core/constants'
import { CONFIG } from '../../../config'

export function erosionShaderSource(width: number, height: number): string {
  const { kShear, shearThreshold, kPipe, pipeThreshold, porosityEps, cureRate } = CONFIG.erosion
  return /* wgsl */ `
const SIM_W : i32 = ${width};
const SIM_H : i32 = ${height};

const CELL_OPEN : u32 = ${CELL.OPEN}u;
const CELL_WALL : u32 = ${CELL.WALL}u;
const CELL_INLET : u32 = ${CELL.INLET}u;
const CELL_OUTLET : u32 = ${CELL.OUTLET}u;

const K_SHEAR : f32 = ${kShear};
const SHEAR_THRESH : f32 = ${shearThreshold};
const K_PIPE : f32 = ${kPipe};
const PIPE_THRESH : f32 = ${pipeThreshold};
const POROSITY_EPS : f32 = ${porosityEps};
const CURE_RATE : f32 = ${cureRate};

@group(0) @binding(0) var<storage, read_write> cellType : array<u32>;
@group(0) @binding(1) var<storage, read_write> solidity : array<f32>;
@group(0) @binding(2) var macroTex : texture_2d<f32>;
// Monotone counters for observables (read back by the engine): 0 = breach count.
@group(0) @binding(3) var<storage, read_write> counters : array<atomic<u32>>;

fn isFlow(t : u32) -> bool {
  return t == CELL_OPEN || t == CELL_INLET || t == CELL_OUTLET;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= SIM_W || y >= SIM_H) { return; }
  let idx = y * SIM_W + x;
  if (cellType[idx] != CELL_WALL) { return; }

  var shear = 0.0;
  var maxRho = 0.0;
  for (var k = 0; k < 4; k++) {
    var nx = x;
    var ny = y;
    if (k == 0) { nx = x + 1; } else if (k == 1) { nx = x - 1; }
    else if (k == 2) { ny = y + 1; } else { ny = y - 1; }
    if (nx < 0 || nx >= SIM_W || ny < 0 || ny >= SIM_H) { continue; }
    if (!isFlow(cellType[ny * SIM_W + nx])) { continue; }
    let mac = textureLoad(macroTex, vec2<i32>(nx, ny), 0);
    shear = max(shear, length(mac.xy));
    maxRho = max(maxRho, mac.z);
  }

  let head = max(maxRho - 1.0, 0.0);
  let integ = solidity[idx];
  // Porosity only opens below integrity 1 (construction armor stays sealed).
  let poro = POROSITY_EPS + (1.0 - POROSITY_EPS) * (1.0 - min(integ, 1.0));
  let stress = K_SHEAR * max(shear - SHEAR_THRESH, 0.0)
             + K_PIPE * max(head - PIPE_THRESH, 0.0) * poro;
  // Self-healing competes with erosion — but a wall can't heal while pressure
  // is forcing water through it OR fast water is scouring it (otherwise cure
  // outruns the maximum possible shear stress and narrow canals become free).
  // Healing never rebuilds armor above 1.
  let cure = select(CURE_RATE, 0.0, head > PIPE_THRESH || shear > SHEAR_THRESH);
  let next = max(integ, min(integ + cure, 1.0)) - stress;
  if (next <= 0.0) {
    cellType[idx] = CELL_OPEN;
    solidity[idx] = 0.0;
    atomicAdd(&counters[0], 1u);
  } else {
    solidity[idx] = next;
  }
}
`
}
