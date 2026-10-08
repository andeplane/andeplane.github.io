import { attend, newKvBank, programKv, type KvBank } from './attention.ts'
import { CpuCrossbar, type CrossbarBackend, type Physics } from './crossbar.ts'
import { buildProgram, geluNew, type BufName, type ModelWeights, type Op } from './model.ts'
import { hash3 } from './rng.ts'

/**
 * Runs the forward pass on the CPU, one token at a time with a KV cache (the cache is
 * the bank of activation-programmed valves). Every weight matmul goes through the
 * injected CrossbarBackend; layernorm, GELU, softmax and sampling are digital.
 * Used by the Node tests and as the reference the WebGPU kernels are checked against.
 */
export class CpuRunner {
  readonly w: ModelWeights
  backend: CrossbarBackend
  readonly program: Op[]
  private banks: KvBank[]
  private cached: number[] = []
  private bufs: Record<BufName, Float32Array>
  private tmp: Float32Array
  /** Optional tap for visualising activity: called after each crossbar readout. */
  onOp: ((op: Op, input: Float32Array, output: Float32Array) => void) | null = null

  constructor(w: ModelWeights, backendOrPhysics: CrossbarBackend | Physics) {
    this.w = w
    this.backend = 'matmul' in backendOrPhysics ? backendOrPhysics : new CpuCrossbar(backendOrPhysics)
    this.program = buildProgram(w.cfg)
    const { d, vocab, nCtx, nHead, nLayer } = w.cfg
    this.banks = Array.from({ length: nLayer }, () => newKvBank(nCtx, d, nHead))
    this.bufs = {
      x: new Float32Array(d),
      a: new Float32Array(d),
      qkv: new Float32Array(3 * d),
      att: new Float32Array(d),
      h: new Float32Array(4 * d),
      logits: new Float32Array(vocab),
    }
    this.tmp = new Float32Array(4 * d)
  }

  get physics(): Physics {
    return this.backend.physics
  }

  reset(): void {
    this.cached = []
  }

  /** Logits after the last token; reuses the KV cache for a shared prefix. */
  step(tokens: number[]): Float32Array {
    if (tokens.length === 0) throw new Error('no tokens')
    if (tokens.length > this.w.cfg.nCtx) throw new Error('context too long')
    let k = 0
    while (k < this.cached.length && k < tokens.length && this.cached[k] === tokens[k]) k++
    if (k === tokens.length) k-- // recompute the last position to get its logits
    this.cached.length = k
    for (let pos = k; pos < tokens.length; pos++) {
      this.forward(tokens[pos], pos)
      this.cached.push(tokens[pos])
    }
    return this.bufs.logits
  }

  private forward(token: number, pos: number): void {
    const { cfg } = this.w
    const b = this.bufs
    const p = this.physics
    for (const op of this.program) {
      switch (op.kind) {
        case 'embed': {
          // Embedding = the token's column of LM-head valves, read in reverse.
          this.w.grid('lm_head').readColumn(token, p, b.x)
          const wpe = this.w.v('wpe')
          for (let i = 0; i < cfg.d; i++) b.x[i] += wpe[pos * cfg.d + i]
          break
        }
        case 'ln':
          layerNorm(b.x, this.w.v(op.g), this.w.v(op.b), cfg.eps, b.a)
          break
        case 'matmul': {
          const grid = this.w.grid(op.grid)
          const src = b[op.src]
          const dst = op.residual ? this.tmp.subarray(0, grid.cols) : b[op.dst]
          const seed = hash3(p.seed, pos, op.seq)
          this.backend.matmul(grid, src, seed, dst)
          const bias = op.bias ? this.w.v(op.bias) : null
          const target = b[op.dst]
          for (let c = 0; c < grid.cols; c++) {
            let y = dst[c] + (bias ? bias[c] : 0)
            if (op.gelu) y = geluNew(y)
            target[c] = op.residual ? target[c] + y : y
          }
          this.onOp?.(op, src, dst)
          break
        }
        case 'attn': {
          const bank = this.banks[op.layer]
          programKv(bank, b.qkv, pos, cfg.d, cfg.nHead, op.layer, p)
          attend(bank, b.qkv, pos, cfg.d, cfg.nHead, cfg.attnScale, cfg.windows[op.layer], op.layer, p, hash3(p.seed, pos, op.seq), b.att)
          break
        }
      }
    }
  }
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

/** Digital sampling: temperature + top-k. temperature 0 = greedy. */
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
