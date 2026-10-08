import type { Backend } from '../engine/backend.ts'
import type { Sequence } from '../modes/types.ts'
import { geluNew, type ModelConfig } from './model.ts'

/**
 * GPT-2 / GPT-Neo forward pass, one token at a time, with every product sent through a
 * `Backend` (exact digital, or water): the same contract calc-gpt's forward pass follows.
 *
 *  - token embedding: the token's column of the (tied) output head, read backwards;
 *  - position embedding: the position's row of the position-table crossbar;
 *  - Q·K·V, attention out, MLP up and down, the output head: weight crossbars;
 *  - QKᵀ and attention·V: crossbars set on the fly from the cached keys and values;
 *  - digital: layer norm, the attention scale, softmax and its mask/window, GELU, bias and
 *    residual adds.
 *
 * On the GPU (gpu/machine.ts) the same pass runs as WGSL kernels; this one is the reference
 * the GPU is checked against, and the Node path for the reference measurements.
 */
export class BigForward implements Sequence {
  private keys: Float32Array[][][]
  private values: Float32Array[][][]
  pos = 0

  constructor(
    readonly cfg: ModelConfig,
    readonly vec: (key: string) => Float32Array,
    readonly backend: Backend,
  ) {
    this.keys = Array.from({ length: cfg.nLayer }, () => Array.from({ length: cfg.nHead }, () => []))
    this.values = Array.from({ length: cfg.nLayer }, () => Array.from({ length: cfg.nHead }, () => []))
  }

  step(token: number): Float32Array {
    const { cfg, backend: be } = this
    const d = cfg.d
    const hd = d / cfg.nHead
    const pos = this.pos++
    if (pos >= cfg.nCtx) throw new Error('context full')
    if (!be.column) throw new Error('backend cannot read a column backwards')
    const x = be.column('lm_head', token)
    const onehot = new Float32Array(cfg.nCtx)
    onehot[pos] = 1
    const pe = be.linear('wpe', onehot)
    for (let i = 0; i < d; i++) x[i] += pe[i]
    const a = new Float32Array(d)
    for (let l = 0; l < cfg.nLayer; l++) {
      const P = `L${l}`
      layerNorm(x, this.vec(`${P}.ln1.g`), this.vec(`${P}.ln1.b`), cfg.eps, a)
      const qkv = be.linear(`${P}.qkv`, a)
      addInto(qkv, this.vec(`${P}.qkv.b`))
      const att = new Float32Array(d)
      const win = cfg.windows[l]
      for (let h = 0; h < cfg.nHead; h++) {
        const q = qkv.slice(h * hd, (h + 1) * hd)
        const K = this.keys[l][h]
        const V = this.values[l][h]
        K.push(qkv.slice(d + h * hd, d + (h + 1) * hd))
        V.push(qkv.slice(2 * d + h * hd, 2 * d + (h + 1) * hd))
        const j0 = win ? Math.max(0, K.length - win) : 0
        const s = be.scores(`l${l}.h${h}.qk`, q, K.slice(j0))
        const p = softmaxScaled(s, cfg.attnScale)
        const o = be.mix(`l${l}.h${h}.av`, p, V.slice(j0))
        att.set(o, h * hd)
      }
      const ao = be.linear(`${P}.attn_out`, att)
      const bo = this.vec(`${P}.attn_out.b`)
      for (let i = 0; i < d; i++) x[i] += ao[i] + bo[i]
      layerNorm(x, this.vec(`${P}.ln2.g`), this.vec(`${P}.ln2.b`), cfg.eps, a)
      const hdn = be.linear(`${P}.fc`, a)
      const bf = this.vec(`${P}.fc.b`)
      for (let i = 0; i < hdn.length; i++) hdn[i] = geluNew(hdn[i] + bf[i])
      const pr = be.linear(`${P}.proj`, hdn)
      const bp = this.vec(`${P}.proj.b`)
      for (let i = 0; i < d; i++) x[i] += pr[i] + bp[i]
    }
    layerNorm(x, this.vec('lnf.g'), this.vec('lnf.b'), cfg.eps, a)
    return be.linear('lm_head', a)
  }
}

function addInto(y: Float32Array, b: Float32Array): void {
  for (let i = 0; i < y.length; i++) y[i] += b[i]
}

/** Digital: scale the scores and take the softmax. */
export function softmaxScaled(s: Float32Array, scale: number): Float32Array {
  let mx = -Infinity
  for (let j = 0; j < s.length; j++) mx = Math.max(mx, s[j] * scale)
  const p = new Float32Array(s.length)
  let z = 0
  for (let j = 0; j < s.length; j++) {
    p[j] = Math.exp(s[j] * scale - mx)
    z += p[j]
  }
  for (let j = 0; j < s.length; j++) p[j] /= z
  return p
}

export function layerNorm(x: Float32Array, g: Float32Array, b: Float32Array, eps: number, out: Float32Array): void {
  const n = g.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += x[i]
  mean /= n
  let v = 0
  for (let i = 0; i < n; i++) v += (x[i] - mean) ** 2
  const inv = 1 / Math.sqrt(v / n + eps)
  for (let i = 0; i < n; i++) out[i] = (x[i] - mean) * inv * g[i] + b[i]
}

export function logSoftmax(logits: Float32Array): Float64Array {
  let mx = -Infinity
  for (const v of logits) if (v > mx) mx = v
  let z = 0
  for (const v of logits) z += Math.exp(v - mx)
  const lz = mx + Math.log(z)
  const out = new Float64Array(logits.length)
  for (let i = 0; i < logits.length; i++) out[i] = logits[i] - lz
  return out
}

export function argmax(v: ArrayLike<number>): number {
  let best = 0
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i
  return best
}

/** Digital sampling: temperature + top-k. Temperature 0 = greedy. */
export function sample(logits: Float32Array, temperature: number, topK: number, rand: () => number = Math.random): number {
  if (temperature <= 0) return argmax(logits)
  const idx = Array.from(logits.keys())
    .sort((a, b) => logits[b] - logits[a])
    .slice(0, Math.max(1, topK))
  const mx = logits[idx[0]]
  const ps = idx.map((i) => Math.exp((logits[i] - mx) / temperature))
  const z = ps.reduce((a, b) => a + b, 0)
  let u = rand() * z
  for (let i = 0; i < idx.length; i++) {
    u -= ps[i]
    if (u <= 0) return idx[i]
  }
  return idx[idx.length - 1]
}
