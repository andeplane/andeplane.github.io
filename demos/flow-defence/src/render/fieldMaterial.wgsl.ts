// The game board: one fullscreen-quad WGSL material compositing dye, biomass
// (later), walls, and pressure into an HDR image for the post pipeline.

export function fieldVertexSource(): string {
  return /* wgsl */ `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3<f32>;
attribute uv : vec2<f32>;
varying vUV : vec2<f32>;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  vertexOutputs.position = scene.viewProjection * mesh.world * vec4<f32>(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
}
`
}

export type FieldViewMode = 'beauty' | 'speed' | 'pressure' | 'dye'

export function fieldFragmentSource(
  simW: number,
  simH: number,
  dyeW: number,
  dyeH: number,
  mode: FieldViewMode = 'beauty',
): string {
  const debugView =
    mode === 'speed'
      ? /* wgsl */ `
  let s = length(mac.xy) / 0.12;
  fragmentOutputs.color = vec4<f32>(mix(vec3<f32>(0.0, 0.0, 0.1), vec3<f32>(1.0, 0.9, 0.2), clamp(s, 0.0, 1.0)) + vec3<f32>(mac.w * 0.3), 1.0);`
      : mode === 'pressure'
        ? /* wgsl */ `
  let p = (mac.z - 1.0) * 60.0;
  fragmentOutputs.color = vec4<f32>(clamp(p, 0.0, 1.0), mac.w * 0.4, clamp(-p, 0.0, 1.0), 1.0);`
        : mode === 'dye'
          ? /* wgsl */ `
  fragmentOutputs.color = vec4<f32>(dye, 1.0);`
          : ''

  return /* wgsl */ `
varying vUV : vec2<f32>;
var dyeTex : texture_2d<f32>;
var dyeTexSampler : sampler;
var macroTex : texture_2d<f32>;
var macroTexSampler : sampler;
var bioTex : texture_2d<f32>;
var bioTexSampler : sampler;

const SIM_TEXEL = vec2<f32>(${1 / simW}, ${1 / simH});
const DYE_TEXEL = vec2<f32>(${1 / dyeW}, ${1 / dyeH});

fn hash2(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn dyeLum(uv : vec2<f32>) -> f32 {
  let c = textureSample(dyeTex, dyeTexSampler, uv).rgb;
  return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUV;
  let mac = textureSample(macroTex, macroTexSampler, uv);
  let dye = textureSample(dyeTex, dyeTexSampler, uv).rgb;
  let solid = mac.w;
  let speed = length(mac.xy);

  // Deep-water base: dark, slightly graded, alive with a faint speed sheen.
  var col = mix(vec3<f32>(0.010, 0.016, 0.034), vec3<f32>(0.022, 0.042, 0.078), uv.y);
  col += speed * vec3<f32>(0.10, 0.30, 0.52) * 1.35;

  // Dye with a contrast curve (deepens filament definition) and HDR headroom.
  col += pow(max(dye, vec3<f32>(0.0)), vec3<f32>(1.3)) * 1.25;

  // Liquid shading: dye density as heightfield → gradient normal → specular.
  let l = dyeLum(uv);
  let lx = dyeLum(uv + vec2<f32>(DYE_TEXEL.x, 0.0)) - dyeLum(uv - vec2<f32>(DYE_TEXEL.x, 0.0));
  let ly = dyeLum(uv + vec2<f32>(0.0, DYE_TEXEL.y)) - dyeLum(uv - vec2<f32>(0.0, DYE_TEXEL.y));
  let nrm = normalize(vec3<f32>(-lx * 22.0, -ly * 22.0, 1.0));
  let lightDir = normalize(vec3<f32>(-0.45, 0.65, 0.62));
  let halfVec = normalize(lightDir + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(max(dot(nrm, halfVec), 0.0), 42.0) * smoothstep(0.02, 0.35, l);
  col += spec * vec3<f32>(0.9, 1.0, 1.0) * 1.9;

  // Biomass: the enemy as bioluminescence — hot coral glow the towers must kill.
  let bio = textureSample(bioTex, bioTexSampler, uv).r;
  let bioGlow = pow(clamp(bio, 0.0, 1.6), 1.25);
  col += bioGlow * vec3<f32>(1.9, 0.28, 0.44) * (1.0 - solid);

  // Pressure telegraph: only over-density beyond the steady-state head glows
  // (steady inlet rho ≈ 1.03; surges push well past it).
  let over = max(mac.z - 1.03, 0.0);
  col += over * 7.0 * vec3<f32>(1.0, 0.42, 0.13) * (1.0 - solid);

  // Solids: carved rock with per-cell grain and a cool rim light on the water side.
  let cell = floor(uv / SIM_TEXEL);
  let rock = vec3<f32>(0.042, 0.052, 0.068) * (0.75 + 0.5 * hash2(cell));
  var rim = 0.0;
  for (var k = 0; k < 4; k++) {
    var off : vec2<f32>;
    if (k == 0) { off = vec2<f32>(SIM_TEXEL.x, 0.0); }
    else if (k == 1) { off = vec2<f32>(-SIM_TEXEL.x, 0.0); }
    else if (k == 2) { off = vec2<f32>(0.0, SIM_TEXEL.y); }
    else { off = vec2<f32>(0.0, -SIM_TEXEL.y); }
    rim = max(rim, textureSample(macroTex, macroTexSampler, uv + off * 1.5).w);
  }
  let waterRim = rim * (1.0 - solid) * (0.25 + speed * 3.0);
  col = mix(col, rock, solid);
  col += waterRim * vec3<f32>(0.16, 0.55, 0.75);

  // Failing walls glow through their cracks — the pre-breach warning is
  // lighting, not UI. Uses the cell-exact solidity (textureLoad) so bilinear
  // edge blending doesn't paint embers on every solid boundary.
  let exact = textureLoad(macroTex, vec2<i32>(cell), 0).w;
  let damage = (1.0 - exact) * step(0.02, exact);
  let crack = pow(damage, 1.5) * (0.35 + 0.65 * hash2(cell * 1.7));
  col += crack * exact * 5.0 * vec3<f32>(1.0, 0.42, 0.12);

  fragmentOutputs.color = vec4<f32>(col, 1.0);
${debugView}
}
`
}
