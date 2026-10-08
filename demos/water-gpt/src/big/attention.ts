import { CODE_MAX, gaugeHeads, valveConductance, type Physics } from './crossbar.ts'
import { gauss3 } from './rng.ts'

/**
 * Attention through activation-programmed crossbars.
 *
 * The KV cache is a bank of valves: when token t is processed, its key and value
 * vectors are *programmed* into a new column (keys) / row (values) of each head's
 * crossbar, with the same valve resolution and manufacturing error as the weights.
 *  - Scores: the query becomes reservoir heads on head_dim rows; each cached key is a
 *    collector column whose gauge is that key's own absmax, so score_j = q·k_j.
 *  - Mix: the softmax probabilities (digital) set the heads of the value rows; each
 *    value row's gauge is folded into its reservoir level (head = p_j · s_j), and the
 *    head_dim collectors read out Σ_j p_j v_j.
 * Supply/collector IR drop is not modelled for these small crossbars; meter noise is.
 * Softmax, the causal / local-window mask and the 1/√d scale are digital.
 */

export const KV_GRID_BASE = 0x4000

export interface KvBank {
  /** Key and value valve conductances (signed, normalised), [pos][d]. */
  kg: Float32Array
  vg: Float32Array
  /** Gauges per (pos, key|value, head): layout [pos][2][nHead]. */
  gauge: Float32Array
}

export function newKvBank(nCtx: number, d: number, nHead: number): KvBank {
  return { kg: new Float32Array(nCtx * d), vg: new Float32Array(nCtx * d), gauge: new Float32Array(nCtx * 2 * nHead) }
}

/** Program the valves for position `pos` from the fused qkv vector. */
export function programKv(bank: KvBank, qkv: Float32Array, pos: number, d: number, nHead: number, layer: number, p: Physics): void {
  const hd = d / nHead
  for (let h = 0; h < nHead; h++) {
    for (const which of [0, 1]) {
      const src = (1 + which) * d + h * hd
      let m = 0
      for (let i = 0; i < hd; i++) m = Math.max(m, Math.abs(qkv[src + i]))
      const gridId = KV_GRID_BASE + layer * 2 + which
      for (let i = 0; i < hd; i++) {
        const v = qkv[src + i]
        const col = h * hd + i
        let g: number
        if (p.ideal) g = m > 0 ? v / m : 0
        else g = m > 0 ? valveConductance(Math.round((v / m) * CODE_MAX), p, gridId, pos, col) : 0
        ;(which === 0 ? bank.kg : bank.vg)[pos * d + col] = g
      }
      bank.gauge[(pos * 2 + which) * nHead + h] = m
    }
  }
}

let probs = new Float64Array(2048)
let heads = new Float64Array(2048)
const qx = new Float32Array(256)
const qh = new Float64Array(256)
let px = new Float32Array(2048)
const sps = new Float64Array(64)

/** Attention for the newest position `pos` of one layer (all heads). */
export function attend(
  bank: KvBank,
  qkv: Float32Array,
  pos: number,
  d: number,
  nHead: number,
  scale: number,
  window: number | null,
  layer: number,
  p: Physics,
  seed: number,
  out: Float32Array,
): void {
  const hd = d / nHead
  const j0 = window ? Math.max(0, pos - window + 1) : 0
  const n = pos - j0 + 1
  if (probs.length < n) {
    probs = new Float64Array(n * 2)
    heads = new Float64Array(n * 2)
    px = new Float32Array(n * 2)
  }
  for (let h = 0; h < nHead; h++) {
    // --- scores: query heads on head_dim rows, one collector per cached key
    for (let i = 0; i < hd; i++) qx[i] = qkv[h * hd + i]
    let sq = 1
    if (p.ideal) for (let i = 0; i < hd; i++) qh[i] = qx[i]
    else sq = gaugeHeads(qx, hd, p.inBits, qh)
    let mx = -Infinity
    for (let j = 0; j < n; j++) {
      const kb = (j0 + j) * d + h * hd
      let s = 0
      let fa = 0
      for (let i = 0; i < hd; i++) {
        const f = qh[i] * bank.kg[kb + i]
        s += f
        fa += Math.abs(f)
      }
      if (!p.ideal && p.readNoise > 0) s += p.readNoise * fa * gauss3(seed, h, j0 + j)
      s *= sq * scale * bank.gauge[((j0 + j) * 2) * nHead + h]
      probs[j] = s
      if (s > mx) mx = s
    }
    // --- softmax (digital)
    let z = 0
    for (let j = 0; j < n; j++) {
      const e = Math.exp(probs[j] - mx)
      probs[j] = e
      z += e
    }
    for (let j = 0; j < n; j++) probs[j] /= z
    // --- mix: probabilities × value gauges are the reservoir heads of the value rows
    // Value rows come in 64-row tiles, each with its own reservoir gauge.
    const nb = Math.ceil(n / 64)
    if (p.ideal) {
      for (let j = 0; j < n; j++) heads[j] = probs[j] * bank.gauge[((j0 + j) * 2 + 1) * nHead + h]
      for (let b = 0; b < nb; b++) sps[b] = 1
    } else {
      for (let j = 0; j < n; j++) px[j] = probs[j] * bank.gauge[((j0 + j) * 2 + 1) * nHead + h]
      for (let b = 0; b < nb; b++) sps[b] = gaugeHeads(px, Math.min(64, n - b * 64), p.inBits, heads, b * 64)
    }
    for (let i = 0; i < hd; i++) {
      let total = 0
      for (let b = 0; b < nb; b++) {
        let s = 0
        let fa = 0
        const jEnd = Math.min(n, b * 64 + 64)
        for (let j = b * 64; j < jEnd; j++) {
          const f = heads[j] * bank.vg[(j0 + j) * d + h * hd + i]
          s += f
          fa += Math.abs(f)
        }
        if (!p.ideal && p.readNoise > 0) s += p.readNoise * fa * gauss3(seed ^ 0x5bd1e995, h * 64 + b, i)
        total += s * sps[b]
      }
      out[h * hd + i] = total
    }
  }
  void layer
}
