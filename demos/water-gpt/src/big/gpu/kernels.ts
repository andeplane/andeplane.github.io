import { WGSL_RNG } from '../rng.ts'

/**
 * WGSL for the hydraulic machine. Every op of the forward pass gets one uniform slot
 * (struct P) so a whole token is encoded into a single command buffer.
 * The physics is the same as crossbar.ts / attention.ts (see the comments there); the
 * GPU uses f32 where the CPU reference uses f64.
 */
export const UNIFORM_SLOT = 256

export const WGSL_COMMON = /* wgsl */ `
struct P {
  codeOff: u32, scaleOff: u32, gsumOff: u32, rows: u32,
  cols: u32, tilesR: u32, tilesC: u32, gridId: u32,
  seed: u32, levels: u32, inLevels: u32, physSeed: u32,
  progNoise: f32, readNoise: f32, rho: f32, flags: u32,
  biasOff: u32, actOff: u32, pos: u32, token: u32,
  layer: u32, j0: u32, nHead: u32, hd: u32,
  d: u32, attnScale: f32, kvOff: u32, vsOff: u32,
  lnG: u32, lnB: u32, eps: f32, wpeOff: u32,
};
@group(0) @binding(0) var<uniform> p: P;
${WGSL_RNG}

// Valve code (-127..127) -> signed conductance (units of a full-open valve).
fn valveG(q: i32, gridId: u32, r: u32, c: u32) -> f32 {
  if (q == 0) { return 0.0; }
  let L = f32(p.levels);
  var g = floor(f32(abs(q)) * L / 127.0 + 0.5) / L;
  if (g == 0.0) { return 0.0; }
  if (p.progNoise > 0.0) {
    let u = uniform3(p.physSeed ^ 0x51ed27u, gridId * 8191u + r, c);
    g = max(g * (1.0 + p.progNoise * 1.7320508075688772 * (2.0 * u - 1.0)), 0.0);
  }
  return select(-g, g, q > 0);
}

fn gaugeLevel(h: f32) -> f32 {
  if (p.inLevels == 0u) { return h; }
  let L = f32(p.inLevels);
  return floor(h * L + 0.5) / L;
}

fn byteCode(w: u32, byteInWord: u32) -> i32 {
  return i32(w << (24u - 8u * byteInWord)) >> 24u;
}
`

/** Reservoir gauge: per 64-row tile, heads = level(x / absmax). */
export const WGSL_GAUGE = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> heads: array<f32>;
@group(0) @binding(3) var<storage, read_write> gscale: array<f32>;
@group(0) @binding(4) var<storage, read_write> act: array<f32>;
var<workgroup> red: array<f32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let tr = wg.x;
  let r = tr * 64u + lid.x;
  var v = 0.0;
  if (r < p.rows) { v = src[r]; }
  red[lid.x] = abs(v);
  workgroupBarrier();
  for (var s = 32u; s > 0u; s = s >> 1u) {
    if (lid.x < s) { red[lid.x] = max(red[lid.x], red[lid.x + s]); }
    workgroupBarrier();
  }
  let sx = red[0];
  if (r < p.rows) {
    var h = 0.0;
    if (sx > 0.0) { h = gaugeLevel(v / sx); }
    heads[r] = h;
    act[p.actOff + r] = h;
  }
  if (lid.x == 0u) { gscale[tr] = sx; }
}
`

/** The crossbar tile: one thread per output column, flowing down 64 rows. */
export const WGSL_TILES = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> codes: array<u32>;
@group(0) @binding(2) var<storage, read> scales: array<f32>;
@group(0) @binding(3) var<storage, read> gsum: array<f32>;
@group(0) @binding(4) var<storage, read> heads: array<f32>;
@group(0) @binding(5) var<storage, read> gscale: array<f32>;
@group(0) @binding(6) var<storage, read_write> partial: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let tc = wg.x;
  let tr = wg.y;
  let cc = lid.x;
  let c = tc * 64u + cc;
  if (c >= p.cols) { return; }
  let sx = gscale[tr];
  let outIdx = tr * p.cols + c;
  if (sx == 0.0) { partial[outIdx] = 0.0; return; }
  let n = min(64u, p.cols - tc * 64u);
  let nv = f32(2u * n);
  let rows = min(64u, p.rows - tr * 64u);
  let tileWord = p.codeOff + (tr * p.tilesC + tc) * 1024u;
  let rho = p.rho;
  var Tp = 0.0; var Tm = 0.0; var Gp = 0.0; var Gm = 0.0; var Ap = 0.0; var Am = 0.0;
  var S = 0.0; var Fa = 0.0;
  for (var rr = 0u; rr < rows; rr = rr + 1u) {
    let q = byteCode(codes[tileWord + rr * 16u + (cc >> 2u)], cc & 3u);
    if (q == 0) { continue; }
    let r = tr * 64u + rr;
    let h = heads[r];
    let g = valveG(q, p.gridId, r, c);
    if (rho == 0.0) {
      let f = h * g;
      S = S + f;
      Fa = Fa + abs(f);
    } else {
      let drop = rho * gsum[p.gsumOff + r * p.tilesC + tc];
      if (g > 0.0) {
        let pp = f32(2u * cc);
        let k = pp + 1.0 - pp * (pp + 1.0) / (2.0 * nv);
        let f = g * h * (1.0 - drop * k);
        Tp = Tp + f; Gp = Gp + g; Ap = Ap + Tp * Gp; Fa = Fa + abs(f);
      } else if (g < 0.0) {
        let gm = -g;
        let pp = f32(2u * cc + 1u);
        let k = pp + 1.0 - pp * (pp + 1.0) / (2.0 * nv);
        let f = gm * h * (1.0 - drop * k);
        Tm = Tm + f; Gm = Gm + gm; Am = Am + Tm * Gm; Fa = Fa + abs(f);
      }
    }
  }
  var F = S;
  if (rho != 0.0) { F = Tp - rho * Ap - (Tm - rho * Am); }
  if (p.readNoise > 0.0 && Fa > 0.0) { F = F + p.readNoise * Fa * gauss3(p.seed, tr, c); }
  partial[outIdx] = sx * scales[p.scaleOff + tr * p.cols + c] * F;
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

/** Per-(row, tile) conductance sums for the supply-manifold IR drop. */
export const WGSL_GSUM = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> codes: array<u32>;
@group(0) @binding(2) var<storage, read_write> gsum: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let tc = wg.x;
  let tr = wg.y;
  let rr = lid.x;
  let r = tr * 64u + rr;
  let tileWord = p.codeOff + (tr * p.tilesC + tc) * 1024u;
  var s = 0.0;
  if (r < p.rows) {
    for (var cc = 0u; cc < 64u; cc = cc + 1u) {
      let c = tc * 64u + cc;
      if (c >= p.cols) { break; }
      let q = byteCode(codes[tileWord + rr * 16u + (cc >> 2u)], cc & 3u);
      s = s + abs(valveG(q, p.gridId, r, c));
    }
  }
  gsum[p.gsumOff + r * p.tilesC + tc] = s;
}
`

/** Embedding: the token's LM-head column read backwards, plus the position table. */
export const WGSL_EMBED = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> codes: array<u32>;
@group(0) @binding(2) var<storage, read> scales: array<f32>;
@group(0) @binding(3) var<storage, read> vecs: array<f32>;
@group(0) @binding(4) var<storage, read_write> x: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let r = gid.x;
  if (r >= p.rows) { return; }
  let c = p.token;
  let tr = r / 64u;
  let tc = c / 64u;
  let word = p.codeOff + (tr * p.tilesC + tc) * 1024u + (r % 64u) * 16u + ((c % 64u) >> 2u);
  let q = byteCode(codes[word], c & 3u);
  let w = valveG(q, p.gridId, r, c) * scales[p.scaleOff + tr * p.cols + c];
  x[r] = w + vecs[p.wpeOff + p.pos * p.rows + r];
}
`

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

/** Shared helpers for the attention kernels (64-thread workgroup per head). */
const WGSL_ATTN_COMMON = /* wgsl */ `
${WGSL_COMMON}
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read_write> kbank: array<f32>;
@group(0) @binding(3) var<storage, read_write> vgbank: array<f32>;
@group(0) @binding(4) var<storage, read_write> vsbank: array<f32>;
var<workgroup> red: array<f32, 64>;
fn wmax(v: f32, i: u32) -> f32 {
  red[i] = v;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s = s >> 1u) {
    if (i < s) { red[i] = max(red[i], red[i + s]); }
    workgroupBarrier();
  }
  let r = red[0];
  workgroupBarrier();
  return r;
}
fn wsum(v: f32, i: u32) -> f32 {
  red[i] = v;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s = s >> 1u) {
    if (i < s) { red[i] = red[i] + red[i + s]; }
    workgroupBarrier();
  }
  let r = red[0];
  workgroupBarrier();
  return r;
}
`

/** Program this token's key column and value row valves (the KV cache). */
export const WGSL_KVWRITE = /* wgsl */ `
${WGSL_ATTN_COMMON}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let h = wg.x;
  let t = lid.x;
  let hd = p.hd;
  let d = p.d;
  let col = h * hd + t;
  for (var which = 0u; which < 2u; which = which + 1u) {
    var v = 0.0;
    if (t < hd) { v = qkv[(1u + which) * d + col]; }
    let m = wmax(abs(v), t);
    if (t < hd) {
      var g = 0.0;
      if (m > 0.0) {
        let q = i32(floor(v / m * 127.0 + 0.5));
        g = valveG(q, 0x4000u + p.layer * 2u + which, p.pos, col);
      }
      let idx = p.kvOff + p.pos * d + col;
      if (which == 0u) { kbank[idx] = g; } else { vgbank[idx] = g; }
    }
    if (t == 0u) { vsbank[p.vsOff + (p.pos * 2u + which) * p.nHead + h] = m; }
  }
}
`

export const WGSL_ATTEND = /* wgsl */ `
${WGSL_ATTN_COMMON}
@group(0) @binding(5) var<storage, read_write> att: array<f32>;
const MAXCTX: u32 = 2048u;
var<workgroup> sc: array<f32, 2048>;
var<workgroup> qs: array<f32, 64>;
var<workgroup> bsc: array<f32, 32>;
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let h = wg.x;
  let t = lid.x;
  let hd = p.hd;
  let d = p.d;
  let j0 = p.j0;
  let n = p.pos - j0 + 1u;
  // query -> reservoir heads on head_dim rows
  var qv = 0.0;
  if (t < hd) { qv = qkv[h * hd + t]; }
  let sq = wmax(abs(qv), t);
  var qh = 0.0;
  if (sq > 0.0) { qh = gaugeLevel(qv / sq); }
  qs[t] = qh;
  workgroupBarrier();
  // scores: one collector per cached key
  var lmax = -3.0e38;
  for (var j = t; j < n; j = j + 64u) {
    let kb = p.kvOff + (j0 + j) * d + h * hd;
    var s = 0.0;
    var fa = 0.0;
    for (var i = 0u; i < hd; i = i + 1u) {
      let f = qs[i] * kbank[kb + i];
      s = s + f;
      fa = fa + abs(f);
    }
    if (p.readNoise > 0.0) { s = s + p.readNoise * fa * gauss3(p.seed, h, j0 + j); }
    s = s * sq * p.attnScale * vsbank[p.vsOff + ((j0 + j) * 2u) * p.nHead + h];
    sc[j] = s;
    lmax = max(lmax, s);
  }
  let mx = wmax(lmax, t);
  // softmax (digital)
  var lsum = 0.0;
  for (var j = t; j < n; j = j + 64u) {
    let e = exp(sc[j] - mx);
    sc[j] = e;
    lsum = lsum + e;
  }
  let z = wsum(lsum, t);
  for (var j = t; j < n; j = j + 64u) {
    sc[j] = sc[j] / z * vsbank[p.vsOff + ((j0 + j) * 2u + 1u) * p.nHead + h];
  }
  workgroupBarrier();
  // probabilities x value gauges -> reservoir heads, one gauge per 64-row tile
  let nb = (n + 63u) / 64u;
  for (var b = 0u; b < nb; b = b + 1u) {
    let j = b * 64u + t;
    var v = 0.0;
    if (j < n) { v = sc[j]; }
    let m = wmax(abs(v), t);
    if (t == 0u) { bsc[b] = m; }
    if (j < n) {
      var hh = 0.0;
      if (m > 0.0) { hh = gaugeLevel(v / m); }
      sc[j] = hh;
    }
  }
  workgroupBarrier();
  if (t < hd) {
    var total = 0.0;
    for (var b = 0u; b < nb; b = b + 1u) {
      var s = 0.0;
      var fa = 0.0;
      let jEnd = min(n, b * 64u + 64u);
      for (var j = b * 64u; j < jEnd; j = j + 1u) {
        let f = sc[j] * vgbank[p.kvOff + (j0 + j) * d + h * hd + t];
        s = s + f;
        fa = fa + abs(f);
      }
      if (p.readNoise > 0.0) { s = s + p.readNoise * fa * gauss3(p.seed ^ 0x5bd1e995u, h * 64u + b, t); }
      total = total + s * bsc[b];
    }
    att[h * hd + t] = total;
  }
}
`
