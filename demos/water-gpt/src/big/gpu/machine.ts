import { TILE, type Physics } from '../crossbar.ts'
import { buildProgram, type BandEvent, type BufName, type ModelWeights, type Op } from '../model.ts'
import { hash3 } from '../rng.ts'
import {
  UNIFORM_SLOT,
  WGSL_ACTSTAT,
  WGSL_ATTEND,
  WGSL_EMBED,
  WGSL_GAUGE,
  WGSL_GSUM,
  WGSL_KVWRITE,
  WGSL_LAYERNORM,
  WGSL_REDUCE,
  WGSL_TILES,
} from './kernels.ts'

/**
 * The hydraulic machine on WebGPU. All valve settings live in one storage buffer
 * (shared with the renderer, which draws every valve straight from it); a token is one
 * command buffer of ~5 dispatches per crossbar, and only the logits come back.
 */

export interface GridGpuLayout {
  codeWordOff: number
  scaleOff: number
  gsumOff: number
  actOff: number
}

interface Dispatch {
  pipeline: GPUComputePipeline
  bind: GPUBindGroup
  wg: [number, number]
  fill: (u: Uint32Array, f: Float32Array, base: number, token: number, pos: number) => void
  /** Index into the program (for the exhibit's sweep). */
  op: number
}

/** Maximum context kept on the GPU (KV valve banks are sized for this). */
export const GPU_MAX_CTX = 512

export async function requestMachineDevice(): Promise<GPUDevice> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new Error('WebGPU is not available in this browser')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter found')
  const want = 256 * 1024 * 1024
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(want, adapter.limits.maxStorageBufferBindingSize),
      maxBufferSize: Math.min(want, adapter.limits.maxBufferSize),
      maxStorageBuffersPerShaderStage: Math.min(8, adapter.limits.maxStorageBuffersPerShaderStage),
      maxComputeWorkgroupStorageSize: Math.min(16384, adapter.limits.maxComputeWorkgroupStorageSize),
    },
  })
  // Keep the adapter reachable: some Chromium builds tear the instance down once it is
  // garbage collected, taking the device with it.
  keepAlive.push(adapter)
  return device
}

const keepAlive: unknown[] = []

export class GpuMachine {
  readonly device: GPUDevice
  readonly w: ModelWeights
  readonly program: Op[]
  readonly layout: GridGpuLayout[]
  readonly codes: GPUBuffer
  readonly scales: GPUBuffer
  readonly gsum: GPUBuffer
  readonly act: GPUBuffer
  readonly actMeta: GPUBuffer
  readonly actFloats: number
  private vecs: GPUBuffer | null = null
  private vecOff = new Map<string, number>()
  private bufs: Record<BufName, GPUBuffer>
  private heads: GPUBuffer
  private gscale: GPUBuffer
  private partial: GPUBuffer
  readonly kbank: GPUBuffer
  readonly vgbank: GPUBuffer
  private vsbank: GPUBuffer
  private uniforms: GPUBuffer | null = null
  private staging: GPUBuffer
  private dispatches: Dispatch[] = []
  private uniformData: ArrayBuffer | null = null
  private gsumUniforms: GPUBuffer | null = null
  private cached: number[] = []
  /** Number of token positions whose key/value valves are programmed. */
  get programmed(): number {
    return this.cached.length
  }
  readonly ctx: number
  physics: Physics
  private gsumKey = ''
  /** Wall time of the last token's GPU work (ms). */
  lastTokenMs = 0

  constructor(device: GPUDevice, w: ModelWeights, physics: Physics) {
    this.device = device
    this.w = w
    this.physics = physics
    this.program = buildProgram(w.cfg)
    this.ctx = Math.min(w.cfg.nCtx, GPU_MAX_CTX)
    const { d, nHead, nLayer, vocab } = w.cfg
    let codeWords = 0
    let scaleN = 0
    let gsumN = 0
    let actN = 0
    this.layout = w.grids.map((g) => {
      const l = { codeWordOff: codeWords, scaleOff: scaleN, gsumOff: gsumN, actOff: actN }
      codeWords += (g.codes.length / 4) | 0
      scaleN += g.scale.length
      gsumN += g.tilesR * TILE * g.tilesC
      actN += g.rows + g.cols
      return l
    })
    this.actFloats = actN
    const S = GPUBufferUsage.STORAGE
    const D = GPUBufferUsage.COPY_DST
    const C = GPUBufferUsage.COPY_SRC
    const mk = (size: number, usage: number, label: string) =>
      device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label })
    this.codes = mk(codeWords * 4, S | D, 'valve codes')
    this.scales = mk(scaleN * 4, S | D, 'column gauges')
    this.gsum = mk(gsumN * 4, S | D, 'row conductance sums')
    this.act = mk(actN * 4, S | D | C, 'activity')
    this.actMeta = mk(w.grids.length * 16, S | D | C, 'activity meta')
    const maxRows = Math.max(...w.grids.map((g) => g.rows))
    const maxPartial = Math.max(...w.grids.map((g) => g.tilesR * g.cols))
    this.bufs = {
      x: mk(d * 4, S | D | C, 'x'),
      a: mk(d * 4, S | D | C, 'a'),
      qkv: mk(3 * d * 4, S | D | C, 'qkv'),
      att: mk(d * 4, S | D | C, 'att'),
      h: mk(4 * d * 4, S | D | C, 'h'),
      logits: mk(vocab * 4, S | D | C, 'logits'),
    }
    this.heads = mk(maxRows * 4, S, 'heads')
    this.gscale = mk(Math.ceil(maxRows / TILE) * 4, S, 'gauge scales')
    this.partial = mk(maxPartial * 4, S, 'partial collector flows')
    this.kbank = mk(nLayer * this.ctx * d * 4, S, 'key valves')
    this.vgbank = mk(nLayer * this.ctx * d * 4, S, 'value valves')
    this.vsbank = mk(nLayer * this.ctx * 2 * nHead * 4, S, 'key/value gauges')
    this.staging = device.createBuffer({ size: vocab * 4, usage: GPUBufferUsage.MAP_READ | D })
  }

  /** Stream one band of freshly programmed valves to the GPU. */
  uploadBand(e: BandEvent): void {
    const g = e.grid
    const L = this.layout[g.id]
    const q = this.device.queue
    if (e.axis === 'rows') {
      const tr = e.start / TILE
      const bytes = g.tilesC * TILE * TILE
      q.writeBuffer(this.codes, L.codeWordOff * 4 + tr * bytes, g.codes.buffer, g.codes.byteOffset + tr * bytes, bytes)
      q.writeBuffer(this.scales, (L.scaleOff + tr * g.cols) * 4, g.scale.buffer, g.scale.byteOffset + tr * g.cols * 4, g.cols * 4)
    } else {
      const tc0 = Math.floor(e.start / TILE)
      const tc1 = Math.floor((e.start + e.count - 1) / TILE)
      for (let tr = 0; tr < g.tilesR; tr++) {
        for (let tc = tc0; tc <= tc1; tc++) {
          const off = (tr * g.tilesC + tc) * TILE * TILE
          q.writeBuffer(this.codes, L.codeWordOff * 4 + off, g.codes.buffer, g.codes.byteOffset + off, TILE * TILE)
        }
        const s0 = tr * g.cols + e.start
        q.writeBuffer(this.scales, (L.scaleOff + s0) * 4, g.scale.buffer, g.scale.byteOffset + s0 * 4, e.count * 4)
      }
    }
  }

  /** After loading: upload digital parameters and build the per-token command list. */
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

  private build(): void {
    const dev = this.device
    const cfg = this.w.cfg
    const P = {
      gauge: this.pipe(WGSL_GAUGE, 'gauge'),
      tiles: this.pipe(WGSL_TILES, 'tiles'),
      reduce: this.pipe(WGSL_REDUCE, 'reduce'),
      actstat: this.pipe(WGSL_ACTSTAT, 'actstat'),
      embed: this.pipe(WGSL_EMBED, 'embed'),
      ln: this.pipe(WGSL_LAYERNORM, 'layernorm'),
      kv: this.pipe(WGSL_KVWRITE, 'kvwrite'),
      attend: this.pipe(WGSL_ATTEND, 'attend'),
      gsum: this.pipe(WGSL_GSUM, 'gsum'),
    }
    const list: Omit<Dispatch, 'bind'>[] & { entries: (GPUBuffer | null)[] }[] = []
    type Pending = Omit<Dispatch, 'bind'> & { entries: GPUBuffer[] }
    const pend: Pending[] = []
    void list
    const vecs = this.vecs!
    const lm = this.w.grid('lm_head')
    const lmL = this.layout[lm.id]
    this.program.forEach((op, oi) => {
      switch (op.kind) {
        case 'embed':
          pend.push({
            op: oi,
            pipeline: P.embed,
            wg: [Math.ceil(cfg.d / 64), 1],
            entries: [this.codes, this.scales, vecs, this.bufs.x],
            fill: (u, f, b, token, pos) => {
              this.fillGrid(u, f, b, lm.id)
              u[b + 19] = token
              u[b + 18] = pos
              u[b + 31] = this.vecOff.get('wpe')!
              void lmL
            },
          })
          break
        case 'ln':
          pend.push({
            op: oi,
            pipeline: P.ln,
            wg: [1, 1],
            entries: [this.bufs.x, vecs, this.bufs.a],
            fill: (u, f, b) => {
              u[b + 24] = cfg.d
              u[b + 28] = this.vecOff.get(op.g)!
              u[b + 29] = this.vecOff.get(op.b)!
              f[b + 30] = cfg.eps
            },
          })
          break
        case 'matmul': {
          const g = this.w.grid(op.grid)
          const fillMm = (u: Uint32Array, f: Float32Array, b: number, _t: number, pos: number) => {
            this.fillGrid(u, f, b, g.id)
            u[b + 8] = hash3(this.physics.seed, pos, op.seq)
            u[b + 15] = (op.gelu ? 1 : 0) | (op.residual ? 2 : 0) | (op.bias ? 4 : 0)
            u[b + 16] = op.bias ? this.vecOff.get(op.bias)! : 0
            u[b + 18] = pos
          }
          pend.push({ op: oi, pipeline: P.gauge, wg: [g.tilesR, 1], entries: [this.bufs[op.src], this.heads, this.gscale, this.act], fill: fillMm })
          pend.push({
            op: oi,
            pipeline: P.tiles,
            wg: [g.tilesC, g.tilesR],
            entries: [this.codes, this.scales, this.gsum, this.heads, this.gscale, this.partial],
            fill: fillMm,
          })
          pend.push({ op: oi, pipeline: P.reduce, wg: [Math.ceil(g.cols / 64), 1], entries: [this.partial, vecs, this.bufs[op.dst], this.act], fill: fillMm })
          pend.push({ op: oi, pipeline: P.actstat, wg: [1, 1], entries: [this.act, this.actMeta], fill: fillMm })
          break
        }
        case 'attn': {
          const fillAt = (u: Uint32Array, f: Float32Array, b: number, _t: number, pos: number) => {
            this.fillPhysics(u, f, b)
            const win = cfg.windows[op.layer]
            u[b + 8] = hash3(this.physics.seed, pos, op.seq)
            u[b + 18] = pos
            u[b + 20] = op.layer
            u[b + 21] = win ? Math.max(0, pos - win + 1) : 0
            u[b + 22] = cfg.nHead
            u[b + 23] = cfg.d / cfg.nHead
            u[b + 24] = cfg.d
            f[b + 25] = cfg.attnScale
            u[b + 26] = op.layer * this.ctx * cfg.d
            u[b + 27] = op.layer * this.ctx * 2 * cfg.nHead
          }
          const common = [this.bufs.qkv, this.kbank, this.vgbank, this.vsbank]
          pend.push({ op: oi, pipeline: P.kv, wg: [cfg.nHead, 1], entries: common, fill: fillAt })
          pend.push({ op: oi, pipeline: P.attend, wg: [cfg.nHead, 1], entries: [...common, this.bufs.att], fill: fillAt })
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
          { binding: 0, resource: { buffer: this.uniforms!, offset: i * UNIFORM_SLOT, size: 128 } },
          ...p.entries.map((buffer, k) => ({ binding: k + 1, resource: { buffer } })),
        ],
      }),
    }))
    // gsum precompute: one slot per crossbar
    this.gsumUniforms = dev.createBuffer({ size: this.w.grids.length * UNIFORM_SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.gsumPipe = P.gsum
  }

  private gsumPipe: GPUComputePipeline | null = null

  private fillPhysics(u: Uint32Array, f: Float32Array, b: number): void {
    const p = this.physics
    const ideal = p.ideal
    u[b + 9] = ideal ? 127 : (1 << p.bits) - 1
    u[b + 10] = ideal || p.inBits <= 0 ? 0 : (1 << (p.inBits - 1)) - 1
    u[b + 11] = p.seed >>> 0
    f[b + 12] = ideal ? 0 : p.progNoise
    f[b + 13] = ideal ? 0 : p.readNoise
    f[b + 14] = ideal ? 0 : p.irDrop
  }

  private fillGrid(u: Uint32Array, f: Float32Array, b: number, gridId: number): void {
    const g = this.w.grids[gridId]
    const L = this.layout[gridId]
    u[b + 0] = L.codeWordOff
    u[b + 1] = L.scaleOff
    u[b + 2] = L.gsumOff
    u[b + 3] = g.rows
    u[b + 4] = g.cols
    u[b + 5] = g.tilesR
    u[b + 6] = g.tilesC
    u[b + 7] = gridId
    u[b + 17] = L.actOff
    this.fillPhysics(u, f, b)
  }

  setPhysics(p: Physics): void {
    this.physics = p
    this.cached = [] // the KV valves were programmed under the old physics
  }

  private ensureGsum(enc: GPUCommandEncoder): void {
    const p = this.physics
    if (p.ideal || p.irDrop === 0) return
    const key = `${p.bits}|${p.progNoise}|${p.seed}`
    if (key === this.gsumKey) return
    this.gsumKey = key
    const n = this.w.grids.length
    const data = new ArrayBuffer(n * UNIFORM_SLOT)
    const u = new Uint32Array(data)
    const f = new Float32Array(data)
    for (let i = 0; i < n; i++) this.fillGrid(u, f, (i * UNIFORM_SLOT) / 4, i)
    this.device.queue.writeBuffer(this.gsumUniforms!, 0, data)
    const pass = enc.beginComputePass({ label: 'gsum' })
    pass.setPipeline(this.gsumPipe!)
    for (let i = 0; i < n; i++) {
      const g = this.w.grids[i]
      const bind = this.device.createBindGroup({
        layout: this.gsumPipe!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.gsumUniforms!, offset: i * UNIFORM_SLOT, size: 128 } },
          { binding: 1, resource: { buffer: this.codes } },
          { binding: 2, resource: { buffer: this.gsum } },
        ],
      })
      pass.setBindGroup(0, bind)
      pass.dispatchWorkgroups(g.tilesC, g.tilesR)
    }
    pass.end()
  }

  reset(): void {
    this.cached = []
  }

  private encodeToken(token: number, pos: number): void {
    const data = this.uniformData!
    const u = new Uint32Array(data)
    const f = new Float32Array(data)
    this.dispatches.forEach((d, i) => d.fill(u, f, (i * UNIFORM_SLOT) / 4, token, pos))
    const q = this.device.queue
    q.writeBuffer(this.uniforms!, 0, data)
    const enc = this.device.createCommandEncoder({ label: `token ${pos}` })
    this.ensureGsum(enc)
    const pass = enc.beginComputePass()
    for (const d of this.dispatches) {
      pass.setPipeline(d.pipeline)
      pass.setBindGroup(0, d.bind)
      pass.dispatchWorkgroups(d.wg[0], d.wg[1])
    }
    pass.end()
    q.submit([enc.finish()])
  }

  /** Logits for the last token (KV valves reused for a shared prefix). */
  async step(tokens: number[]): Promise<Float32Array> {
    if (!this.uniforms) throw new Error('machine not finalized')
    if (tokens.length > this.ctx) throw new Error(`context limited to ${this.ctx} tokens`)
    const t0 = performance.now()
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
    this.lastTokenMs = performance.now() - t0
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

  /** Read back one activation buffer (tests). */
  async read(name: BufName): Promise<Float32Array> {
    const src = this.bufs[name]
    const st = this.device.createBuffer({ size: src.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const enc = this.device.createCommandEncoder()
    enc.copyBufferToBuffer(src, 0, st, 0, src.size)
    this.device.queue.submit([enc.finish()])
    await st.mapAsync(GPUMapMode.READ)
    const out = new Float32Array(st.getMappedRange().slice(0))
    st.destroy()
    return out
  }

  destroy(): void {
    for (const b of [this.codes, this.scales, this.gsum, this.act, this.actMeta, this.heads, this.gscale, this.partial, this.kbank, this.vgbank, this.vsbank, this.staging, ...Object.values(this.bufs)]) b.destroy()
    this.vecs?.destroy()
    this.uniforms?.destroy()
    this.gsumUniforms?.destroy()
  }
}
