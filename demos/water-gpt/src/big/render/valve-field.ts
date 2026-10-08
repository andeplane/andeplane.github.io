import { TILE } from '../grid.ts'
import { fromHalf } from '../grid.ts'
import { levelsOf, type GpuMachine } from '../gpu/machine.ts'
import type { BandEvent, ModelWeights } from '../model.ts'
import { Camera, type View } from './camera.ts'
import { ATLAS_DOWNSAMPLE, buildLayout, pickValve, valveWorld, type Layout, type LayoutRect } from './layout.ts'
import { FIELD_WGSL, MIP_WGSL } from './shaders.ts'

export interface HoverInfo {
  rect: LayoutRect
  grid: number
  row: number
  col: number
  /** Screen position (CSS px, relative to canvas) of the valve's centre and its size. */
  sx: number
  sy: number
  cellPx: number
}

/**
 * WebGPU renderer for the valve field. It reads the very buffers the compute kernels
 * use (valve codes, gauges, per-crossbar activity), plus its own atlas of aggregates for
 * the zoomed-out hall and a table of when each band of valves was filled.
 */
export class ValveFieldRenderer {
  readonly device: GPUDevice
  readonly canvas: HTMLCanvasElement
  readonly layout: Layout
  readonly camera = new Camera()
  private ctx: GPUCanvasContext | null
  private format: GPUTextureFormat
  private w: ModelWeights
  private m: GpuMachine
  get machine(): GpuMachine {
    return this.m
  }
  private atlas: GPUTexture
  private atlasW: number
  private atlasH: number
  private mipLevels: number
  private sampler: GPUSampler
  private tables: GPUBuffer
  private tableData: Uint32Array<ArrayBuffer>
  private times: GPUBuffer
  private timeData: Float32Array<ArrayBuffer>
  private timesDirty = true
  private tablesDirty = false
  private loadOff: number[] = []
  private uniforms: GPUBuffer
  private pipeline: GPURenderPipeline
  private bind: GPUBindGroup
  private mipPipeline: GPURenderPipeline
  private mipDirty = false
  private lastMip = 0
  private raf = 0
  private lastFrame = performance.now()
  private t0 = performance.now()
  private hover: { grid: number; x: number; y: number } | null = null
  onHover: ((h: HoverInfo | null) => void) | null = null
  onFrame: ((camera: Camera) => void) | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private lastPinch = 0
  private dragVel = { x: 0, y: 0, t: 0 }
  private resizeObs: ResizeObserver
  private lastPointer: { x: number; y: number } | null = null
  private inflight = false
  /** Fraction of device resolution to render at (lower = faster). */
  renderScale = 1

  private offscreen: GPUTexture | null = null
  private ctx2d: CanvasRenderingContext2D | null = null

  /**
   * `present: 'readback'` renders offscreen and copies frames into a 2D canvas: slow, but
   * works where WebGPU canvas presentation does not (e.g. headless SwiftShader tests).
   */
  constructor(device: GPUDevice, canvas: HTMLCanvasElement, machine: GpuMachine, weights: ModelWeights, present: 'canvas' | 'readback' = 'canvas') {
    this.device = device
    this.canvas = canvas
    this.m = machine
    this.w = weights
    this.layout = buildLayout(weights.specs, weights.cfg.nLayer, weights.cfg.d, machine.ctx)
    if (present === 'canvas') {
      const ctx = canvas.getContext('webgpu')
      if (!ctx) throw new Error('could not create a WebGPU canvas context')
      this.ctx = ctx
      this.format = navigator.gpu.getPreferredCanvasFormat()
      ctx.configure({ device, format: this.format, alphaMode: 'opaque' })
    } else {
      this.ctx = null
      this.ctx2d = canvas.getContext('2d')
      this.format = 'rgba8unorm'
    }

    this.atlasW = Math.ceil(this.layout.width / ATLAS_DOWNSAMPLE)
    this.atlasH = Math.ceil(this.layout.height / ATLAS_DOWNSAMPLE)
    this.mipLevels = Math.floor(Math.log2(Math.max(this.atlasW, this.atlasH))) + 1
    this.atlas = device.createTexture({
      size: [this.atlasW, this.atlasH],
      format: 'rgba8unorm',
      mipLevelCount: this.mipLevels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'valve atlas',
    })
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' })

    // tables: rects (8 u32 each) then grids (8 u32 each)
    const nR = this.layout.rects.length
    const nG = weights.grids.length
    this.tableData = new Uint32Array((nR + nG) * 8)
    this.layout.rects.forEach((r, i) => {
      const kind = r.kind === 'weights' ? 0 : r.kind === 'keys' ? 1 : 2
      this.tableData.set([r.x0, r.y0, r.w, r.h, r.grid, r.colStart, (Math.max(0, r.layer) & 0xffff) | (kind << 16), r.below], i * 8)
    })
    let bands = 0
    weights.grids.forEach((g, i) => {
      const L = machine.layout[i]
      this.loadOff[i] = bands
      this.tableData.set([L.valOff, L.tileOff, L.actOff, g.rows, g.cols, g.tilesC, bands, 0], (nR + i) * 8)
      bands += Math.max(g.tilesR, g.tilesC)
    })
    this.tables = device.createBuffer({ size: this.tableData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(this.tables, 0, this.tableData)
    // times: activation time per grid, then load time per band
    this.timeData = new Float32Array(nG + bands).fill(-1e9)
    this.timeData.fill(1e9, nG)
    this.times = device.createBuffer({ size: this.timeData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.uniforms = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

    const module = device.createShaderModule({ code: FIELD_WGSL, label: 'valve field' })
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
      label: 'valve field',
    })
    this.bind = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer: this.tables } },
        { binding: 2, resource: { buffer: this.times } },
        { binding: 3, resource: { buffer: machine.vals } },
        { binding: 4, resource: { buffer: machine.act } },
        { binding: 5, resource: { buffer: machine.actMeta } },
        { binding: 6, resource: this.atlas.createView() },
        { binding: 7, resource: this.sampler },
        { binding: 8, resource: { buffer: machine.wmax } },
        { binding: 9, resource: { buffer: machine.kv } },
        { binding: 10, resource: { buffer: machine.kvmax } },
      ],
    })
    const mipModule = device.createShaderModule({ code: MIP_WGSL })
    this.mipPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mipModule, entryPoint: 'vs' },
      fragment: { module: mipModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    })

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(canvas)
    this.resize()
    this.installInput()
    this.home(false)
  }

  /** Seconds on the renderer's clock (what load/activation times are measured in). */
  now(): number {
    return this.frozen ?? (performance.now() - this.t0) / 1000
  }

  /** Freeze the exhibit clock (screenshots on very slow GPUs); null resumes. */
  frozen: number | null = null

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  /** View that fits a world rect into the canvas. */
  fit(x0: number, y0: number, w: number, h: number, margin = 1.08): View {
    const cw = Math.max(1, this.canvas.clientWidth)
    const ch = Math.max(1, this.canvas.clientHeight)
    return { cx: x0 + w / 2, cy: y0 + h / 2, scale: Math.max(w / cw, h / ch) * margin }
  }

  home(animate = true): void {
    const v = this.fit(0, 0, this.layout.width, this.layout.height)
    this.camera.maxScale = v.scale * 1.6
    if (animate) this.camera.flyTo(v, this.canvas.clientWidth)
    else this.camera.set(v)
  }

  flyToGrid(gridName: string): void {
    const g = this.w.grid(gridName)
    const rs = this.layout.rects.filter((r) => r.grid === g.id && r.kind === 'weights')
    const x0 = Math.min(...rs.map((r) => r.x0))
    const y0 = Math.min(...rs.map((r) => r.y0))
    const x1 = Math.max(...rs.map((r) => r.x0 + r.w))
    const y1 = Math.max(...rs.map((r) => r.y0 + r.h))
    this.camera.flyTo(this.fit(x0, y0, x1 - x0, y1 - y0, 1.15), this.canvas.clientWidth)
  }

  flyToLayer(layer: number): void {
    const b = this.layout.bays[layer]
    this.camera.flyTo(this.fit(b.x0, b.y0, b.w, b.h, 1.1), this.canvas.clientWidth)
  }

  flyToValve(grid: number, row: number, col: number, cellPx = 300): void {
    const p = valveWorld(this.layout, grid, row, col)
    if (!p) return
    this.camera.flyTo({ cx: p.x + 0.5, cy: p.y + 0.5, scale: 1 / cellPx }, this.canvas.clientWidth)
  }

  /** Light up a crossbar (activation time in renderer seconds; may be in the future). */
  activate(grid: number, at: number): void {
    this.timeData[grid] = at
    this.timesDirty = true
  }

  /** Reset every reservoir to empty (e.g. before a reload). */
  clearFill(): void {
    this.timeData.fill(1e9, this.w.grids.length)
    this.timesDirty = true
  }

  /** A band of valves was just programmed: aggregate it into the atlas and start its fill wave. */
  onBand(e: BandEvent): void {
    const g = e.grid
    const bandIdx = Math.floor(e.start / TILE)
    const bands = Math.ceil(e.count / TILE)
    const axis = e.axis === 'rows' ? 0 : 1
    const nR = this.layout.rects.length
    if (this.tableData[(nR + g.id) * 8 + 7] !== axis) {
      this.tableData[(nR + g.id) * 8 + 7] = axis
      this.tablesDirty = true
    }
    const t = this.now()
    for (let b = 0; b < bands; b++) this.timeData[this.w.grids.length + this.loadOff[g.id] + bandIdx + b] = t
    this.timesDirty = true
    for (const t of e.tiles) this.atlasTile(g.id, t.tr, t.tc, t.half, t.wmax)
    this.mipDirty = true
  }

  /** Aggregate one programmed 64 × 64 tile into 8 × 8 atlas texels (mean opening, +/− balance, max) and upload. */
  private atlasTile(grid: number, tr: number, tc: number, half: Uint16Array, wmax: number): void {
    const D = ATLAS_DOWNSAMPLE
    const g = this.w.grids[grid]
    const inv = wmax > 0 ? 1 / wmax : 0
    const k = Math.min(TILE, g.rows - tr * TILE)
    const n = Math.min(TILE, g.cols - tc * TILE)
    const T = TILE / D
    const data = new Uint8Array(256 * T)
    for (let ty = 0; ty < T; ty++)
      for (let tx = 0; tx < T; tx++) {
        let sa = 0
        let ss = 0
        let mx = 0
        let cnt = 0
        for (let dy = 0; dy < D; dy++) {
          const i = ty * D + dy
          if (i >= k) break
          for (let dx = 0; dx < D; dx++) {
            const j = tx * D + dx
            if (j >= n) break
            const o = fromHalf(half[i * TILE + j]) * inv
            const a = Math.abs(o)
            sa += a
            ss += o
            if (a > mx) mx = a
            cnt++
          }
        }
        if (cnt === 0) continue
        const at = ty * 256 + tx * 4
        data[at] = Math.min(255, Math.round((sa / cnt) * 255))
        data[at + 1] = sa > 0 ? Math.round(127.5 + 127.5 * (ss / sa)) : 128
        data[at + 2] = Math.round(mx * 255)
        data[at + 3] = 255
      }
    const col0 = tc * TILE
    for (const r of this.layout.rects) {
      if (r.grid !== grid || r.kind !== 'weights') continue
      if (col0 < r.colStart || col0 >= r.colStart + r.w) continue
      const x = (r.x0 + col0 - r.colStart) / D
      const y = (r.y0 + tr * TILE) / D
      this.device.queue.writeTexture({ texture: this.atlas, origin: [x, y] }, data, { bytesPerRow: 256, rowsPerImage: T }, [T, T])
    }
  }

  private buildMips(): void {
    const enc = this.device.createCommandEncoder({ label: 'atlas mips' })
    for (let l = 1; l < this.mipLevels; l++) {
      const bind = this.device.createBindGroup({
        layout: this.mipPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.atlas.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) },
          { binding: 1, resource: this.sampler },
        ],
      })
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.atlas.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      })
      pass.setPipeline(this.mipPipeline)
      pass.setBindGroup(0, bind)
      pass.draw(3)
      pass.end()
    }
    this.device.queue.submit([enc.finish()])
  }

  start(): void {
    if (this.raf) return
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.inflight) return
      this.inflight = true
      this.frame()
      this.device.queue.onSubmittedWorkDone().then(
        () => (this.inflight = false),
        () => (this.inflight = false),
      )
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy(): void {
    this.stop()
    this.resizeObs.disconnect()
    this.atlas.destroy()
    this.tables.destroy()
    this.times.destroy()
    this.uniforms.destroy()
  }

  /** Render one frame (also callable directly, e.g. from tests). */
  frame(): void {
    const nowMs = performance.now()
    const dt = Math.min(100, nowMs - this.lastFrame)
    this.lastFrame = nowMs
    this.camera.update(dt)
    this.resize()
    const q = this.device.queue
    if (this.tablesDirty) {
      q.writeBuffer(this.tables, 0, this.tableData)
      this.tablesDirty = false
    }
    if (this.timesDirty) {
      q.writeBuffer(this.times, 0, this.timeData)
      this.timesDirty = false
    }
    if (this.mipDirty && nowMs - this.lastMip > 350) {
      this.buildMips()
      this.mipDirty = false
      this.lastMip = nowMs
    }
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth)
    const cam = this.camera
    const scaleDev = cam.scale / dpr
    const ix = Math.floor(cam.cx)
    const iy = Math.floor(cam.cy)
    const buf = new ArrayBuffer(96)
    const f = new Float32Array(buf)
    const i = new Int32Array(buf)
    const uu = new Uint32Array(buf)
    f[0] = this.canvas.width
    f[1] = this.canvas.height
    f[2] = scaleDev
    f[3] = this.frozen ?? (nowMs - this.t0) / 1000
    i[4] = ix
    i[5] = iy
    f[6] = cam.cx - ix
    f[7] = cam.cy - iy
    f[8] = this.layout.width
    f[9] = this.layout.height
    f[10] = this.atlasW
    f[11] = this.atlasH
    uu[12] = this.layout.rects.length
    uu[13] = levelsOf(this.m.settings)
    f[14] = this.now()
    i[15] = this.hover ? this.hover.grid : -1
    i[16] = this.hover ? this.hover.x : 0
    i[17] = this.hover ? this.hover.y : 0
    uu[18] = this.w.grids.length
    f[19] = dpr
    uu[20] = this.m.ctx
    uu[21] = this.m.programmed
    uu[22] = this.w.cfg.d
    uu[23] = this.w.cfg.nHead
    q.writeBuffer(this.uniforms, 0, buf)
    const enc = this.device.createCommandEncoder()
    let target: GPUTexture
    if (this.ctx) target = this.ctx.getCurrentTexture()
    else {
      if (!this.offscreen || this.offscreen.width !== this.canvas.width || this.offscreen.height !== this.canvas.height) {
        this.offscreen?.destroy()
        this.offscreen = this.device.createTexture({
          size: [this.canvas.width, this.canvas.height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        })
      }
      target = this.offscreen
    }
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bind)
    pass.draw(3)
    pass.end()
    let readback: GPUBuffer | null = null
    const bpr = Math.ceil((target.width * 4) / 256) * 256
    if (!this.ctx) {
      readback = this.device.createBuffer({ size: bpr * target.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
      enc.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: bpr }, [target.width, target.height])
    }
    q.submit([enc.finish()])
    if (readback) this.lastPresent = this.present(readback, bpr, target.width, target.height)
    this.updateHover()
    this.onFrame?.(cam)
  }

  private lastPresent: Promise<void> | null = null

  /** Render a frame and wait until it is on screen (tests, screenshots). */
  async renderNow(): Promise<void> {
    this.frame()
    if (this.lastPresent) await this.lastPresent
    else await this.device.queue.onSubmittedWorkDone()
  }

  /** Readback presentation (for environments where WebGPU cannot present to a canvas). */
  private async present(buf: GPUBuffer, bpr: number, w: number, h: number): Promise<void> {
    await buf.mapAsync(GPUMapMode.READ)
    const src = new Uint8Array(buf.getMappedRange())
    const img = new ImageData(w, h)
    for (let y = 0; y < h; y++) img.data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4)
    buf.unmap()
    buf.destroy()
    if (this.canvas.width === w && this.canvas.height === h) this.ctx2d?.putImageData(img, 0, 0)
  }

  /** Screen (CSS px relative to canvas) → world. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.camera
    return { x: c.cx + (sx - this.canvas.clientWidth / 2) * c.scale, y: c.cy + (sy - this.canvas.clientHeight / 2) * c.scale }
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    const c = this.camera
    return { x: (x - c.cx) / c.scale + this.canvas.clientWidth / 2, y: (y - c.cy) / c.scale + this.canvas.clientHeight / 2 }
  }

  private updateHover(): void {
    const cellPx = 1 / this.camera.scale
    let info: HoverInfo | null = null
    // Close up, the plaque follows the pointer; otherwise the valve under the screen centre.
    const p = this.lastPointer ?? { x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 }
    if (cellPx >= 10) {
      const wpt = this.toWorld(p.x, p.y)
      const hit = pickValve(this.layout, wpt.x, wpt.y)
      if (hit) {
        const wx = Math.floor(wpt.x)
        const wy = Math.floor(wpt.y)
        const s = this.toScreen(wx + 0.5, wy + 0.5)
        info = { rect: hit.rect, grid: hit.rect.grid, row: hit.row, col: hit.col, sx: s.x, sy: s.y, cellPx }
        this.hover = { grid: hit.rect.grid, x: wx, y: wy }
      }
    }
    if (!info) this.hover = null
    this.onHover?.(info)
  }

  private installInput(): void {
    const c = this.canvas
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const p = local(e)
        const k = e.deltaMode === 1 ? 0.05 : 0.0016
        const factor = Math.exp(e.deltaY * k)
        this.camera.zoomAt(factor, p.x - c.clientWidth / 2, p.y - c.clientHeight / 2)
      },
      { passive: false },
    )
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, local(e))
      this.camera.stopFling()
      this.dragVel = { x: 0, y: 0, t: performance.now() }
      if (this.pointers.size === 2) this.lastPinch = this.pinchDist()
    })
    c.addEventListener('pointermove', (e) => {
      const p = local(e)
      if (e.pointerType === 'mouse') this.lastPointer = p
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 1) {
        const dx = p.x - prev.x
        const dy = p.y - prev.y
        this.camera.panBy(dx, dy)
        const now = performance.now()
        const dtv = Math.max(1, now - this.dragVel.t)
        this.dragVel = { x: (dx / dtv) * 16, y: (dy / dtv) * 16, t: now }
      } else if (this.pointers.size === 2) {
        const d = this.pinchDist()
        const mid = this.pinchMid()
        if (this.lastPinch > 0) this.camera.zoomAt(this.lastPinch / d, mid.x - c.clientWidth / 2, mid.y - c.clientHeight / 2, false)
        this.lastPinch = d
      }
    })
    const end = (e: PointerEvent) => {
      if (this.pointers.size === 1 && performance.now() - this.dragVel.t < 60) this.camera.fling(this.dragVel.x, this.dragVel.y)
      this.pointers.delete(e.pointerId)
      this.lastPinch = this.pointers.size === 2 ? this.pinchDist() : 0
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.lastPointer = null
    })
    c.addEventListener('dblclick', (e) => {
      const p = local(e)
      this.camera.zoomAt(e.shiftKey ? 6 : 1 / 6, p.x - c.clientWidth / 2, p.y - c.clientHeight / 2)
    })
    c.tabIndex = 0
    c.addEventListener('keydown', (e) => {
      const k = e.key
      if (k === '+' || k === '=') this.camera.zoomAt(1 / 1.6, 0, 0)
      else if (k === '-' || k === '_') this.camera.zoomAt(1.6, 0, 0)
      else if (k === 'ArrowLeft') this.camera.panBy(80, 0)
      else if (k === 'ArrowRight') this.camera.panBy(-80, 0)
      else if (k === 'ArrowUp') this.camera.panBy(0, 80)
      else if (k === 'ArrowDown') this.camera.panBy(0, -80)
      else if (k === '0' || k === 'Home') this.home()
      else return
      e.preventDefault()
    })
  }

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()]
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
  }

  private pinchMid(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
}
