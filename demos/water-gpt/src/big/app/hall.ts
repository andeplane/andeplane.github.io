import './hall.css'
import { IDEAL, TILE, type CrossbarSettings } from '../../crossbar/tile.ts'
import { matrixSeed, tileSeed } from '../../crossbar/matrix.ts'
import { LatticeBackend, realiseTile } from '../../crossbar/lattice.ts'
import { buildNonIdeal } from '../../ui/nonideal.ts'
import { argmax, sample } from '../forward.ts'
import { fromHalf } from '../grid.ts'
import { GpuMachine, requestMachineDevice } from '../gpu/machine.ts'
import { BIG_MODELS, BIG_WATER, BigMode } from '../mode.ts'
import { ValveFieldRenderer, type HoverInfo } from '../render/valve-field.ts'
import { isCached, resolveFiles } from '../weights/source.ts'
import { BigForward } from '../forward.ts'

/**
 * The hall of valves: how the water-gpt app shows the big modes (GPT-2, TinyStories).
 * It owns a WebGPU device, the machine and the valve-field renderer, and a panel of
 * controls that sits in the app's chapter-2 column in place of calc-gpt's.
 *
 * Page parameters (development and headless checks): ?weights=<base URL> serves the
 * checkpoints from elsewhere, ?present=readback renders offscreen (for software GPUs that
 * cannot present a WebGPU canvas), ?rscale=0.5 renders at lower resolution, ?norender skips
 * drawing, ?autoload=1 fills the reservoirs straight away.
 */

const params = new URLSearchParams(location.search)

const NO_GPU_TEXT =
  'The big models compute and draw tens of millions of valves on your graphics card. Try a recent Chrome or Edge on a laptop or desktop. The 4 × 4 crossbar and calc-gpt work everywhere.'

const STAGE_HTML = /* html */ `
  <canvas id="h-field" aria-label="The valve field: every weight of the model as a valve"></canvas>
  <div id="h-labels" aria-hidden="true"></div>
  <div id="h-plaque" hidden></div>
  <div id="h-note" class="h-note">
    <p class="note-title">The hall is dark</p>
    <p>Every weight of the model will be a valve here. Fill the reservoirs to begin.</p>
  </div>
  <div id="h-nogpu" class="h-note" hidden>
    <p class="note-title">This hall needs WebGPU</p>
    <p id="h-nogpu-detail">${NO_GPU_TEXT}</p>
  </div>
  <div id="h-fill" hidden>
    <div class="fill-head"><span class="fill-title">Filling the reservoirs</span><span id="h-fill-mb">0 / 0 MB</span></div>
    <div class="bar"><div id="h-fill-bar"></div></div>
    <div class="fill-foot"><span id="h-fill-valves">0 valves set</span><span id="h-fill-src"></span></div>
  </div>
  <div class="h-zoomhint" id="h-zoomhint">scroll to zoom · drag to pan · double-click to dive</div>
`

const PANEL_HTML = /* html */ `
  <div class="group">
    <div class="row-buttons"><button type="button" id="h-load" class="primary">Fill the reservoirs</button></div>
    <p class="fine" id="h-load-fine">The weights stream straight from Hugging Face into your browser and are kept in its cache. Nothing is stored on this site.</p>
  </div>
  <div class="group">
    <h3>Prompt</h3>
    <textarea id="h-prompt" rows="2" spellcheck="false" aria-label="Prompt"></textarea>
    <div id="h-examples" class="examples"></div>
    <div class="row-buttons">
      <button type="button" id="h-go" class="primary" disabled>Let the water flow</button>
      <button type="button" id="h-stop" disabled>Stop</button>
    </div>
    <div class="h-sliders">
      <div class="slider-row"><label><span>Temperature</span><output id="h-temp-v">0.70</output></label><input id="h-temp" type="range" min="0" max="1.5" step="0.05" value="0.7" aria-label="Temperature" /></div>
      <div class="slider-row"><label><span>New tokens</span><output id="h-ntok-v">40</output></label><input id="h-ntok" type="range" min="1" max="200" step="1" value="40" aria-label="New tokens" /></div>
    </div>
    <label class="h-check"><input id="h-slowmo" type="checkbox" /> Slow motion: follow the water through every crossbar</label>
  </div>
  <section class="result" aria-live="polite">
    <div id="h-output" class="h-output"><span class="dim">The machine’s words appear here.</span></div>
    <p class="note" id="h-stats"></p>
  </section>
  <div class="group" id="h-nonideal"></div>
  <div class="group">
    <h3>Explore</h3>
    <div class="row-buttons">
      <button type="button" id="h-home">Whole machine</button>
      <select id="h-layer" aria-label="Fly to"></select>
      <button type="button" id="h-random">A random valve</button>
    </div>
  </div>
  <div class="group">
    <h3>What is water and what is digital</h3>
    <ul class="split">
      <li><span class="pos">water</span> Every matrix product: the token embedding (the output head read backwards), the position table, Q·K·V, attention scores QKᵀ and attention·V (valves set on the fly from the cached keys and values), attention out, MLP up and down, and the output head.</li>
      <li><span class="dig">digital</span> Tokenising, layer norm, the attention scale and mask, softmax, GELU, bias and residual adds, and sampling the next token.</li>
    </ul>
    <p class="fine">Same water as calc-gpt: 64 × 64 tiles, x⁺/x⁻ reservoirs and +/− collectors, valve stops, a setting error on every valve and per-collector calibration. The manifold resistance is solved to first order in λ (a full network solve per tile is out of reach for 10⁸ valves); at λ = 3·10⁻⁵ that reproduces the full solve’s manifold error to within 7%.</p>
  </div>
`

interface Els {
  stage: HTMLElement
  panel: HTMLElement
}

export class Hall {
  private device: GPUDevice | null = null
  private deviceError: string | null = null
  private mode: BigMode | null = null
  private renderer: ValveFieldRenderer | null = null
  private running = false
  private visible = false
  private settings: CrossbarSettings = { ...BIG_WATER }
  private activity: { act: Float32Array; meta: Float32Array } | null = null
  private labelEls: { el: HTMLElement; x0: number; y0: number; w: number; h: number; kind: 'bay' | 'rect' }[] = []
  private tileCache: { key: string; pos: Float32Array; neg: Float32Array; half: Uint16Array; wmax: number } | null = null
  private tilePending = ''
  private $: <T extends HTMLElement>(id: string) => T

  constructor(els: Els) {
    els.stage.innerHTML = STAGE_HTML
    els.panel.innerHTML = PANEL_HTML
    this.$ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
    const $ = this.$
    buildNonIdeal(
      $('h-nonideal'),
      {
        title: 'How well the machine was built',
        caption:
          'The same settings as for calc-gpt. A change rebuilds the machine from the same weights and calibrates every tile again (a fraction of a second on a GPU).',
        presets: [
          { label: 'Ideal', s: IDEAL },
          { label: 'Museum', s: BIG_WATER },
          { label: 'Workshop', s: { bits: 5, noise: 0.01, lambda: 1e-4, seed: 1 } },
          { label: 'Leaky', s: { bits: 4, noise: 0.02, lambda: 1e-4, seed: 1 } },
        ],
        maxLambda: 1e-4,
      },
      this.settings,
      (s) => {
        this.settings = { ...s, errors: 'hash', ir: 'first-order' }
        this.mode?.setSettings(this.settings)
        this.tileCache = null
      },
    )
    const temp = $<HTMLInputElement>('h-temp')
    const ntok = $<HTMLInputElement>('h-ntok')
    const syncRange = (i: HTMLInputElement) => i.style.setProperty('--fill', `${((Number(i.value) - Number(i.min)) / (Number(i.max) - Number(i.min))) * 100}%`)
    temp.addEventListener('input', () => {
      $('h-temp-v').textContent = Number(temp.value).toFixed(2)
      syncRange(temp)
    })
    ntok.addEventListener('input', () => {
      $('h-ntok-v').textContent = ntok.value
      syncRange(ntok)
    })
    syncRange(temp)
    syncRange(ntok)
    $('h-load').addEventListener('click', () => void this.load())
    $('h-go').addEventListener('click', () => void this.generate())
    $('h-stop').addEventListener('click', () => (this.running = false))
    $('h-home').addEventListener('click', () => this.renderer?.home())
    $<HTMLSelectElement>('h-layer').addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value
      if (!v || !this.renderer) return
      if (v === 'lm_head' || v === 'wpe') this.renderer.flyToGrid(v)
      else this.renderer.flyToLayer(Number(v.slice(1)))
    })
    $('h-random').addEventListener('click', () => this.randomValve())
    ;(window as unknown as { __hall: unknown }).__hall = {
      hall: this,
      load: () => this.load(),
      generate: () => this.generate(),
      compareCpu: (text: string, s?: CrossbarSettings) => this.compareCpu(text, s),
      selftest: () => this.selftest(),
    }
  }

  get state() {
    return { mode: this.mode, renderer: this.renderer, device: this.device, settings: this.settings, running: this.running }
  }

  /** Show the hall for a big mode (called by the app's mode switcher). */
  async show(mode: BigMode): Promise<void> {
    this.visible = true
    if (this.mode !== mode) {
      this.running = false
      this.mode = mode
      this.selectModel()
    }
    this.renderer?.start()
    await this.ensureDevice()
    this.selectModel()
    if (params.get('autoload') === '1' && !mode.loaded) void this.load()
  }

  hide(): void {
    this.visible = false
    this.running = false
    this.renderer?.stop()
  }

  private async ensureDevice(): Promise<void> {
    if (this.device || this.deviceError) return
    const $ = this.$
    try {
      this.device = await requestMachineDevice()
      this.device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', (e as GPUUncapturedErrorEvent).error.message))
      this.device.lost.then((info) => {
        console.error('WebGPU device lost:', info.reason, info.message)
        $('h-nogpu').hidden = false
        $('h-nogpu-detail').textContent = `The graphics device was lost (${info.message || info.reason}). Reload the page to try again.`
      })
    } catch (err) {
      this.deviceError = (err as Error).message
    }
  }

  private selectModel(): void {
    const $ = this.$
    const mode = this.mode
    if (!mode) return
    const info = BIG_MODELS[mode.id]
    const prompt = $<HTMLTextAreaElement>('h-prompt')
    if (!prompt.value || Object.values(BIG_MODELS).some((x) => x.prompt === prompt.value)) prompt.value = info.prompt
    const ex = $('h-examples')
    ex.innerHTML = ''
    for (const e of mode.copy.examples) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = e.length > 28 ? e.slice(0, 26) + '…' : e
      b.title = e
      b.addEventListener('click', () => {
        prompt.value = e
        if (mode.loaded) void this.generate()
      })
      ex.append(b)
    }
    const loadBtn = $<HTMLButtonElement>('h-load')
    const gpuMissing = !this.device && this.deviceError
    $('h-nogpu').hidden = !gpuMissing
    if (gpuMissing) $('h-nogpu-detail').textContent = `${NO_GPU_TEXT} (${this.deviceError})`
    $('h-note').hidden = !!gpuMissing || (mode.loaded && !!mode.machine)
    loadBtn.disabled = !this.device || mode.loaded
    loadBtn.textContent = mode.loaded ? 'Reservoirs full' : `Fill the reservoirs · ${info.approxMB} MB`
    $<HTMLButtonElement>('h-go').disabled = !mode.loaded || !mode.machine || this.running
    const files = resolveFiles(mode.id, params)
    isCached(files.weights).then((hit) => {
      if (hit && !mode.loaded) loadBtn.textContent = 'Fill the reservoirs · from your cache'
    })
    if (matchMedia('(max-width: 720px), (pointer: coarse)').matches)
      $('h-load-fine').textContent = `On a phone this is a heavy download (${info.approxMB} MB) and a lot of graphics memory; TinyStories is the gentler of the two.`
    // the renderer belongs to one model at a time
    if (this.renderer && mode.machine && this.renderer.machine !== mode.machine) this.attachRenderer(mode, mode.machine)
  }

  private attachRenderer(mode: BigMode, machine: GpuMachine): void {
    this.renderer?.destroy()
    const r = new ValveFieldRenderer(this.device!, this.$<HTMLCanvasElement>('h-field'), machine, machine.w, params.get('present') === 'readback' ? 'readback' : 'canvas')
    this.renderer = r
    r.onHover = (h) => this.showPlaque(h)
    r.onFrame = () => this.placeLabels()
    r.renderScale = Math.min(1, Math.max(0.1, Number(params.get('rscale') ?? 1)))
    this.buildLabels()
    this.buildLayerMenu()
    if (!params.has('norender') && this.visible) r.start()
    void mode
  }

  async load(): Promise<void> {
    const mode = this.mode
    const device = this.device
    if (!mode || !device || mode.loaded) return
    const $ = this.$
    const loadBtn = $<HTMLButtonElement>('h-load')
    loadBtn.disabled = true
    $<HTMLButtonElement>('h-go').disabled = true
    this.renderer?.destroy()
    this.renderer = null
    $('h-note').hidden = true
    $('h-fill').hidden = false
    mode.opts = {
      ...mode.opts,
      gpu: { device, settings: this.settings },
      keepHalf: params.has('keephalf'),
      onMachine: (_w, machine) => this.attachRenderer(mode, machine!),
      onBand: (e) => this.renderer?.onBand(e),
    }
    const t0 = performance.now()
    const fmtMB = (b: number) => (b / 1e6).toFixed(b < 1e8 ? 1 : 0)
    try {
      await mode.load((p) => {
        loadBtn.textContent =
          p.phase === 'weights' ? 'Filling…' : p.phase === 'ready' ? 'Reservoirs full' : p.phase === 'finalizing' ? 'Calibrating every tile…' : 'Opening the sluices…'
        if (p.totalBytes) {
          $('h-fill-mb').textContent = `${fmtMB(p.bytes)} / ${fmtMB(p.totalBytes)} MB`
          $('h-fill-bar').style.width = `${Math.min(100, (100 * p.bytes) / p.totalBytes).toFixed(1)}%`
        }
        $('h-fill-valves').textContent = `${fmtValves(p.valves)} of ${fmtValves(p.totalValves)} valves set`
        $('h-fill-src').textContent = p.phase === 'weights' ? (p.fromCache ? 'from your browser cache' : `from ${p.host}`) : ''
      })
      $('h-fill-valves').textContent = `all ${fmtValves(mode.modelWeights!.totalValves)} valves set in ${((performance.now() - t0) / 1000).toFixed(1)} s`
      setTimeout(() => ($('h-fill').hidden = true), 2500)
      if (this.mode === mode) this.selectModel()
    } catch (err) {
      console.error(err)
      $('h-fill').hidden = true
      $('h-note').hidden = false
      $('h-note').innerHTML = `<p class="note-title">The sluices jammed</p><p>${escapeHtml(String((err as Error).message ?? err))}</p>`
      loadBtn.disabled = false
      loadBtn.textContent = 'Try again'
    }
  }

  async generate(): Promise<void> {
    const mode = this.mode
    const r = this.renderer
    const $ = this.$
    if (!mode?.machine || !r || this.running) return
    const machine = mode.machine
    this.running = true
    $<HTMLButtonElement>('h-go').disabled = true
    $<HTMLButtonElement>('h-stop').disabled = false
    const out = $('h-output')
    const promptText = $<HTMLTextAreaElement>('h-prompt').value
    const ids = mode.encode(promptText)
    if (ids.length === 0) ids.push(mode.stopToken)
    const promptLen = ids.length
    out.innerHTML = `<span class="prompt">${escapeHtml(promptText)}</span><span class="gen"></span><span class="caret"></span>`
    const gen = out.querySelector('.gen') as HTMLElement
    const w = machine.w
    const order = machine.program.filter((op) => op.kind === 'matmul').map((op) => w.grid((op as { grid: string }).grid).id)
    const slow = () => $<HTMLInputElement>('h-slowmo').checked
    const nNew = Number($<HTMLInputElement>('h-ntok').value)
    const temperature = Number($<HTMLInputElement>('h-temp').value)
    let made = 0
    const t0 = performance.now()
    let computeMs = 0
    let lastMs = 0
    try {
      for (let i = 0; i < nNew && this.running; i++) {
        if (ids.length >= machine.ctx) break
        const ts = performance.now()
        const logits = await machine.step(ids)
        lastMs = performance.now() - ts
        if (i > 0) computeMs += lastMs
        const next = sample(logits, temperature, 40)
        ids.push(next)
        made++
        gen.textContent = mode.decode(ids.slice(promptLen))
        // the water's path through the machine for this token
        const sweep = slow() ? 0.07 : Math.min(0.025, Math.max(0.006, lastMs / 1000 / order.length))
        const now = r.now()
        order.forEach((g, k) => r.activate(g, now + k * sweep))
        machine.readActivity().then((a) => (this.activity = a))
        if (slow()) {
          for (let k = 0; k < order.length && this.running; k++) {
            const spec = w.specs[order[k]]
            if (k % 4 === 0 || spec.layer < 0) {
              if (spec.layer >= 0) r.flyToLayer(spec.layer)
              else r.flyToGrid(spec.name)
            }
            await new Promise((res) => setTimeout(res, sweep * 1000 * (k % 4 === 3 ? 4 : 1)))
          }
        } else await new Promise((res) => setTimeout(res, 0))
        const el = (performance.now() - t0) / 1000
        const per = made > 1 ? computeMs / (made - 1) : lastMs
        $('h-stats').textContent = `${made} tokens · ${(made / el).toPrecision(2)} tokens/s overall · ${per.toFixed(0)} ms of water per token (${(1000 / per).toPrecision(2)}/s)`
        if (next === mode.stopToken) break
      }
    } catch (err) {
      console.error(err)
      $('h-stats').textContent = `The machine stalled: ${(err as Error).message}`
    } finally {
      out.querySelector('.caret')?.remove()
      this.running = false
      $<HTMLButtonElement>('h-go').disabled = false
      $<HTMLButtonElement>('h-stop').disabled = true
    }
  }

  // ---------------------------------------------------------------- labels + plaque
  private buildLabels(): void {
    const root = this.$('h-labels')
    root.innerHTML = ''
    this.labelEls = []
    const r = this.renderer!
    const w = r.machine.w
    for (const b of r.layout.bays) {
      const el = document.createElement('div')
      el.className = 'lbl bay'
      el.textContent = `Layer ${b.layer + 1}`
      root.appendChild(el)
      this.labelEls.push({ el, ...b, kind: 'bay' })
    }
    const vb = r.layout.vocabBay
    const v = document.createElement('div')
    v.className = 'lbl bay'
    v.textContent = `Embedding and vocabulary · ${w.cfg.vocab.toLocaleString('en-US')} collector pairs, also read backwards as the embedding`
    root.appendChild(v)
    this.labelEls.push({ el: v, ...vb, kind: 'bay' })
    for (const rect of r.layout.rects) {
      if (rect.layer === -1 && rect.bank > 0) continue
      const el = document.createElement('div')
      el.className = 'lbl rect'
      const g = w.grids[rect.grid]
      el.innerHTML =
        rect.kind !== 'weights'
          ? `${rect.label} <span>${rect.h}×${rect.w}</span>`
          : rect.layer === -1
            ? `Output head <span>${g.rows}×${g.cols}</span>`
            : `${rect.label} <span>${g.rows}×${g.cols}</span>`
      if (rect.kind !== 'weights') el.classList.add('kv')
      root.appendChild(el)
      this.labelEls.push({ el, x0: rect.x0, y0: rect.y0, w: rect.w, h: rect.h, kind: 'rect' })
    }
  }

  private placeLabels(): void {
    const r = this.renderer
    if (!r) return
    const s = r.camera.scale
    const cw = r.canvas.clientWidth
    const ch = r.canvas.clientHeight
    for (const L of this.labelEls) {
      const p = r.toScreen(L.x0, L.y0)
      const q = r.toScreen(L.x0 + L.w, L.y0 + L.h)
      const wpx = L.w / s
      const onScreen = q.x > 40 && p.x < cw - 40 && q.y > 0 && p.y < ch
      const vis = onScreen && (L.kind === 'bay' ? wpx > 140 && wpx < 9000 : wpx > 200 && wpx < 30000)
      L.el.style.opacity = vis ? '1' : '0'
      if (vis) {
        const x = Math.min(Math.max(p.x, 8), q.x - 160)
        L.el.style.transform = `translate(${x.toFixed(1)}px, ${(p.y - (L.kind === 'bay' ? 54 : 20)).toFixed(1)}px)`
      }
    }
    this.$('h-zoomhint').style.opacity = s < 0.5 ? '0' : '1'
  }

  /** Put the plaque beside the valve (right, else left, else below/above), never over it. */
  private placePlaque(el: HTMLElement, h: HoverInfo): void {
    const stage = el.parentElement!.getBoundingClientRect()
    const W = el.offsetWidth || 290
    const H = el.offsetHeight || 130
    const half = h.cellPx / 2
    let x = h.sx + half + 14
    let y = h.sy - H / 2
    if (x + W > stage.width - 8) x = h.sx - half - 14 - W
    if (x < 8) {
      x = h.sx - W / 2
      y = h.sy + half + 14
      if (y + H > stage.height - 8) y = h.sy - half - 14 - H
    }
    x = Math.min(stage.width - W - 8, Math.max(8, x))
    y = Math.min(stage.height - H - 8, Math.max(8, y))
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`
  }

  /** The tile under a valve, read back from the GPU and realised on the CPU (same physics). */
  private requestTile(grid: number, tr: number, tc: number): void {
    const mode = this.mode
    const m = mode?.machine
    if (!m || !this.device) return
    const s = this.settings
    const key = `${grid}|${tr}|${tc}|${s.bits}|${s.noise}|${s.lambda}|${s.seed}`
    if (this.tileCache?.key === key || this.tilePending === key) return
    this.tilePending = key
    const g = m.w.grids[grid]
    const L = m.layout[grid]
    const idx = tr * g.tilesC + tc
    const dev = this.device
    const st = dev.createBuffer({ size: 8192 + 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const enc = dev.createCommandEncoder()
    enc.copyBufferToBuffer(m.vals, (L.valOff + idx * 2048) * 4, st, 0, 8192)
    enc.copyBufferToBuffer(m.wmax, (L.tileOff + idx) * 4, st, 8192, 4)
    dev.queue.submit([enc.finish()])
    void st.mapAsync(GPUMapMode.READ).then(() => {
      const buf = st.getMappedRange().slice(0)
      st.destroy()
      const half = new Uint16Array(buf, 0, 4096)
      const wmax = new Float32Array(buf, 8192, 1)[0]
      const k = Math.min(TILE, g.rows - tr * TILE)
      const n = Math.min(TILE, g.cols - tc * TILE)
      const pos = new Float32Array(k * n)
      const neg = new Float32Array(k * n)
      const signed = g.name !== 'wpe'
      realiseTile((i, j) => fromHalf(half[i * TILE + j]), k, n, signed, s, tileSeed(matrixSeed(g.name, s.seed), tr, tc), pos, signed ? neg : null)
      this.tileCache = { key, pos, neg, half, wmax }
      this.tilePending = ''
    })
  }

  private showPlaque(h: HoverInfo | null): void {
    const el = this.$('h-plaque')
    const mode = this.mode
    const m = mode?.machine
    if (!h || !m) {
      el.hidden = true
      return
    }
    const cfg = m.w.cfg
    if (h.rect.kind !== 'weights') {
      const hd = cfg.d / cfg.nHead
      const pos = h.rect.kind === 'keys' ? h.col : h.row
      const dim = h.rect.kind === 'keys' ? h.row : h.col
      const n = m.programmed
      el.innerHTML =
        `<div class="pl-where">Layer ${h.rect.layer + 1} · ${h.rect.kind === 'keys' ? 'key' : 'value'} valves (KV cache)</div>` +
        `<div class="pl-row">token position ${pos} · head ${Math.floor(dim / hd) + 1}, dimension ${dim % hd}</div>` +
        `<div class="pl-row">${pos < n ? 'set from the activations as this token flowed through, and reset with fresh errors at every step: these valves are set by data, not by training' : '<span class="dim">not set yet: no token has reached this position</span>'}</div>`
      el.hidden = false
      this.placePlaque(el, h)
      return
    }
    const g = m.w.grids[h.grid]
    const spec = m.w.specs[h.grid]
    const tr = Math.floor(h.row / TILE)
    const tc = Math.floor(h.col / TILE)
    this.requestTile(h.grid, tr, tc)
    const s = this.settings
    const t = this.tileCache
    const where = spec.layer >= 0 ? `Layer ${spec.layer + 1} · ${spec.label}` : spec.layer === -1 ? 'Output head · vocabulary' : 'Position table'
    const token = spec.layer === -1 ? ` · token “${escapeHtml(mode!.decode([h.col]))}”` : spec.layer === -2 ? ` · position ${h.row}` : ''
    let body = '<div class="pl-row dim">reading the valve…</div>'
    const key = `${h.grid}|${tr}|${tc}|${s.bits}|${s.noise}|${s.lambda}|${s.seed}`
    if (t && t.key === key) {
      const i = h.row - tr * TILE
      const j = h.col - tc * TILE
      const n = Math.min(TILE, g.cols - tc * TILE)
      const w = fromHalf(t.half[i * TILE + j])
      const L = s.bits === null ? 0 : (1 << s.bits) - 1
      const o = t.wmax > 0 ? Math.abs(w) / t.wmax : 0
      const stop = L ? Math.round(o * L) : null
      const realised = t.pos[i * n + j]
      let flowLine = '<span class="dim">no water has flowed here yet</span>'
      const a = this.activity
      if (a && spec.layer !== -2) {
        const lay = m.layout[h.grid]
        const head = a.act[lay.actOff + h.row]
        const y = a.act[lay.actOff + g.rows + h.col]
        flowLine = `reservoir head ${head >= 0 ? 'x⁺' : 'x⁻'} = ${Math.abs(head).toFixed(3)} · collector pair out ${y.toFixed(3)}`
      }
      body =
        `<div class="pl-w">${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(5)}</div>` +
        `<div class="pl-row">input ${h.row} → output ${h.col}${token}</div>` +
        `<div class="pl-row">valve ${stop === null ? `${(o * 100).toFixed(1)}%` : `${stop}/${L}`} open on the <b class="${w >= 0 ? 'pos' : 'neg'}">${w >= 0 ? '+' : '−'}</b> collector · tile scale ${t.wmax.toFixed(4)}</div>` +
        `<div class="pl-row">as built (stops, setting error, manifold, calibration): ${realised >= 0 ? '+' : '−'}${Math.abs(realised).toFixed(5)}</div>` +
        `<div class="pl-row">${flowLine}</div>`
    }
    el.innerHTML = `<div class="pl-where">${where}</div>${body}`
    el.hidden = false
    this.placePlaque(el, h)
  }

  private buildLayerMenu(): void {
    const sel = this.$<HTMLSelectElement>('h-layer')
    const w = this.renderer!.machine.w
    sel.innerHTML = '<option value="">Fly to…</option>'
    for (let l = 0; l < w.cfg.nLayer; l++) sel.innerHTML += `<option value="L${l}">Layer ${l + 1}</option>`
    sel.innerHTML += '<option value="wpe">Position table</option><option value="lm_head">Output head (vocabulary)</option>'
  }

  private randomValve(): void {
    const r = this.renderer
    if (!r) return
    const rects = r.layout.rects.filter((x) => x.kind === 'weights')
    const rect = rects[Math.floor(Math.random() * rects.length)]
    const row = Math.floor(Math.random() * rect.h)
    const col = rect.colStart + Math.floor(Math.random() * rect.w)
    r.flyToValve(rect.grid, row, col, Math.min(420, r.canvas.clientHeight * 0.55))
  }

  // ---------------------------------------------------------------- verification hooks

  /**
   * GPU logits vs the CPU water (LatticeBackend on the same half-float weights) for a real
   * loaded model. Needs the model loaded with `keepHalf` (?keephalf=1), since the browser
   * normally keeps the weights only on the GPU.
   */
  async compareCpu(text: string, s?: CrossbarSettings): Promise<Record<string, unknown>> {
    const mode = this.mode!
    const m = mode.machine!
    const ids = mode.encode(text)
    const settings = s ? { ...s, errors: 'hash' as const, ir: 'first-order' as const } : this.settings
    m.setPhysics(settings)
    const t0 = performance.now()
    const gpu = await m.step(ids)
    const tg = performance.now() - t0
    const specs = m.w.weightSpecs(true)
    const seq = new BigForward(m.w.cfg, (k) => m.w.v(k), new LatticeBackend(specs, settings))
    const t1 = performance.now()
    let cpu: Float32Array = new Float32Array(0)
    for (const t of ids) cpu = seq.step(t)
    const tc = performance.now() - t1
    m.setPhysics(this.settings)
    return compareLogits(gpu, cpu, { tokens: ids.length, gpuMs: tg, cpuMs: tc })
  }

  /** GPU machine vs CPU water on random models (no weight files needed); see gpu/check.ts. */
  async selftest(): Promise<Record<string, unknown>[]> {
    await this.ensureDevice()
    const { gpuSelfTest } = await import('../gpu/check.ts')
    return gpuSelfTest(this.device!)
  }
}

function compareLogits(gpu: Float32Array, cpu: Float32Array, extra: Record<string, unknown>): Record<string, unknown> {
  let maxAbs = 0
  let maxRef = 0
  for (let i = 0; i < cpu.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(gpu[i] - cpu[i]))
    maxRef = Math.max(maxRef, Math.abs(cpu[i]))
  }
  const top = (v: Float32Array) => Array.from(v.keys()).sort((a, b) => v[b] - v[a]).slice(0, 5)
  return { ...extra, maxAbs, maxRef, argmaxGpu: argmax(gpu), argmaxCpu: argmax(cpu), top5Gpu: top(gpu), top5Cpu: top(cpu) }
}

function fmtValves(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
