import { ModelWeights, type Arch, type ModelConfig } from './model.ts'

/**
 * Tiny random GPT-2 / GPT-Neo models delivered through the same band interface as a real
 * checkpoint. Used by the unit tests and by the in-browser GPU-vs-CPU check, so neither
 * needs any weight files.
 */
export function tinyConfig(arch: Arch, over: Partial<ModelConfig> = {}): ModelConfig {
  return {
    arch,
    nLayer: 2,
    nHead: 4,
    d: 64,
    nCtx: 32,
    vocab: 97,
    eps: 1e-5,
    attnScale: arch === 'gpt2' ? 1 / 4 : 1,
    windows: arch === 'gpt2' ? [null, null] : [null, 3],
    ...over,
  }
}

export function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function randn(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())
}

export function tinyModel(
  cfg: ModelConfig,
  seed: number,
  store: { half: boolean; f32: boolean } = { half: false, f32: true },
  onMachine?: (w: ModelWeights) => void,
): { w: ModelWeights; raw: Map<string, Float32Array> } {
  const w = new ModelWeights(cfg, store)
  onMachine?.(w)
  const r = lcg(seed)
  const raw = new Map<string, Float32Array>()
  const put = (name: string, shape: number[], scale: number, offset = 0) => {
    const n = shape.reduce((a, b) => a * b, 1)
    const data = Float32Array.from({ length: n }, () => offset + randn(r) * scale)
    raw.set(name, data)
    const meta = { name, dtype: 'F32', shape }
    if (!w.want(meta)) return
    const rows = shape[0]
    const br = w.bandRows(meta)
    const rowLen = n / rows
    for (let s = 0; s < rows; s += br) {
      const k = Math.min(br, rows - s)
      w.band({ name, shape, rowStart: s, rows: k, data: data.slice(s * rowLen, (s + k) * rowLen) })
    }
  }
  const d = cfg.d
  const pre = cfg.arch === 'neo' ? 'transformer.' : ''
  put(`${pre}wte.weight`, [cfg.vocab, d], 0.3)
  put(`${pre}wpe.weight`, [cfg.nCtx, d], 0.1)
  for (let l = 0; l < cfg.nLayer; l++) {
    const P = `${pre}h.${l}.`
    put(P + 'ln_1.weight', [d], 0.1, 1)
    put(P + 'ln_1.bias', [d], 0.05)
    put(P + 'ln_2.weight', [d], 0.1, 1)
    put(P + 'ln_2.bias', [d], 0.05)
    if (cfg.arch === 'gpt2') {
      put(P + 'attn.c_attn.weight', [d, 3 * d], 0.15)
      put(P + 'attn.c_attn.bias', [3 * d], 0.05)
      put(P + 'attn.c_proj.weight', [d, d], 0.1)
      put(P + 'attn.c_proj.bias', [d], 0.05)
      put(P + 'mlp.c_fc.weight', [d, 4 * d], 0.1)
      put(P + 'mlp.c_fc.bias', [4 * d], 0.05)
      put(P + 'mlp.c_proj.weight', [4 * d, d], 0.08)
      put(P + 'mlp.c_proj.bias', [d], 0.05)
    } else {
      for (const k of ['q', 'k', 'v']) put(P + `attn.attention.${k}_proj.weight`, [d, d], 0.15)
      put(P + 'attn.attention.out_proj.weight', [d, d], 0.1)
      put(P + 'attn.attention.out_proj.bias', [d], 0.05)
      put(P + 'mlp.c_fc.weight', [4 * d, d], 0.1)
      put(P + 'mlp.c_fc.bias', [4 * d], 0.05)
      put(P + 'mlp.c_proj.weight', [d, 4 * d], 0.08)
      put(P + 'mlp.c_proj.bias', [d], 0.05)
    }
  }
  put(`${pre}ln_f.weight`, [d], 0.1, 1)
  put(`${pre}ln_f.bias`, [d], 0.05)
  w.validate()
  return { w, raw }
}
