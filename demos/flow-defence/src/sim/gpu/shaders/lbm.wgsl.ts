// WGSL port of the CPU reference solver (sim/core/lbmRef.ts). The physics and
// indexing are line-for-line the same; all lattice constants are interpolated
// from sim/core/constants.ts so the two implementations cannot drift.

import { CONFIG } from '../../../config'
import { CELL, EX, EY, OPP, W } from '../../core/constants'

const ilist = (a: readonly number[]) => a.join(', ')
const flist = (a: readonly number[]) => a.map((v) => v.toPrecision(17)).join(', ')

export function lbmShaderSource(width: number, height: number): string {
  return /* wgsl */ `
const SIM_W : i32 = ${width};
const SIM_H : i32 = ${height};
const N : i32 = ${width * height};

// var<private> (not const): these are indexed with runtime loop counters, and
// dynamic indexing of const array *values* trips some WGSL validators.
var<private> EXA = array<i32, 9>(${ilist(EX)});
var<private> EYA = array<i32, 9>(${ilist(EY)});
var<private> EXF = array<f32, 9>(${flist(EX)});
var<private> EYF = array<f32, 9>(${flist(EY)});
var<private> WQ  = array<f32, 9>(${flist(W)});
var<private> OPPA = array<i32, 9>(${ilist(OPP)});

const INLET_CHOKE : f32 = ${CONFIG.inlet.choke};
const CELL_OPEN : u32 = ${CELL.OPEN}u;
const CELL_BEDROCK : u32 = ${CELL.BEDROCK}u;
const CELL_WALL : u32 = ${CELL.WALL}u;
const CELL_INLET : u32 = ${CELL.INLET}u;
const CELL_OUTLET : u32 = ${CELL.OUTLET}u;

struct SimParams {
  tau0 : f32,
  smag : f32,
  uClamp : f32,
  gx : f32,
  gy : f32,
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};

@group(0) @binding(0) var<storage, read> fA : array<f32>;
@group(0) @binding(1) var<storage, read_write> fB : array<f32>;
@group(0) @binding(2) var<storage, read> cellType : array<u32>;
@group(0) @binding(3) var<storage, read> solidity : array<f32>;
@group(0) @binding(4) var<storage, read> cellForce : array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> inletProfile : array<vec4<f32>>; // per row: (rho, ux, biomassRate, -)
@group(0) @binding(6) var<uniform> params : SimParams;
// Macro output for rendering/dye/erosion: (ux, uy, rho, solidity).
@group(0) @binding(7) var macroTex : texture_storage_2d<rgba16float, write>;

fn idxOf(x : i32, y : i32) -> i32 { return y * SIM_W + x; }

fn solidityAt(idx : i32) -> f32 {
  let t = cellType[idx];
  if (t == CELL_BEDROCK) { return 1.0; }
  if (t == CELL_WALL) { return solidity[idx]; }
  return 0.0;
}

fn feq(i : i32, r : f32, ux : f32, uy : f32, usq : f32) -> f32 {
  let eu = EXF[i] * ux + EYF[i] * uy;
  return WQ[i] * r * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * usq);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= SIM_W || y >= SIM_H) { return; }
  let idx = idxOf(x, y);
  let t = cellType[idx];
  let ownSolidity = solidityAt(idx);

  if (t == CELL_BEDROCK || (t == CELL_WALL && ownSolidity >= 1.0)) {
    for (var i = 0; i < 9; i++) { fB[i * N + idx] = WQ[i]; }
    textureStore(macroTex, vec2<i32>(x, y), vec4<f32>(0.0, 0.0, 1.0, 1.0));
    return;
  }

  if (t == CELL_INLET) {
    let prof = inletProfile[y];
    let r = prof.x;
    // Back-pressure choke: a pump loses flow against downstream head.
    let nIdx = idxOf(min(x + 1, SIM_W - 1), y);
    var rhoN = 0.0;
    for (var i = 0; i < 9; i++) { rhoN += fA[i * N + nIdx]; }
    let chokeFactor = clamp(1.0 - INLET_CHOKE * max(rhoN - r, 0.0), 0.0, 1.0);
    let u = prof.y * chokeFactor;
    let usq = u * u;
    for (var i = 0; i < 9; i++) { fB[i * N + idx] = feq(i, r, u, 0.0, usq); }
    textureStore(macroTex, vec2<i32>(x, y), vec4<f32>(u, 0.0, r, 0.0));
    return;
  }

  if (t == CELL_OUTLET) {
    // Pressure outlet: anchor rho = 1, velocity extrapolated from upstream.
    let up = idxOf(max(0, x - 1), y);
    var r = 0.0;
    var mx = 0.0;
    var my = 0.0;
    for (var i = 0; i < 9; i++) {
      let v = fA[i * N + up];
      r += v;
      mx += EXF[i] * v;
      my += EYF[i] * v;
    }
    let vx = mx / r;
    let vy = my / r;
    let usq = vx * vx + vy * vy;
    for (var i = 0; i < 9; i++) { fB[i * N + idx] = feq(i, 1.0, vx, vy, usq); }
    textureStore(macroTex, vec2<i32>(x, y), vec4<f32>(vx, vy, 1.0, 0.0));
    return;
  }

  // --- Pull streaming with partial bounce-back -------------------------------
  var fIn : array<f32, 9>;
  for (var i = 0; i < 9; i++) {
    let sx = x - EXA[i];
    let sy = y - EYA[i];
    var streamed : f32;
    if (sx < 0 || sx >= SIM_W || sy < 0 || sy >= SIM_H) {
      streamed = fA[OPPA[i] * N + idx];
    } else {
      let sIdx = idxOf(sx, sy);
      let s = solidityAt(sIdx);
      if (s <= 0.0) {
        streamed = fA[i * N + sIdx];
      } else if (s >= 1.0) {
        streamed = fA[OPPA[i] * N + idx];
      } else {
        streamed = (1.0 - s) * fA[i * N + sIdx] + s * fA[OPPA[i] * N + idx];
      }
    }
    fIn[i] = streamed;
  }

  // --- Macroscopics (Guo half-force shift) -----------------------------------
  var r = 0.0;
  var mx = 0.0;
  var my = 0.0;
  for (var i = 0; i < 9; i++) {
    r += fIn[i];
    mx += EXF[i] * fIn[i];
    my += EYF[i] * fIn[i];
  }
  let force = vec2<f32>(params.gx, params.gy) + cellForce[idx];
  var vx = (mx + 0.5 * force.x) / r;
  var vy = (my + 0.5 * force.y) / r;

  let speed2 = vx * vx + vy * vy;
  let clamp2 = params.uClamp * params.uClamp;
  if (speed2 > clamp2) {
    let scale = params.uClamp / sqrt(speed2);
    vx *= scale;
    vy *= scale;
  }

  // --- Collision: BGK + Smagorinsky + Guo forcing ----------------------------
  let usq = vx * vx + vy * vy;
  var feqArr : array<f32, 9>;
  for (var i = 0; i < 9; i++) { feqArr[i] = feq(i, r, vx, vy, usq); }

  var tau = params.tau0;
  if (params.smag > 0.0) {
    var pxx = 0.0;
    var pyy = 0.0;
    var pxy = 0.0;
    for (var i = 0; i < 9; i++) {
      let fneq = fIn[i] - feqArr[i];
      pxx += EXF[i] * EXF[i] * fneq;
      pyy += EYF[i] * EYF[i] * fneq;
      pxy += EXF[i] * EYF[i] * fneq;
    }
    let piNorm = sqrt(2.0 * (pxx * pxx + pyy * pyy + 2.0 * pxy * pxy));
    tau = 0.5 * (params.tau0 + sqrt(params.tau0 * params.tau0 + 18.0 * params.smag * params.smag * piNorm / r));
  }

  let omega = 1.0 / tau;
  let forcePrefactor = 1.0 - 0.5 * omega;
  for (var i = 0; i < 9; i++) {
    let eu = EXF[i] * vx + EYF[i] * vy;
    let guo = forcePrefactor * WQ[i] *
      (3.0 * ((EXF[i] - vx) * force.x + (EYF[i] - vy) * force.y) +
       9.0 * eu * (EXF[i] * force.x + EYF[i] * force.y));
    fB[i * N + idx] = fIn[i] - omega * (fIn[i] - feqArr[i]) + guo;
  }

  textureStore(macroTex, vec2<i32>(x, y), vec4<f32>(vx, vy, r, ownSolidity));
}
`
}
