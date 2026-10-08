import { TILE, type CrossbarSettings } from '../../crossbar/tile.ts'
import { matrixSeed } from '../../crossbar/matrix.ts'
import { transientSeed } from '../../crossbar/lattice.ts'
import { buildProgram, type BandEvent, type BufName, type ModelWeights, type Op } from '../model.ts'
import {
  UNIFORM_BYTES,
  UNIFORM_SLOT,
  WGSL_ACTSTAT,
  WGSL_CALIB,
  WGSL_EMBED,
  WGSL_KVWRITE,
  WGSL_LAYERNORM,
  WGSL_MIX,
  WGSL_MIXSUM,
  WGSL_REDUCE,
  WGSL_SCORES,
  WGSL_SOFTMAX,
  WGSL_TILES,
} from './kernels.ts'

/**
 * The hydraulic machine on WebGPU. The weights live in one storage buffer as half floats
 * (shared with the renderer, which draws every valve straight from it); valve openings,
 * valve errors and manifold losses are recomputed from them inside the kernels, exactly
 * as src/crossbar/lattice.ts does on the CPU. A token is one command buffer, and only the
 * logits come back.
 */

export interface GridGpuLayout {
  /** Word offset of the grid's half floats in `vals`. */
  valOff: number
  /** Index of the grid's first tile in `wmax` / `gains`. */
  tileOff: number
  actOff: number
}

interface Dispatch {
  pipeline: GPUComputePipeline
  bind: GPUBindGroup
  wg: (pos: number) => [number, number]
  fill: (u: Uint32Array, f: Float32Array, base: number, token: number, pos: number) => void
  /** Index into the program (for the exhibit's sweep). */
  op: number
}

/** Maximum context kept on the GPU (the key/value cache is sized for this). */
export const GPU_MAX_CTX = 512

export async function requestMachineDevice(): Promise<GPUDevice> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new Error('WebGPU is not available in this browser')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter found')
  const want = 1024 * 1024 * 1024
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(want, adapter.limits.maxStorageBufferBindingSize),
      maxBufferSize: Math.min(want, adapter.limits.maxBufferSize),
      maxStorageBuffersPerShaderStage: Math.min(10, adapter.limits.maxStorageBuffersPerShaderStage),
      maxComputeWorkgroupStorageSize: Math.min(16384, adapter.limits.maxComputeWorkgroupStorageSize),
    },
  })
  // Keep the adapter reachable: some Chromium builds tear the instance down once it is
  // garbage collected, taking the device with it.
  keepAlive.push(adapter)
  return device
}

const keepAlive: unknown[] = []

export function levelsOf(s: CrossbarSettings): number {
  return s.bits === null ? 0 : (1 << s.bits) - 1
}

export class GpuMachine {
  readonly device: GPUDevice
  readonly w: ModelWeights
  readonly program: Op[]
  readonly layout: GridGpuLayout[]
  readonly vals: GPUBuffer
  readonly wmax: GPUBuffer
  readonly gains: GPUBuffer
  readonly act: GPUBuffer
  readonly actMeta: GPUBuffer
  /** Key/value cache, per layer [keys ctx × d][values ctx × d]. */
  readonly kv: GPUBuffer
  /** w_max of every attention tile (for the renderer), [layer][k|v][head][64-position block]. */
  readonly kvmax: GPUBuffer
  readonly actFloats: number
  readonly nbMax: number
  private vecs: GPUBuffer | null = null
  private vecOff = new Map<string, number>()
  private bufs: Record<BufName, GPUBuffer>
  private partial: GPUBuffer
  private seeds: GPUBuffer
  private scores: GPUBuffer
  private mixpart: GPUBuffer
  private uniforms: GPUBuffer | null = null
  private staging: GPUBuffer
  private dispatches: Dispatch[] = []
  private uniformData: ArrayBuffer | null = null
  private calibPipe: GPUComputePipeline | null = null
  private calibKey = ''
  private cached: number[] = []
  /** Number of token positions in the key/value cache. */
  get programmed(): number {
    return this.cached.length
  }
  readonly ctx: number
  settings: CrossbarSettings
  /** Wall time of the last step's GPU work (ms) and the number of tokens it ran. */
  lastStepMs = 0
  lastStepTokens = 0

  constructor(device: GPUDevice, w: ModelWeights, settings: CrossbarSettings) {
    this.device = device
    this.w = w
    this.settings = settings
    this.program = buildProgram(w.cfg)
    this.ctx = Math.min(w.cfg.nCtx, GPU_MAX_CTX)
    this.nbMax = Math.ceil(this.ctx / TILE)
    const { d, nHead, nLayer, vocab } = w.cfg
    let words = 0
    let tiles = 0
    let actN = 0
    this.layout = w.grids.map((g) => {
      const l = { valOff: words, tileOff: tiles, actOff: actN }
      const n = g.tilesR * g.tilesC
      words += n * (TILE * TILE) / 2
      tiles += n
      actN += g.rows + g.cols
      return l
    })
    this.actFloats = actN
    const S = GPUBufferUsage.STORAGE
    const D = GPUBufferUsage.COPY_DST
    const C = GPUBufferUsage.COPY_SRC
    const mk = (size: number, usage: number, label: string) =>
      device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label })
    this.vals = mk(words * 4, S | D | C, 'weights (half floats)')
    this.wmax = mk(tiles * 4, S | D | C, 'tile valve scales')
    this.gains = mk(tiles * 128 * 4, S | D, 'collector calibration gains')
    this.act = mk(actN * 4, S | D | C, 'activity')
    this.actMeta = mk(w.grids.length * 16, S | D | C, 'activity meta')
    const maxPartial = Math.max(...w.grids.map((g) => g.tilesR * g.cols))
    this.bufs = {
      x: mk(d * 4, S | D | C, 'x'),
      a: mk(d * 4, S | D | C, 'a'),
      qkv: mk(3 * d * 4, S | D | C, 'qkv'),
      att: mk(d * 4, S | D | C, 'att'),
      h: mk(4 * d * 4, S | D | C, 'h'),
      logits: mk(vocab * 4, S | D | C, 'logits'),
    }
    this.partial = mk(maxPartial * 4, S, 'partial collector flows')
    this.kv = mk(nLayer * 2 * this.ctx * d * 4, S, 'key/value cache')
    this.kvmax = mk(nLayer * 2 * nHead * this.nbMax * 4, S | D, 'attention tile scales')
    this.seeds = mk(nLayer * nHead * 2 * 4, S | D, 'attention tile seeds')
    this.scores = mk(nHead * this.ctx * 4, S | C, 'attention scores')
    this.mixpart = mk(nHead * this.nbMax * TILE * 4, S, 'attention partial outflows')
    this.staging = device.createBuffer({ size: vocab * 4, usage: GPUBufferUsage.MAP_READ | D })
  }

  /** Stream one band of freshly programmed tiles to the GPU. */
  uploadBand(e: BandEvent): void {
    const g = e.grid
    const L = this.layout[g.id]
    const q = this.device.queue
    for (const t of e.tiles) {
      const idx = t.tr * g.tilesC + t.tc
      q.writeBuffer(this.vals, (L.valOff + idx * 2048) * 4, t.half.buffer, t.half.byteOffset, t.half.byteLength)
      q.writeBuffer(this.wmax, (L.tileOff + idx) * 4, new Float32Array([t.wmax]))
    }
  }

  /** After loading: upload digital parameters, build the per-token command list, commission. */
  finalize(): void {
    let n = 0
    const keys = [...this.w.vec.keys()]
    for (const k of keys) {
      this.vecOff.set(k, n)
      n += this.w.vec.get(k)!.length
    }
    const all = new Float32Array(n)
    for (const k of keys) all.set(this.w.vec.get(k)!, this.vecOff.get(k)!)
    this.vecs = this.device.createBuffer({ size: all.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'digital params' })
    this.device.queue.writeBuffer(this.vecs, 0, all)
    this.build()
  }

  private pipe(code: string, label: string): GPUComputePipeline {
    const module = this.device.createShaderModule({ code, label })
    return this.device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' }, label })
  }

  private nKeys(layer: number, pos: number): { j0: number; n: number } {
    const win = this.w.cfg.windows[layer]
    const j0 = win ? Math.max(0, pos + 1 - win) : 0
    return { j0, n: pos + 1 - j0 }
  }

  private build(): void {
    const dev = this.device
    const cfg = this.w.cfg
    const P = {
      tiles: this.pipe(WGSL_TILES, 'tiles'),
      reduce: this.pipe(WGSL_REDUCE, 'reduce'),
      actstat: this.pipe(WGSL_ACTSTAT, 'actstat'),
      embed: this.pipe(WGSL_EMBED, 'embed'),
      ln: this.pipe(WGSL_LAYERNORM, 'layernorm'),
      kv: this.pipe(WGSL_KVWRITE, 'kvwrite'),
      scores: this.pipe(WGSL_SCORES, 'scores'),
      softmax: this.pipe(WGSL_SOFTMAX, 'softmax'),
      mix: this.pipe(WGSL_MIX, 'mix'),
      mixsum: this.pipe(WGSL_MIXSUM, 'mixsum'),
    }
    this.calibPipe = this.pipe(WGSL_CALIB, 'calibrate')
    type Pending = Omit<Dispatch, 'bind'> & { entries: GPUBuffer[] }
    const pend: Pending[] = []
    const vecs = this.vecs!
    const lm = this.w.grid('lm_head')
    const wpe = this.w.grid('wpe')
    const once = (n: number): ((pos: number) => [number, number]) => () => [n, 1]
    const hd = cfg.d / cfg.nHead
    this.program.forEach((op, oi) => {
      switch (op.kind) {
        case 'embed':
          pend.push({
            op: oi,
            pipeline: P.embed,
            wg: once(Math.ceil(cfg.d / 64)),
            entries: [this.vals, this.wmax, this.gains, this.bufs.x],
            fill: (u, _f, b, token, pos) => {
              this.fillGrid(u, _f, b, lm.id)
              const W = this.layout[wpe.id]
              u[b + 15] = token
              u[b + 14] = pos
              u[b + 20] = cfg.d
              u[b + 30] = W.valOff
              u[b + 31] = W.tileOff
              u[b + 32] = wpe.tilesC
              u[b + 33] = matrixSeed('wpe', this.settings.seed)
              u[b + 34] = wpe.rows
            },
          })
          break
        case 'ln':
          pend.push({
            op: oi,
            pipeline: P.ln,
            wg: once(1),
            entries: [this.bufs.x, vecs, this.bufs.a],
            fill: (u, f, b) => {
              u[b + 20] = cfg.d
              u[b + 24] = this.vecOff.get(op.g)!
              u[b + 25] = this.vecOff.get(op.b)!
              f[b + 26] = cfg.eps
            },
          })
          break
        case 'matmul': {
          const g = this.w.grid(op.grid)
          const fillMm = (u: Uint32Array, f: Float32Array, b: number, _t: number, pos: number) => {
            this.fillGrid(u, f, b, g.id)
            u[b + 11] = (op.gelu ? 1 : 0) | (op.residual ? 2 : 0) | (op.bias ? 4 : 0)
            u[b + 12] = op.bias ? this.vecOff.get(op.bias)! : 0
            u[b + 14] = pos
          }
          pend.push({
            op: oi,
            pipeline: P.tiles,
            wg: () => [g.tilesC, g.tilesR],
            entries: [this.vals, this.wmax, this.gains, this.bufs[op.src], this.partial, this.act],
            fill: fillMm,
          })
          pend.push({ op: oi, pipeline: P.reduce, wg: once(Math.ceil(g.cols / 64)), entries: [this.partial, vecs, this.bufs[op.dst], this.act], fill: fillMm })
          pend.push({ op: oi, pipeline: P.actstat, wg: once(1), entries: [this.act, this.actMeta], fill: fillMm })
          break
        }
        case 'attn': {
          const l = op.layer
          const fillAt = (u: Uint32Array, f: Float32Array, b: number, _t: number, pos: number) => {
            this.fillPhysics(u, f, b)
            const { j0, n } = this.nKeys(l, pos)
            u[b + 14] = pos
            u[b + 16] = l
            u[b + 17] = j0
            u[b + 18] = cfg.nHead
            u[b + 19] = hd
            u[b + 20] = cfg.d
            f[b + 21] = cfg.attnScale
            u[b + 22] = l * 2 * this.ctx * cfg.d
            u[b + 23] = n
            u[b + 27] = this.ctx
            u[b + 29] = this.nbMax
          }
          const nb = (pos: number): [number, number] => [Math.ceil(this.nKeys(l, pos).n / TILE), cfg.nHead]
          pend.push({ op: oi, pipeline: P.kv, wg: once(Math.ceil(cfg.d / 64)), entries: [this.bufs.qkv, this.kv], fill: fillAt })
          pend.push({ op: oi, pipeline: P.scores, wg: nb, entries: [this.bufs.qkv, this.kv, this.seeds, this.scores, this.kvmax], fill: fillAt })
          pend.push({ op: oi, pipeline: P.softmax, wg: once(cfg.nHead), entries: [this.scores], fill: fillAt })
          pend.push({ op: oi, pipeline: P.mix, wg: nb, entries: [this.scores, this.kv, this.seeds, this.mixpart, this.kvmax], fill: fillAt })
          pend.push({ op: oi, pipeline: P.mixsum, wg: once(Math.ceil(cfg.d / 64)), entries: [this.mixpart, this.bufs.att], fill: fillAt })
          break
        }
      }
    })
    const slots = pend.length
    this.uniforms = dev.createBuffer({ size: slots * UNIFORM_SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'op uniforms' })
    this.uniformData = new ArrayBuffer(slots * UNIFORM_SLOT)
    this.dispatches = pend.map((p, i) => ({
      op: p.op,
      pipeline: p.pipeline,
      wg: p.wg,
      fill: p.fill,
      bind: dev.createBindGroup({
        layout: p.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniforms!, offset: i * UNIFORM_SLOT, size: UNIFORM_BYTES } },
          ...p.entries.map((buffer, k) => ({ binding: k + 1, resource: { buffer } })),
        ],
      }),
    }))
  }

  private fillPhysics(u: Uint32Array, f: Float32Array, b: number): void {
    const s = this.settings
    u[b + 8] = levelsOf(s)
    f[b + 9] = s.noise
    f[b + 10] = s.lambda
  }

  private fillGrid(u: Uint32Array, f: Float32Array, b: number, gridId: number): void {
    const g = this.w.grids[gridId]
    const L = this.layout[gridId]
    u[b + 0] = L.valOff
    u[b + 1] = L.tileOff
    u[b + 2] = g.rows
    u[b + 3] = g.cols
    u[b + 4] = g.tilesR
    u[b + 5] = g.tilesC
    u[b + 6] = gridId
    u[b + 7] = matrixSeed(g.name, this.settings.seed)
    u[b + 13] = L.actOff
    u[b + 35] = g.name === 'wpe' ? 0 : 1
    this.fillPhysics(u, f, b)
  }

  setPhysics(s: CrossbarSettings): void {
    this.settings = s
    this.cached = [] // the attention crossbars were set under the old machine
  }

  /** Commission every weight tile for the current settings: one calibration run each. */
  private ensureCalibrated(): void {
    const s = this.settings
    const key = `${s.bits}|${s.noise}|${s.lambda}|${s.seed}`
    if (key === this.calibKey) return
    this.calibKey = key
    const n = this.w.grids.length
    const data = new ArrayBuffer(n * UNIFORM_SLOT)
    const u = new Uint32Array(data)
    const f = new Float32Array(data)
    for (let i = 0; i < n; i++) this.fillGrid(u, f, (i * UNIFORM_SLOT) / 4, i)
    const ub = this.device.createBuffer({ size: n * UNIFORM_SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.device.queue.writeBuffer(ub, 0, data)
    const enc = this.device.createCommandEncoder({ label: 'commission' })
    const pass = enc.beginComputePass({ label: 'calibrate' })
    pass.setPipeline(this.calibPipe!)
    for (let i = 0; i < n; i++) {
      const g = this.w.grids[i]
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.calibPipe!.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: ub, offset: i * UNIFORM_SLOT, size: UNIFORM_BYTES } },
            { binding: 1, resource: { buffer: this.vals } },
            { binding: 2, resource: { buffer: this.wmax } },
            { binding: 3, resource: { buffer: this.gains } },
          ],
        }),
      )
      pass.dispatchWorkgroups(g.tilesC, g.tilesR)
    }
    pass.end()
    this.device.queue.submit([enc.finish()])
    ub.destroy()
  }

  /** Commission now and wait for it (so the first token's timing is honest). */
  async commission(): Promise<void> {
    this.ensureCalibrated()
    await this.device.queue.onSubmittedWorkDone()
  }

  reset(): void {
    this.cached = []
  }

  private encodeToken(token: number, pos: number): void {
    const cfg = this.w.cfg
    // fresh valve errors for every attention crossbar, set at this step
    const seeds = new Uint32Array(cfg.nLayer * cfg.nHead * 2)
    for (let l = 0; l < cfg.nLayer; l++) {
      const n = this.nKeys(l, pos).n
      for (let h = 0; h < cfg.nHead; h++) {
        seeds[(l * cfg.nHead + h) * 2] = transientSeed(`l${l}.h${h}.qk`, this.settings.seed, n)
        seeds[(l * cfg.nHead + h) * 2 + 1] = transientSeed(`l${l}.h${h}.av`, this.settings.seed, n)
      }
    }
    const q = this.device.queue
    q.writeBuffer(this.seeds, 0, seeds)
    const data = this.uniformData!
    const u = new Uint32Array(data)
    const f = new Float32Array(data)
    this.dispatches.forEach((d, i) => d.fill(u, f, (i * UNIFORM_SLOT) / 4, token, pos))
    q.writeBuffer(this.uniforms!, 0, data)
    const enc = this.device.createCommandEncoder({ label: `token ${pos}` })
    const pass = enc.beginComputePass()
    for (const d of this.dispatches) {
      pass.setPipeline(d.pipeline)
      pass.setBindGroup(0, d.bind)
      const [x, y] = d.wg(pos)
      pass.dispatchWorkgroups(x, y)
    }
    pass.end()
    q.submit([enc.finish()])
  }

  /** Logits for the last token (the key/value cache is reused for a shared prefix). */
  async step(tokens: number[]): Promise<Float32Array> {
    if (!this.uniforms) throw new Error('machine not finalized')
    if (tokens.length > this.ctx) throw new Error(`context limited to ${this.ctx} tokens`)
    const t0 = performance.now()
    this.ensureCalibrated()
    let k = 0
    while (k < this.cached.length && k < tokens.length && this.cached[k] === tokens[k]) k++
    if (k === tokens.length) k--
    this.cached.length = k
    for (let pos = k; pos < tokens.length; pos++) {
      this.encodeToken(tokens[pos], pos)
      this.cached.push(tokens[pos])
    }
    const enc = this.device.createCommandEncoder()
    enc.copyBufferToBuffer(this.bufs.logits, 0, this.staging, 0, this.w.cfg.vocab * 4)
    this.device.queue.submit([enc.finish()])
    await this.staging.mapAsync(GPUMapMode.READ)
    const out = new Float32Array(this.staging.getMappedRange().slice(0))
    this.staging.unmap()
    this.lastStepMs = performance.now() - t0
    this.lastStepTokens = tokens.length - k
    return out
  }

  /** Activity (heads and outflows of every crossbar for the last token) and per-grid max. */
  async readActivity(): Promise<{ act: Float32Array; meta: Float32Array }> {
    const st = this.device.createBuffer({ size: this.act.size + this.actMeta.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const enc = this.device.createCommandEncoder()
    enc.copyBufferToBuffer(this.act, 0, st, 0, this.act.size)
    enc.copyBufferToBuffer(this.actMeta, 0, st, this.act.size, this.actMeta.size)
    this.device.queue.submit([enc.finish()])
    await st.mapAsync(GPUMapMode.READ)
    const all = st.getMappedRange()
    const act = new Float32Array(all.slice(0, this.act.size))
    const meta = new Float32Array(all.slice(this.act.size))
    st.unmap()
    st.destroy()
    return { act, meta }
  }

  /** The attention probabilities of the last step, [head][position] (tests). */
  get debugScores(): GPUBuffer {
    return this.scores
  }

  /** Read back one activation buffer (tests). */
  async read(name: BufName): Promise<Float32Array> {
    return readBuffer(this.device, this.bufs[name])
  }

  destroy(): void {
    for (const b of [this.vals, this.wmax, this.gains, this.act, this.actMeta, this.partial, this.kv, this.kvmax, this.seeds, this.scores, this.mixpart, this.staging, ...Object.values(this.bufs)]) b.destroy()
    this.vecs?.destroy()
    this.uniforms?.destroy()
  }
}

export async function readBuffer(device: GPUDevice, src: GPUBuffer): Promise<Float32Array> {
  const st = device.createBuffer({ size: src.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const enc = device.createCommandEncoder()
  enc.copyBufferToBuffer(src, 0, st, 0, src.size)
  device.queue.submit([enc.finish()])
  await st.mapAsync(GPUMapMode.READ)
  const out = new Float32Array(st.getMappedRange().slice(0))
  st.destroy()
  return out
}
