// Cosmetic dye: high-resolution semi-Lagrangian advection over the sim's
// velocity field. Runs per rendered frame (not per sim tick) so motion stays
// smooth at any refresh rate. Injection is colored per inlet segment so the
// attacker's routes read as color.

import { CONFIG } from '../../../config'
import type { DomainMap } from '../../../engine/map'

export function dyeShaderSource(map: DomainMap, dyeW: number, dyeH: number): string {
  const colors = CONFIG.segmentColors
  const segmentInject = map.inletSegments
    .map((seg, s) => {
      const c = colors[s % colors.length]
      return /* wgsl */ `
  if (simRow >= ${seg.y0}.0 && simRow <= ${seg.y1}.0) {
    injectColor = vec3<f32>(${c[0]}, ${c[1]}, ${c[2]});
  }`
    })
    .join('\n')

  return /* wgsl */ `
const DYE_W : i32 = ${dyeW};
const DYE_H : i32 = ${dyeH};
const SIM_H : f32 = ${map.height}.0;
const INLET_U : f32 = ${CONFIG.inlet.u};

struct DyeParams {
  advScale : f32, // sim-cells of displacement per unit velocity this frame, in dye px
  fade : f32,
  time : f32,
  injectWidth : f32,
};

@group(0) @binding(0) var dyeIn : texture_2d<f32>;
@group(0) @binding(1) var dyeOut : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var macroTex : texture_2d<f32>;
@group(0) @binding(3) var linearSampler : sampler;
@group(0) @binding(4) var<uniform> params : DyeParams;
@group(0) @binding(5) var<storage, read> inletProfile : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= DYE_W || y >= DYE_H) { return; }
  let uv = (vec2<f32>(f32(x), f32(y)) + 0.5) / vec2<f32>(f32(DYE_W), f32(DYE_H));

  let mac = textureSampleLevel(macroTex, linearSampler, uv, 0.0);
  let vel = mac.xy;

  // Semi-Lagrangian backtrace (displacement in dye pixels → uv units).
  let src = uv - vel * params.advScale / vec2<f32>(f32(DYE_W), f32(DYE_H));
  var c = textureSampleLevel(dyeIn, linearSampler, src, 0.0).rgb * params.fade;

  // Kill dye inside solids so eroding walls flush clean.
  c *= 1.0 - mac.w;

  // Injection band at the inlet, colored per segment, streaked in time.
  if (f32(x) < params.injectWidth) {
    let simRow = uv.y * SIM_H;
    var injectColor = vec3<f32>(0.0);
${segmentInject}
    let prof = inletProfile[i32(simRow)];
    let strength = clamp(prof.y / INLET_U, 0.0, 1.5);
    if (strength > 0.001) {
      // Ink filaments: sharp bright threads that drift slowly along the inlet,
      // so wakes fold distinct streaklines instead of one smeared band.
      let filament = pow(0.5 + 0.5 * sin(f32(y) * 0.55 + params.time * 1.1), 4.0);
      let streak = 0.12 + 1.25 * filament;
      c = max(c, injectColor * strength * streak);
    }
  }

  textureStore(dyeOut, vec2<i32>(x, y), vec4<f32>(c, 1.0));
}
`
}
