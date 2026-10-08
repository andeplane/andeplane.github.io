import { TileGrid, TILE } from './crossbar.ts'
import type { TensorBand, TensorMeta } from './weights/bytereader.ts'

/**
 * Model definitions shared by the CPU reference and the WebGPU machine: the
 * architecture config, how checkpoint tensors map onto crossbars, and the forward pass
 * as a flat list of ops (which is also the order the exhibit lights crossbars up).
 */

export type Arch = 'gpt2' | 'neo'

export interface ModelConfig {
  arch: Arch
  nLayer: number
  nHead: number
  d: number
  nCtx: number
  vocab: number
  eps: number
  /** Multiplier on q·k (GPT-2: 1/√head_dim; GPT-Neo: 1, it famously has no scaling). */
  attnScale: number
  /** Per layer: null = global causal attention, n = local window of n tokens (incl. self). */
  windows: (number | null)[]
}

export const GPT2_SMALL: ModelConfig = {
  arch: 'gpt2',
  nLayer: 12,
  nHead: 12,
  d: 768,
  nCtx: 1024,
  vocab: 50257,
  eps: 1e-5,
  attnScale: 1 / 8,
  windows: new Array(12).fill(null),
}

export interface NeoConfigJson {
  hidden_size: number
  num_layers: number
  num_heads: number
  max_position_embeddings: number
  vocab_size: number
  layer_norm_epsilon: number
  window_size: number
  attention_layers: string[]
  activation_function?: string
}

export function neoConfig(j: NeoConfigJson): ModelConfig {
  if (j.activation_function && j.activation_function !== 'gelu_new') {
    throw new Error(`unsupported activation ${j.activation_function}`)
  }
  return {
    arch: 'neo',
    nLayer: j.num_layers,
    nHead: j.num_heads,
    d: j.hidden_size,
    nCtx: j.max_position_embeddings,
    vocab: j.vocab_size,
    eps: j.layer_norm_epsilon,
    attnScale: 1,
    windows: j.attention_layers.map((t) => (t === 'local' ? j.window_size : null)),
  }
}

/** The crossbars of one model, in forward order (this is also the exhibit's order). */
export interface GridSpec {
  name: string
  label: string
  layer: number // -1 for the LM head
  rows: number
  cols: number
}

export function gridSpecs(cfg: ModelConfig): GridSpec[] {
  const d = cfg.d
  const out: GridSpec[] = []
  for (let l = 0; l < cfg.nLayer; l++) {
    out.push({ name: `L${l}.qkv`, label: 'attention Q·K·V', layer: l, rows: d, cols: 3 * d })
    out.push({ name: `L${l}.attn_out`, label: 'attention out', layer: l, rows: d, cols: d })
    out.push({ name: `L${l}.fc`, label: 'MLP up', layer: l, rows: d, cols: 4 * d })
    out.push({ name: `L${l}.proj`, label: 'MLP down', layer: l, rows: 4 * d, cols: d })
  }
  out.push({ name: 'lm_head', label: 'vocabulary (LM head, tied to the embedding)', layer: -1, rows: d, cols: cfg.vocab })
  return out
}

export type Route =
  | { kind: 'grid'; grid: string; layout: 'in_out' | 'out_in'; colOffset: number }
  | { kind: 'vec'; key: string }
  | null

/** Map a checkpoint tensor name onto a crossbar or a digital vector. */
export function routeTensor(cfg: ModelConfig, rawName: string): Route {
  const name = rawName.replace(/^transformer\./, '')
  if (name === 'wte.weight') return { kind: 'grid', grid: 'lm_head', layout: 'out_in', colOffset: 0 }
  if (name === 'wpe.weight') return { kind: 'vec', key: 'wpe' }
  if (name === 'ln_f.weight') return { kind: 'vec', key: 'lnf.g' }
  if (name === 'ln_f.bias') return { kind: 'vec', key: 'lnf.b' }
  const m = /^h\.(\d+)\.(.+)$/.exec(name)
  if (!m) return null
  const l = Number(m[1])
  const rest = m[2]
  const P = `L${l}`
  const simple: Record<string, string> = {
    'ln_1.weight': 'ln1.g',
    'ln_1.bias': 'ln1.b',
    'ln_2.weight': 'ln2.g',
    'ln_2.bias': 'ln2.b',
    'mlp.c_fc.bias': 'fc.b',
    'mlp.c_proj.bias': 'proj.b',
  }
  if (simple[rest]) return { kind: 'vec', key: `${P}.${simple[rest]}` }
  if (cfg.arch === 'gpt2') {
    switch (rest) {
      case 'attn.c_attn.weight':
        return { kind: 'grid', grid: `${P}.qkv`, layout: 'in_out', colOffset: 0 }
      case 'attn.c_attn.bias':
        return { kind: 'vec', key: `${P}.qkv.b` }
      case 'attn.c_proj.weight':
        return { kind: 'grid', grid: `${P}.attn_out`, layout: 'in_out', colOffset: 0 }
      case 'attn.c_proj.bias':
        return { kind: 'vec', key: `${P}.attn_out.b` }
      case 'mlp.c_fc.weight':
        return { kind: 'grid', grid: `${P}.fc`, layout: 'in_out', colOffset: 0 }
      case 'mlp.c_proj.weight':
        return { kind: 'grid', grid: `${P}.proj`, layout: 'in_out', colOffset: 0 }
    }
    return null
  }
  const d = cfg.d
  switch (rest) {
    case 'attn.attention.q_proj.weight':
      return { kind: 'grid', grid: `${P}.qkv`, layout: 'out_in', colOffset: 0 }
    case 'attn.attention.k_proj.weight':
      return { kind: 'grid', grid: `${P}.qkv`, layout: 'out_in', colOffset: d }
    case 'attn.attention.v_proj.weight':
      return { kind: 'grid', grid: `${P}.qkv`, layout: 'out_in', colOffset: 2 * d }
    case 'attn.attention.out_proj.weight':
      return { kind: 'grid', grid: `${P}.attn_out`, layout: 'out_in', colOffset: 0 }
    case 'attn.attention.out_proj.bias':
      return { kind: 'vec', key: `${P}.attn_out.b` }
    case 'mlp.c_fc.weight':
      return { kind: 'grid', grid: `${P}.fc`, layout: 'out_in', colOffset: 0 }
    case 'mlp.c_proj.weight':
      return { kind: 'grid', grid: `${P}.proj`, layout: 'out_in', colOffset: 0 }
  }
  return null
}

/** Progress of programming valves, for the loading animation. */
export interface BandEvent {
  grid: TileGrid
  /** Band in crossbar coordinates. */
  axis: 'rows' | 'cols'
  start: number
  count: number
  layout: 'in_out' | 'out_in'
  colOffset: number
  data: Float32Array
  rowLen: number
}

export class ModelWeights {
  readonly cfg: ModelConfig
  readonly specs: GridSpec[]
  readonly grids: TileGrid[]
  readonly gridByName = new Map<string, TileGrid>()
  readonly vec = new Map<string, Float32Array>()
  programmedValves = 0
  readonly totalValves: number
  onBand: ((e: BandEvent) => void) | null = null

  constructor(cfg: ModelConfig, keepFloat: boolean) {
    this.cfg = cfg
    this.specs = gridSpecs(cfg)
    this.grids = this.specs.map((s, i) => {
      const g = new TileGrid(i, s.name, s.rows, s.cols, keepFloat)
      this.gridByName.set(s.name, g)
      return g
    })
    this.totalValves = this.grids.reduce((a, g) => a + g.valves, 0)
    const d = cfg.d
    for (let l = 0; l < cfg.nLayer; l++) {
      // GPT-Neo has no q/k/v bias; keep zeros so both archs share one forward.
      this.vec.set(`L${l}.qkv.b`, new Float32Array(3 * d))
    }
  }

  grid(name: string): TileGrid {
    const g = this.gridByName.get(name)
    if (!g) throw new Error(`no crossbar ${name}`)
    return g
  }

  v(key: string): Float32Array {
    const x = this.vec.get(key)
    if (!x) throw new Error(`missing weight ${key}`)
    return x
  }

  want = (meta: TensorMeta): boolean => routeTensor(this.cfg, meta.name) !== null

  bandRows = (meta: TensorMeta): number => {
    const r = routeTensor(this.cfg, meta.name)
    return r?.kind === 'grid' ? TILE : Math.max(1, meta.shape[0] ?? 1)
  }

  band = (b: TensorBand): void => {
    const route = routeTensor(this.cfg, b.name)
    if (!route) return
    const rowLen = b.shape.length > 1 ? b.shape.slice(1).reduce((a, c) => a * c, 1) : b.shape[0] ?? 1
    if (route.kind === 'vec') {
      const total = b.shape.reduce((a, c) => a * c, 1)
      let v = this.vec.get(route.key)
      if (!v || v.length !== total) {
        v = new Float32Array(total)
        this.vec.set(route.key, v)
      }
      v.set(b.data, b.shape.length > 1 ? b.rowStart * rowLen : 0)
      return
    }
    const grid = this.grid(route.grid)
    grid.programBand(b.data, b.rowStart, b.rows, rowLen, route.layout, route.colOffset)
    this.programmedValves += b.rows * rowLen
    this.onBand?.({
      grid,
      axis: route.layout === 'in_out' ? 'rows' : 'cols',
      start: route.layout === 'in_out' ? b.rowStart : b.rowStart + route.colOffset,
      count: b.rows,
      layout: route.layout,
      colOffset: route.colOffset,
      data: b.data,
      rowLen,
    })
  }

  /** Check that every tensor the forward pass needs arrived. */
  validate(): void {
    const need = ['wpe', 'lnf.g', 'lnf.b']
    for (let l = 0; l < this.cfg.nLayer; l++) {
      for (const k of ['ln1.g', 'ln1.b', 'ln2.g', 'ln2.b', 'attn_out.b', 'fc.b', 'proj.b']) need.push(`L${l}.${k}`)
    }
    const missing = need.filter((k) => !this.vec.has(k))
    if (missing.length) throw new Error(`checkpoint is missing ${missing.slice(0, 4).join(', ')}…`)
    if (this.programmedValves < this.totalValves) {
      throw new Error(`only ${this.programmedValves} of ${this.totalValves} valves were programmed`)
    }
  }
}

// ---------------------------------------------------------------------------------
// The forward pass as ops. Buffers: x (residual, d), a (normed, d), qkv (3d),
// att (d), h (4d), logits (vocab).

export type BufName = 'x' | 'a' | 'qkv' | 'att' | 'h' | 'logits'

export type Op =
  | { kind: 'embed' }
  | { kind: 'ln'; g: string; b: string }
  | {
      kind: 'matmul'
      grid: string
      src: BufName
      dst: BufName
      bias: string | null
      gelu: boolean
      residual: boolean
      /** Index used to seed this readout's meter noise. */
      seq: number
    }
  | { kind: 'attn'; layer: number; seq: number }

export function buildProgram(cfg: ModelConfig): Op[] {
  const ops: Op[] = [{ kind: 'embed' }]
  let seq = 0
  for (let l = 0; l < cfg.nLayer; l++) {
    const P = `L${l}`
    ops.push({ kind: 'ln', g: `${P}.ln1.g`, b: `${P}.ln1.b` })
    ops.push({ kind: 'matmul', grid: `${P}.qkv`, src: 'a', dst: 'qkv', bias: `${P}.qkv.b`, gelu: false, residual: false, seq: seq++ })
    ops.push({ kind: 'attn', layer: l, seq: seq++ })
    ops.push({ kind: 'matmul', grid: `${P}.attn_out`, src: 'att', dst: 'x', bias: `${P}.attn_out.b`, gelu: false, residual: true, seq: seq++ })
    ops.push({ kind: 'ln', g: `${P}.ln2.g`, b: `${P}.ln2.b` })
    ops.push({ kind: 'matmul', grid: `${P}.fc`, src: 'a', dst: 'h', bias: `${P}.fc.b`, gelu: true, residual: false, seq: seq++ })
    ops.push({ kind: 'matmul', grid: `${P}.proj`, src: 'h', dst: 'x', bias: `${P}.proj.b`, gelu: false, residual: true, seq: seq++ })
  }
  ops.push({ kind: 'ln', g: 'lnf.g', b: 'lnf.b' })
  ops.push({ kind: 'matmul', grid: 'lm_head', src: 'a', dst: 'logits', bias: null, gelu: false, residual: false, seq: seq++ })
  return ops
}

export function geluNew(x: number): number {
  return 0.5 * x * (1 + Math.tanh(0.7978845608028654 * (x + 0.044715 * x * x * x)))
}
