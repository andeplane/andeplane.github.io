// WGSL kernels for the statevector backend.
//
// The state is array<vec2<f32>>: one complex amplitude per basis index, with
// qubit q as bit q of the index. WGSL has no f64, so amplitudes are single
// precision; after tens of thousands of gates the norm drifts by ~1e-5, far
// below anything a picture or a measurement histogram can show.
//
// Every kernel works on a flat thread index spread over a 2D grid of 256-wide
// workgroups, because one dimension stops at 65 535 workgroups (2^24 threads)
// and a 28-qubit state has 2^28 amplitudes.

const COMMON = /* wgsl */ `
struct Params {
  // gate: (target, control mask, -, work items)
  // swap: (qubit a, control mask, qubit b, work items)
  // permute: (-, control mask, register mask, work items)
  u: vec4<u32>,
  m0: vec4<f32>, // re00, im00, re01, im01
  m1: vec4<f32>, // re10, im10, re11, im11
}

fn flatIndex(wid: vec3<u32>, lid: u32, nwg: vec3<u32>) -> u32 {
  return (wid.y * nwg.x + wid.x) * 256u + lid;
}

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}
`

/** A 2×2 unitary on one target, gated on a control mask. One thread per pair. */
export const GATE = /* wgsl */ `${COMMON}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> state: array<vec2<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let k = flatIndex(wid, lid, nwg);
  if (k >= P.u.w) { return; }
  let bit = 1u << P.u.x;
  let low = bit - 1u;
  // Insert a 0 at the target bit: i0 has it clear, i1 has it set.
  let i0 = ((k & ~low) << 1u) | (k & low);
  let cm = P.u.y;
  if ((i0 & cm) != cm) { return; }
  let i1 = i0 | bit;
  let a = state[i0];
  let b = state[i1];
  state[i0] = cmul(P.m0.xy, a) + cmul(P.m0.zw, b);
  state[i1] = cmul(P.m1.xy, a) + cmul(P.m1.zw, b);
}
`

/** Exchange two qubits under a control mask. One thread per basis index. */
export const SWAP = /* wgsl */ `${COMMON}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> state: array<vec2<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = flatIndex(wid, lid, nwg);
  if (i >= P.u.w) { return; }
  let ba = 1u << P.u.x;
  let bb = 1u << P.u.z;
  let cm = P.u.y;
  // Each exchanged pair is handled by its member with a = 1, b = 0.
  if ((i & ba) == 0u || (i & bb) != 0u || (i & cm) != cm) { return; }
  let j = (i ^ ba) | bb;
  let t = state[i];
  state[i] = state[j];
  state[j] = t;
}
`

/**
 * A classical permutation of a register, gathered into a second buffer.
 * table[0] = register length k, table[1..k] = its qubits, table[32..] = the map.
 */
export const PERMUTE = /* wgsl */ `${COMMON}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> table: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = flatIndex(wid, lid, nwg);
  if (i >= P.u.w) { return; }
  var j = i;
  let cm = P.u.y;
  if ((i & cm) == cm) {
    let len = table[0];
    var x = 0u;
    for (var k = 0u; k < len; k++) { x |= ((i >> table[1u + k]) & 1u) << k; }
    let y = table[32u + x];
    var spread = 0u;
    for (var k = 0u; k < len; k++) { spread |= ((y >> k) & 1u) << table[1u + k]; }
    j = (i & ~P.u.z) | spread;
  }
  dst[j] = src[i];
}
`

/**
 * Marginal probabilities over a list of qubits, in partial sums: thread g
 * handles output o = g mod 2^k and one chunk of the other qubits' values.
 * info = (k, n − k, log2 chunks, -); qubits = [listed..., rest...].
 */
export const MARGINAL = /* wgsl */ `${COMMON}
@group(0) @binding(0) var<uniform> info: vec4<u32>;
@group(0) @binding(1) var<storage, read> state: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> qubits: array<u32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let g = flatIndex(wid, lid, nwg);
  let k = info.x;
  let rest = info.y;
  let total = 1u << (k + info.z);
  if (g >= total) { return; }
  let o = g & ((1u << k) - 1u);
  let chunk = g >> k;
  var base = 0u;
  for (var b = 0u; b < k; b++) { base |= ((o >> b) & 1u) << qubits[b]; }
  let len = 1u << (rest - info.z);
  var sum = 0.0;
  for (var r = chunk * len; r < (chunk + 1u) * len; r++) {
    var i = base;
    for (var b = 0u; b < rest; b++) { i |= ((r >> b) & 1u) << qubits[k + b]; }
    let a = state[i];
    sum += dot(a, a);
  }
  out[g] = sum;
}
`

/** Amplitudes on a list of qubits with every other bit pinned. info = (k, base, -, -). */
export const GATHER = /* wgsl */ `${COMMON}
@group(0) @binding(0) var<uniform> info: vec4<u32>;
@group(0) @binding(1) var<storage, read> state: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> qubits: array<u32>;
@group(0) @binding(3) var<storage, read_write> out: array<vec2<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let o = flatIndex(wid, lid, nwg);
  let k = info.x;
  if (o >= (1u << k)) { return; }
  var i = info.y;
  for (var b = 0u; b < k; b++) { i |= ((o >> b) & 1u) << qubits[b]; }
  out[o] = state[i];
}
`
