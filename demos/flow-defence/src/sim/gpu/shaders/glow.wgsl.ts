// The enemy glow field — pure spectacle, zero gameplay. Spores (and their kill
// flashes) are stamped into the `glow` buffer by the enemy pass; this pass
// folds those stamps into a field that is advected by the flow and faded each
// tick, so every spore drags a luminous comet tail through the water.
// Runs once per 60 Hz tick, after the enemy pass; consumes and zeroes `glow`.

import { CONFIG } from '../../../config'
import { CELL } from '../../core/constants'
import { GLOW_SCALE } from './enemies.wgsl'

export function glowShaderSource(width: number, height: number): string {
  return /* wgsl */ `
const SIM_W : i32 = ${width};
const SIM_H : i32 = ${height};
const GLOW_SCALE : f32 = ${GLOW_SCALE}.0;
const FADE : f32 = ${CONFIG.glow.fade};
const CAP : f32 = ${CONFIG.glow.cap}.0;
const CELL_BEDROCK : u32 = ${CELL.BEDROCK}u;

struct GlowParams {
  advScale : f32,   // cells of displacement per unit velocity per tick (= substeps)
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};

@group(0) @binding(0) var bioIn : texture_2d<f32>;
@group(0) @binding(1) var bioOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var macroTex : texture_2d<f32>;
@group(0) @binding(3) var linearSampler : sampler;
@group(0) @binding(4) var<uniform> params : GlowParams;
@group(0) @binding(5) var<storage, read> cellType : array<u32>;
@group(0) @binding(6) var<storage, read_write> glow : array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= SIM_W || y >= SIM_H) { return; }
  let idx = y * SIM_W + x;

  // Consume this tick's stamps (and clear for the next enemy pass).
  let stamped = f32(glow[idx]) / GLOW_SCALE;
  glow[idx] = 0u;

  let mac = textureLoad(macroTex, vec2<i32>(x, y), 0);
  var g = 0.0;
  if (mac.w < 1.0 && cellType[idx] != CELL_BEDROCK) {
    // Advect the existing trail with the flow, fade, and add fresh stamps.
    let uv = (vec2<f32>(f32(x), f32(y)) + 0.5) / vec2<f32>(f32(SIM_W), f32(SIM_H));
    let src = uv - mac.xy * params.advScale / vec2<f32>(f32(SIM_W), f32(SIM_H));
    g = textureSampleLevel(bioIn, linearSampler, src, 0.0).r * FADE * (1.0 - mac.w);
    g = min(g + stamped, CAP);
  }

  textureStore(bioOut, vec2<i32>(x, y), vec4<f32>(g, 0.0, 0.0, 1.0));
}
`
}
