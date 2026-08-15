// Biomass — the enemy as a scalar field. Semi-Lagrangian advection on the LBM
// velocity, injected at inlet rows (attacker's release valve), decayed by the
// tower damage field, absorbed at the outlet into a monotone score counter.
// Runs once per 60 Hz tick.
//
// Counters layout (atomic<u32>, fixed-point ×1024 for mass slots):
//   [0] breach count (written by erosion pass)
//   [1] outlet-absorbed biomass, monotone — THE score integral
//   [2] total in-flight biomass (cleared by CPU each tick, then re-summed)
//   [3] neutralized-by-towers biomass, monotone
//   [8+s] sum of rho over inlet rows of segment s this tick (cleared each tick)

import { CONFIG } from '../../../config'
import { CELL } from '../../core/constants'

export const MASS_SCALE = 1024

export function biomassShaderSource(width: number, height: number): string {
  return /* wgsl */ `
const SIM_W : i32 = ${width};
const SIM_H : i32 = ${height};
const MASS_SCALE : f32 = ${MASS_SCALE}.0;

const CELL_OPEN : u32 = ${CELL.OPEN}u;
const CELL_BEDROCK : u32 = ${CELL.BEDROCK}u;
const CELL_WALL : u32 = ${CELL.WALL}u;
const CELL_INLET : u32 = ${CELL.INLET}u;
const CELL_OUTLET : u32 = ${CELL.OUTLET}u;

struct BioParams {
  advScale : f32,   // cells of displacement per unit velocity per tick (= substeps)
  injectRate : f32, // biomass added per inlet row per tick at rate 1
  pad0 : f32,
  pad1 : f32,
};

@group(0) @binding(0) var bioIn : texture_2d<f32>;
@group(0) @binding(1) var bioOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var macroTex : texture_2d<f32>;
@group(0) @binding(3) var linearSampler : sampler;
@group(0) @binding(4) var<uniform> params : BioParams;
@group(0) @binding(5) var<storage, read> inletProfile : array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> cellType : array<u32>;
@group(0) @binding(7) var<storage, read> towerField : array<f32>; // decay rate per cell per tick
@group(0) @binding(8) var<storage, read_write> counters : array<atomic<u32>>;
@group(0) @binding(9) var<storage, read> rowSegmentTable : array<u32>;

fn rowSegment(y : i32) -> u32 { return rowSegmentTable[y]; }

var<workgroup> wgTotal : array<f32, 64>;
var<workgroup> wgAbsorbed : array<f32, 64>;
var<workgroup> wgKilled : array<f32, 64>;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) gid : vec3<u32>,
  @builtin(local_invocation_index) li : u32,
) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  let inBounds = x < SIM_W && y < SIM_H;

  var b = 0.0;
  var absorbed = 0.0;
  var killed = 0.0;

  if (inBounds) {
    let idx = y * SIM_W + x;
    let t = cellType[idx];
    let uv = (vec2<f32>(f32(x), f32(y)) + 0.5) / vec2<f32>(f32(SIM_W), f32(SIM_H));
    let mac = textureLoad(macroTex, vec2<i32>(x, y), 0);

    if (mac.w >= 1.0 || t == CELL_BEDROCK) {
      b = 0.0;
    } else {
      // Advect (velocity sampled at this cell; displacement over one tick).
      let src = uv - mac.xy * params.advScale / vec2<f32>(f32(SIM_W), f32(SIM_H));
      b = textureSampleLevel(bioIn, linearSampler, src, 0.0).r;

      // Partially solid (eroding walls) squeeze biomass out; natural death
      // keeps the field calibrated and lets spent clouds dissipate.
      b *= (1.0 - mac.w) * (1.0 - ${CONFIG.biomass.decayPerTick});

      // Tower damage: exponential decay reaction.
      let rate = towerField[idx];
      if (rate > 0.0) {
        let after = b * exp(-rate);
        killed = b - after;
        b = after;
      }

      if (t == CELL_INLET) {
        // Dirichlet source: the inlet holds a fixed concentration (release
        // valve), and the flow carries it away. Accumulating (+=) here explodes:
        // the boundary clamp makes inlet cells retain their own content forever.
        b = inletProfile[y].z * params.injectRate;
        // Inlet pressure observable, per segment.
        let seg = rowSegment(y);
        if (seg != 0xffffffffu) {
          atomicAdd(&counters[8u + seg], u32(mac.z * MASS_SCALE));
        }
      }

      if (t == CELL_OUTLET) {
        absorbed = b;
        b = 0.0;
      }
    }

    textureStore(bioOut, vec2<i32>(x, y), vec4<f32>(b, 0.0, 0.0, 1.0));
  }

  // Workgroup-reduced counters (one atomicAdd per group per counter).
  wgTotal[li] = b;
  wgAbsorbed[li] = absorbed;
  wgKilled[li] = killed;
  workgroupBarrier();
  var stride = 32u;
  while (stride > 0u) {
    if (li < stride) {
      wgTotal[li] += wgTotal[li + stride];
      wgAbsorbed[li] += wgAbsorbed[li + stride];
      wgKilled[li] += wgKilled[li + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }
  if (li == 0u) {
    if (wgTotal[0] > 0.0) { atomicAdd(&counters[2], u32(wgTotal[0] * MASS_SCALE)); }
    if (wgAbsorbed[0] > 0.0) { atomicAdd(&counters[1], u32(wgAbsorbed[0] * MASS_SCALE)); }
    if (wgKilled[0] > 0.0) { atomicAdd(&counters[3], u32(wgKilled[0] * MASS_SCALE)); }
  }
}
`
}
