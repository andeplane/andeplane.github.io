import { WGSL_RNG } from '../../crossbar/rng.ts'

/**
 * WGSL for the hydraulic machine. The physics is exactly src/crossbar/lattice.ts (which is
 * CpuCrossbar with hashed valve errors and first-order manifolds): per 64 × 64 tile, valve
 * openings quantised against the tile's w_max, x⁺/x⁻ reservoirs and +/− collector pairs,
 * a fixed Gaussian error on every valve (recomputed from a hash, never stored), the
 * first-order manifold loss λ·g⁰·(A + B), and per-collector calibration gains.
 *
 * Every op of the forward pass gets one uniform slot (struct P) so a token is encoded into a
 * single command buffer. The GPU uses f32 where the CPU uses f64, and keeps λ·A in f16.
 */
export const UNIFORM_SLOT = 256
export const UNIFORM_BYTES = 160

export const WGSL_COMMON = /* wgsl */ `
struct P {
  valOff: u32, tileOff: u32, rows: u32, cols: u32,
  tilesR: u32, tilesC: u32, gridId: u32, base: u32,
  levels: u32, noise: f32, lambda: f32, flags: u32,
  biasOff: u32, actOff: u32, pos: u32, token: u32,
  layer: u32, j0: u32, nHead: u32, hd: u32,
  d: u32, attnScale: f32, kvOff: u32, nKeys: u32,
  lnG: u32, lnB: u32, eps: f32, ctx: u32,
  srcOff: u32, nbMax: u32, wpeValOff: u32, wpeTileOff: u32,
  wpeTilesC: u32, wpeBase: u32, wpeRows: u32, signed: u32,
  pad0: u32, pad1: u32, pad2: u32, pad3: u32,
};
@group(0) @binding(0) var<uniform> p: P;
${WGSL_RNG}
`

/**
 * The lattice tile machinery, parameterised by how a weight is read (WV) — from the
 * half-float weight store or from the key/value cache.
 */
function latticeCore(wv: string): string {
  return /* wgsl */ `
var<workgroup> xs: array<f32, 64>;
var<workgroup> corrA: array<u32, 2048>;
var<workgroup> gainS: array<f32, 128>;
var<workgroup> red: array<f32, 64>;
var<private> tBase: u32;
var<private> tK: u32;
var<private> tN: u32;
var<private> tW: f32;
var<private> tSeed: u32;
var<private> tSigned: bool;
var<private> tAux: u32;

fn WV(i: u32, j: u32) -> f32 { ${wv} }

fn opening(w: f32) -> f32 {
  let a = abs(w) / tW;
  if (p.levels == 0u) { return a; }
  let L = f32(p.levels);
  return floor(a * L + 0.5) / L;
}
fn negOf(w: f32) -> u32 { return select(0u, 1u, w < 0.0); }

fn wgMax(v: f32, t: u32) -> f32 {
  red[t] = v;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s = s >> 1u) {
    if (t < s) { red[t] = max(red[t], red[t + s]); }
    workgroupBarrier();
  }
  let r = red[0];
  workgroupBarrier();
  return r;
}

// λ·A at the open valve of physical row (i, flip f) for every logical column, into corrA.
fn rowPass(i: u32, f: u32) {
  var tot = 0.0;
  for (var j = 0u; j < tN; j = j + 1u) { tot = tot + opening(WV(i, j)); }
  var P_ = 0.0;
  var N_ = 0.0;
  var prev = 0.0;
  for (var j = 0u; j < tN; j = j + 1u) {
    let w = WV(i, j);
    let o = opening(w);
    let c = f32(2u * j + (negOf(w) ^ f));
    P_ = P_ + o * (c + 1.0);
    N_ = N_ + o;
    let A = p.lambda * (P_ + (c + 1.0) * (tot - N_));
    if ((j & 1u) == 1u) { corrA[i * 32u + (j >> 1u)] = pack2x16float(vec2f(prev, A)); } else { prev = A; }
  }
  if ((tN & 1u) == 1u) { corrA[i * 32u + (tN >> 1u)] = pack2x16float(vec2f(prev, 0.0)); }
}
fn lamA(i: u32, j: u32) -> f32 {
  let v = unpack2x16float(corrA[i * 32u + (j >> 1u)]);
  return select(v.x, v.y, (j & 1u) == 1u);
}

// Walk down logical column j. calib: every reservoir of flip f at head 1, returns
// (ideal⁺, ideal⁻, actual⁺, actual⁻) sums; else the readout Σ |x|·(gain⁺g⁺ − gain⁻g⁻) in .x.
fn colWalk(j: u32, f: u32, calib: bool) -> vec4f {
  let R = select(tK, 2u * tK, tSigned);
  let Rf = f32(R);
  var wT = vec2f(0.0);
  if (p.lambda > 0.0) {
    for (var i = 0u; i < tK; i = i + 1u) {
      let w = WV(i, j);
      let o = opening(w);
      let ng = negOf(w);
      if (tSigned) {
        wT = wT + o * vec2f(Rf - f32(2u * i + ng), Rf - f32(2u * i + (1u ^ ng)));
      } else if (ng == 0u) {
        wT.x = wT.x + o * (Rf - f32(i));
      } else {
        wT.y = wT.y + o * (Rf - f32(i));
      }
    }
  }
  var G = vec2f(0.0);
  var W = vec2f(0.0);
  var out = vec4f(0.0);
  for (var i = 0u; i < tK; i = i + 1u) {
    let w = WV(i, j);
    let o = opening(w);
    let ng = negOf(w);
    if (tSigned) {
      G = G + vec2f(o);
      W = W + o * vec2f(Rf - f32(2u * i + ng), Rf - f32(2u * i + (1u ^ ng)));
    } else if (ng == 0u) {
      G.x = G.x + o;
      W.x = W.x + o * (Rf - f32(i));
    } else {
      G.y = G.y + o;
      W.y = W.y + o * (Rf - f32(i));
    }
    var h = 1.0;
    var fl = f;
    if (!calib) {
      let xv = xs[i];
      if (tSigned) {
        if (xv == 0.0) { continue; }
        fl = select(0u, 1u, xv < 0.0);
        h = abs(xv);
      } else {
        if (xv <= 0.0) { continue; }
        fl = 0u;
        h = xv;
      }
    }
    let ra = select(i, 2u * i + fl, tSigned);
    let po = ng ^ fl;
    var corr = 0.0;
    if (p.lambda > 0.0 && o > 0.0) {
      let B = (Rf - f32(ra)) * select(G.x, G.y, po == 1u) + (select(wT.x, wT.y, po == 1u) - select(W.x, W.y, po == 1u));
      corr = o * (lamA(i, j) + p.lambda * B);
    }
    var ge = vec2f(0.0);
    var g0v = vec2f(0.0);
    for (var pp = 0u; pp < 2u; pp = pp + 1u) {
      let g0 = select(0.0, o, pp == po);
      var g = g0;
      if (p.noise > 0.0) { g = max(0.0, g0 + p.noise * gauss3(tSeed, ra, 2u * j + pp)); }
      ge[pp] = g - select(0.0, corr, pp == po);
      g0v[pp] = g0;
    }
    if (calib) {
      out = out + vec4f(g0v, ge);
    } else {
      out.x = out.x + h * (gainS[2u * j] * ge.x - gainS[2u * j + 1u] * ge.y);
    }
  }
  return out;
}

fn gainOf(ideal: f32, actual: f32) -> f32 {
  return select(1.0, ideal / actual, ideal > 1e-9 && actual > 1e-9);
}

// Calibrate the current tile into gainS (all threads must call it; nf = 2 for signed tiles).
fn calibrate(t: u32, nf: u32) {
  var acc = vec4f(0.0);
  for (var f = 0u; f < nf; f = f + 1u) {
    workgroupBarrier();
    if (t < tK && p.lambda > 0.0) { rowPass(t, f); }
    workgroupBarrier();
    if (t < tN) { acc = acc + colWalk(t, f, true); }
  }
  gainS[2u * t] = gainOf(acc.x, acc.z);
  gainS[2u * t + 1u] = gainOf(acc.y, acc.w);
  workgroupBarrier();
}

// Readout of the current tile for heads xs (all threads must call it); returns w_max·Σ for column t.
fn matvec(t: u32) -> f32 {
  workgroupBarrier();
  if (t < tK && p.lambda > 0.0) {
    let xv = xs[t];
    if (tSigned && xv != 0.0) { rowPass(t, select(0u, 1u, xv < 0.0)); }
    if (!tSigned && xv > 0.0) { rowPass(t, 0u); }
  }
  workgroupBarrier();
  var r = 0.0;
  if (t < tN) { r = tW * colWalk(t, 0u, false).x; }
  return r;
}
`
}

const HALF_WV = /* wgsl */ `
  let e = i * 64u + j;
  let v = unpack2x16float(vals[tBase + (e >> 1u)]);
  return select(v.x, v.y, (e & 1u) == 1u);
`

/** Weight tiles: y_partial = this tile's share of x · W. Workgroup per tile (tc, tr). */
export const WGSL_TILES = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> vals: array<u32>;
@group(0) @binding(2) var<storage, read> wmaxB: array<f32>;
@group(0) @binding(3) var<storage, read> gains: array<f32>;
@group(0) @binding(4) var<storage, read> src: array<f32>;
@group(0) @binding(5) var<storage, read_write> partial: array<f32>;
@group(0) @binding(6) var<storage, read_write> act: array<f32>;
${latticeCore(HALF_WV)}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let tc = wg.x;
  let tr = wg.y;
  let t = lid.x;
  let tile = tr * p.tilesC + tc;
  tBase = p.valOff + tile * 2048u;
  tK = min(64u, p.rows - tr * 64u);
  tN = min(64u, p.cols - tc * 64u);
  let wm = wmaxB[p.tileOff + tile];
  tW = select(1.0, wm, wm > 0.0);
  tSeed = hash3(p.base, tr, tc);
  tSigned = p.signed != 0u;
  var xv = 0.0;
  if (t < tK) { xv = src[p.srcOff + tr * 64u + t]; }
  xs[t] = xv;
  let gb = (p.tileOff + tile) * 128u;
  gainS[2u * t] = gains[gb + 2u * t];
  gainS[2u * t + 1u] = gains[gb + 2u * t + 1u];
  if (tc == 0u) {
    // the reservoir heads this tile row sees, for the exhibit
    let m = wgMax(abs(xv), t);
    if (t < tK) { act[p.actOff + tr * 64u + t] = select(0.0, xv / m, m > 0.0); }
  }
  let y = matvec(t);
  if (t < tN) { partial[tr * p.cols + tc * 64u + t] = y; }
}
`

/** Commissioning: calibrate every weight tile of one crossbar (per-collector gains). */
export const WGSL_CALIB = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> vals: array<u32>;
@group(0) @binding(2) var<storage, read> wmaxB: array<f32>;
@group(0) @binding(3) var<storage, read_write> gains: array<f32>;
${latticeCore(HALF_WV)}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let tc = wg.x;
  let tr = wg.y;
  let t = lid.x;
  let tile = tr * p.tilesC + tc;
  tBase = p.valOff + tile * 2048u;
  tK = min(64u, p.rows - tr * 64u);
  tN = min(64u, p.cols - tc * 64u);
  let wm = wmaxB[p.tileOff + tile];
  tW = select(1.0, wm, wm > 0.0);
  tSeed = hash3(p.base, tr, tc);
  tSigned = p.signed != 0u;
  calibrate(t, select(1u, 2u, p.signed != 0u));
  let gb = (p.tileOff + tile) * 128u;
  gains[gb + 2u * t] = gainS[2u * t];
  gains[gb + 2u * t + 1u] = gainS[2u * t + 1u];
}
`

/** Sum the row tiles' collectors, then the digital epilogue (bias, GELU, residual). */
export const WGSL_REDUCE = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> partial: array<f32>;
@group(0) @binding(2) var<storage, read> vecs: array<f32>;
@group(0) @binding(3) var<storage, read_write> dst: array<f32>;
@group(0) @binding(4) var<storage, read_write> act: array<f32>;

fn geluNew(x: f32) -> f32 {
  let u = clamp(0.7978845608028654 * (x + 0.044715 * x * x * x), -15.0, 15.0);
  return 0.5 * x * (1.0 + tanh(u));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= p.cols) { return; }
  var y = 0.0;
  for (var tr = 0u; tr < p.tilesR; tr = tr + 1u) { y = y + partial[tr * p.cols + c]; }
  act[p.actOff + p.rows + c] = y;
  if ((p.flags & 4u) != 0u) { y = y + vecs[p.biasOff + c]; }
  if ((p.flags & 1u) != 0u) { y = geluNew(y); }
  if ((p.flags & 2u) != 0u) { dst[c] = dst[c] + y; } else { dst[c] = y; }
}
`

/** Per-crossbar outflow magnitude for the renderer (normalises the glowing streams). */
export const WGSL_ACTSTAT = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> act: array<f32>;
@group(0) @binding(2) var<storage, read_write> actMeta: array<f32>;
var<workgroup> red: array<f32, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  var m = 0.0;
  for (var c = lid.x; c < p.cols; c = c + 256u) { m = max(m, abs(act[p.actOff + p.rows + c])); }
  red[lid.x] = m;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (lid.x < s) { red[lid.x] = max(red[lid.x], red[lid.x + s]); }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    actMeta[p.gridId * 4u] = red[0];
    actMeta[p.gridId * 4u + 1u] = f32(p.pos);
  }
}
`

/**
 * Embedding, read from valves: the token's column of the output head driven backwards
 * plus the position's row of the position table. Each thread realises one valve pair
 * (both scans of the first-order manifold model, its errors and its gains).
 */
export const WGSL_EMBED = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> vals: array<u32>;
@group(0) @binding(2) var<storage, read> wmaxB: array<f32>;
@group(0) @binding(3) var<storage, read> gains: array<f32>;
@group(0) @binding(4) var<storage, read_write> x: array<f32>;
${halfHelpers()}
fn realised(valOff: u32, tileOff: u32, tilesC: u32, rows: u32, cols: u32, base: u32, signed: bool, r: u32, c: u32) -> f32 {
  let tr = r / 64u;
  let tc = c / 64u;
  let tile = tr * tilesC + tc;
  let vb = valOff + tile * 2048u;
  let k = min(64u, rows - tr * 64u);
  let n = min(64u, cols - tc * 64u);
  let wm = wmaxB[tileOff + tile];
  let W_ = select(1.0, wm, wm > 0.0);
  let seed = hash3(base, tr, tc);
  let i = r % 64u;
  let j = c % 64u;
  let w = hv(vb, i, j);
  let o = op(w, W_);
  let ng = select(0u, 1u, w < 0.0);
  let R = select(k, 2u * k, signed);
  let Rf = f32(R);
  let ra = select(i, 2u * i, signed);
  var corr = 0.0;
  if (p.lambda > 0.0 && o > 0.0) {
    // A along physical row ra (flip 0)
    var tot = 0.0;
    for (var m = 0u; m < n; m = m + 1u) { tot = tot + op(hv(vb, i, m), W_); }
    var P_ = 0.0;
    var N_ = 0.0;
    for (var m = 0u; m <= j; m = m + 1u) {
      let wm2 = hv(vb, i, m);
      let om = op(wm2, W_);
      P_ = P_ + om * (f32(2u * m + select(0u, 1u, wm2 < 0.0)) + 1.0);
      N_ = N_ + om;
    }
    let cj = f32(2u * j + ng);
    let A = P_ + (cj + 1.0) * (tot - N_);
    // B down physical column 2j + ng
    var wT = 0.0;
    var G = 0.0;
    var Wr = 0.0;
    for (var m = 0u; m < k; m = m + 1u) {
      let wm2 = hv(vb, m, j);
      let om = op(wm2, W_);
      let ngm = select(0u, 1u, wm2 < 0.0);
      var rm = 0u;
      var has = true;
      if (signed) { rm = 2u * m + (ng ^ ngm); } else { rm = m; has = ngm == ng; }
      if (has) {
        wT = wT + om * (Rf - f32(rm));
        if (m <= i) { G = G + om; Wr = Wr + om * (Rf - f32(rm)); }
      }
    }
    let B = (Rf - f32(ra)) * G + (wT - Wr);
    corr = p.lambda * o * (A + B);
  }
  var ge = vec2f(0.0);
  for (var pp = 0u; pp < 2u; pp = pp + 1u) {
    let g0 = select(0.0, o, pp == ng);
    var g = g0;
    if (p.noise > 0.0) { g = max(0.0, g0 + p.noise * gauss3(seed, ra, 2u * j + pp)); }
    ge[pp] = g - select(0.0, corr, pp == ng);
  }
  let gb = (tileOff + tile) * 128u;
  return W_ * (gains[gb + 2u * j] * ge.x - gains[gb + 2u * j + 1u] * ge.y);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let r = gid.x;
  if (r >= p.d) { return; }
  let tok = realised(p.valOff, p.tileOff, p.tilesC, p.rows, p.cols, p.base, true, r, p.token);
  let pe = realised(p.wpeValOff, p.wpeTileOff, p.wpeTilesC, p.wpeRows, p.d, p.wpeBase, false, p.pos, r);
  x[r] = tok + pe;
}
`

function halfHelpers(): string {
  return /* wgsl */ `
fn hv(vb: u32, i: u32, j: u32) -> f32 {
  let e = i * 64u + j;
  let v = unpack2x16float(vals[vb + (e >> 1u)]);
  return select(v.x, v.y, (e & 1u) == 1u);
}
fn op(w: f32, wmax: f32) -> f32 {
  let a = abs(w) / wmax;
  if (p.levels == 0u) { return a; }
  let L = f32(p.levels);
  return floor(a * L + 0.5) / L;
}
`
}

export const WGSL_LAYERNORM = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> vecs: array<f32>;
@group(0) @binding(3) var<storage, read_write> a: array<f32>;
var<workgroup> red: array<f32, 256>;
fn wsum(v: f32, i: u32) -> f32 {
  red[i] = v;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (i < s) { red[i] = red[i] + red[i + s]; }
    workgroupBarrier();
  }
  let r = red[0];
  workgroupBarrier();
  return r;
}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let n = p.d;
  var s = 0.0;
  for (var i = lid.x; i < n; i = i + 256u) { s = s + x[i]; }
  let mean = wsum(s, lid.x) / f32(n);
  var v = 0.0;
  for (var i = lid.x; i < n; i = i + 256u) { let t = x[i] - mean; v = v + t * t; }
  let inv = 1.0 / sqrt(wsum(v, lid.x) / f32(n) + p.eps);
  for (var i = lid.x; i < n; i = i + 256u) {
    a[i] = (x[i] - mean) * inv * vecs[p.lnG + i] + vecs[p.lnB + i];
  }
}
`

/** Cache this token's key and value (they set the valves of the attention crossbars). */
export const WGSL_KVWRITE = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read_write> kv: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= p.d) { return; }
  kv[p.kvOff + p.pos * p.d + c] = qkv[p.d + c];
  kv[p.kvOff + (p.ctx + p.pos) * p.d + c] = qkv[2u * p.d + c];
}
`

// Key / value cache layout per layer: [keys: ctx × d][values: ctx × d], at kvOff.
const KEY_WV = /* wgsl */ `
  // tile rows = head dims, columns = cached positions
  return kv[p.kvOff + (p.j0 + tAux * 64u + j) * p.d + tBase + i];
`
const VALUE_WV = /* wgsl */ `
  // tile rows = cached positions, columns = head dims
  return kv[p.kvOff + (p.ctx + p.j0 + tAux * 64u + i) * p.d + tBase + j];
`

/** QKᵀ: one crossbar tile per (64 cached keys, head), set from the keys, fed with the query. */
export const WGSL_SCORES = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read> kv: array<f32>;
@group(0) @binding(3) var<storage, read> seeds: array<u32>;
@group(0) @binding(4) var<storage, read_write> scores: array<f32>;
@group(0) @binding(5) var<storage, read_write> kvmax: array<f32>;
${latticeCore(KEY_WV)}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let b = wg.x;
  let h = wg.y;
  let t = lid.x;
  tAux = b;
  tBase = h * p.hd;
  tK = p.hd;
  tN = min(64u, p.nKeys - b * 64u);
  tSigned = true;
  var m = 0.0;
  if (t < tN) { for (var i = 0u; i < tK; i = i + 1u) { m = max(m, abs(WV(i, t))); } }
  let wm = wgMax(m, t);
  tW = select(1.0, wm, wm > 0.0);
  tSeed = hash3(seeds[(p.layer * p.nHead + h) * 2u], 0u, b);
  var xv = 0.0;
  if (t < tK) { xv = qkv[h * p.hd + t]; }
  xs[t] = xv;
  calibrate(t, 2u);
  let y = matvec(t);
  if (t < tN) { scores[h * p.ctx + b * 64u + t] = y; }
  if (t == 0u) { kvmax[((p.layer * 2u) * p.nHead + h) * p.nbMax + (p.j0 + b * 64u) / 64u] = tW; }
}
`

/** Digital: scale, softmax over the cached positions (in place). Workgroup per head. */
export const WGSL_SOFTMAX = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> scores: array<f32>;
var<workgroup> red: array<f32, 64>;
fn wred(v: f32, t: u32, isMax: bool) -> f32 {
  red[t] = v;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s = s >> 1u) {
    if (t < s) { red[t] = select(red[t] + red[t + s], max(red[t], red[t + s]), isMax); }
    workgroupBarrier();
  }
  let r = red[0];
  workgroupBarrier();
  return r;
}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let h = wg.x;
  let t = lid.x;
  let base = h * p.ctx;
  var mx = -3.0e38;
  for (var j = t; j < p.nKeys; j = j + 64u) { mx = max(mx, scores[base + j] * p.attnScale); }
  let M = wred(mx, t, true);
  var z = 0.0;
  for (var j = t; j < p.nKeys; j = j + 64u) {
    let e = exp(scores[base + j] * p.attnScale - M);
    scores[base + j] = e;
    z = z + e;
  }
  let Z = wred(z, t, false);
  for (var j = t; j < p.nKeys; j = j + 64u) { scores[base + j] = scores[base + j] / Z; }
}
`

/** A·V: one crossbar tile per (64 cached values, head), set from the values, fed with the attention weights. */
export const WGSL_MIX = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> probs: array<f32>;
@group(0) @binding(2) var<storage, read> kv: array<f32>;
@group(0) @binding(3) var<storage, read> seeds: array<u32>;
@group(0) @binding(4) var<storage, read_write> mixpart: array<f32>;
@group(0) @binding(5) var<storage, read_write> kvmax: array<f32>;
${latticeCore(VALUE_WV)}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let b = wg.x;
  let h = wg.y;
  let t = lid.x;
  tAux = b;
  tBase = h * p.hd;
  tK = min(64u, p.nKeys - b * 64u);
  tN = p.hd;
  tSigned = false;
  var m = 0.0;
  if (t < tN) { for (var i = 0u; i < tK; i = i + 1u) { m = max(m, abs(WV(i, t))); } }
  let wm = wgMax(m, t);
  tW = select(1.0, wm, wm > 0.0);
  tSeed = hash3(seeds[(p.layer * p.nHead + h) * 2u + 1u], b, 0u);
  var xv = 0.0;
  if (t < tK) { xv = probs[h * p.ctx + b * 64u + t]; }
  xs[t] = xv;
  calibrate(t, 1u);
  let y = matvec(t);
  if (t < tN) { mixpart[(h * p.nbMax + b) * 64u + t] = y; }
  if (t == 0u) { kvmax[((p.layer * 2u + 1u) * p.nHead + h) * p.nbMax + (p.j0 + b * 64u) / 64u] = tW; }
}
`

/** Sum the A·V tiles of each head into the attention output. */
export const WGSL_MIXSUM = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> mixpart: array<f32>;
@group(0) @binding(2) var<storage, read_write> att: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= p.d) { return; }
  let h = c / p.hd;
  let j = c % p.hd;
  let nb = (p.nKeys + 63u) / 64u;
  var y = 0.0;
  for (var b = 0u; b < nb; b = b + 1u) { y = y + mixpart[(h * p.nbMax + b) * 64u + j]; }
  att[c] = y;
}
`
