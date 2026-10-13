import './hall.css'
import { IDEAL, TILE, type CrossbarSettings } from '../../crossbar/tile.ts'
import { matrixSeed, tileSeed } from '../../crossbar/matrix.ts'
import { LatticeBackend, realiseTile } from '../../crossbar/lattice.ts'
import { buildNonIdeal } from '../../ui/nonideal.ts'
import { argmax } from '../forward.ts'
import { fromHalf } from '../grid.ts'
import { GpuMachine, requestMachineDevice } from '../gpu/machine.ts'
import { BIG_MODELS, BIG_WATER, BigMode } from '../mode.ts'
import { ValveFieldRenderer, type HoverInfo } from '../render/valve-field.ts'
import { valveWorld } from '../render/layout.ts'
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
    <p>Every weight of the model will be a valve here. Set the valves to begin, then type a prompt and let the water flow.</p>
  </div>
  <div id="h-nogpu" class="h-note" hidden>
    <p class="note-title">This hall needs WebGPU</p>
    <p id="h-nogpu-detail">${NO_GPU_TEXT}</p>
  </div>
  <div id="h-fill" hidden>
    <div class="fill-head"><span class="fill-title">Setting the valves</span><span id="h-fill-mb">0 / 0 MB</span></div>
    <div class="bar"><div id="h-fill-bar"></div></div>
    <div class="fill-foot"><span id="h-fill-valves">0 valves set</span><span id="h-fill-src"></span></div>
  </div>
  <div class="h-legend" id="h-legend">Each rectangle is one crossbar (a weight matrix), laid out layer by layer. Each dot is a valve: brightness is how far it is open, <span class="pos">blue</span> feeds a + collector, <span class="neg">orange</span> a − collector. Hover a valve to read it.</div>
  <div class="h-zoomhint" id="h-zoomhint">scroll to zoom · drag to pan · double-click to dive</div>
  <div id="h-tour-mark" hidden><span></span></div>
  <div id="h-tour" hidden role="dialog" aria-live="polite" aria-labelledby="h-tour-title">
    <p class="tour-step" id="h-tour-step"></p>
    <h4 id="h-tour-title"></h4>
    <div class="tour-body" id="h-tour-body"></div>
    <div class="tour-nav">
      <button type="button" id="h-tour-prev">‹ Back</button>
      <button type="button" id="h-tour-next" class="primary">Next ›</button>
      <button type="button" id="h-tour-end">End tour</button>
    </div>
  </div>
`

const PANEL_HTML = /* html */ `
  <div class="group">
    <div class="row-buttons"><button type="button" id="h-load" class="primary">Set the valves</button></div>
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
      <div class="slider-row"><label><span>New tokens</span><output id="h-ntok-v">40</output></label><input id="h-ntok" type="range" min="1" max="200" step="1" value="40" aria-label="New tokens" /></div>
    </div>
    <div class="row-buttons"><button type="button" id="h-tour-go" disabled>Follow one word through the machine</button></div>
    <p class="fine">A guided tour, one step at a time: the camera flies to each crossbar and circuit while the water works out the next word.</p>
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
    <h3>What is water and what is not</h3>
    <ul class="split">
      <li><span class="pos">crossbars</span> Every matrix product: the token embedding (the vocabulary bank read backwards), the position table, Q·K·V, attention scores QKᵀ and attention·V (valves set on the fly from the cached keys and values), attention out, MLP up and down, and the output head.</li>
      <li><span class="pos">circuits</span> Everything in between, also water: softmax is a check-valve max node, valves profiled to open as e<sup>s/√d</sup> and a flow divider; layer norm is two averaging nodes, orifices for the square and the square root, and valves opened in proportion to σ; GELU is a spring-loaded check valve profiled to open as Φ(x). Bias and residual adds are flows merging; pressure regulators turn each collector's flow into the next reservoir's head. Every part has its own manufacturing error.</li>
      <li><span class="pos">read-out</span> Water too: every output collector feeds one node through its own check valve, and the collector that fills it is the next token.</li>
      <li><span class="dig">not water</span> Only the keyboard: your text is split into tokens, and each token opens its reservoir.</li>
    </ul>
    <p class="fine">Same water as calc-gpt, built from 64 × 64 crossbar blocks: x⁺/x⁻ reservoirs and +/− collectors, valve stops, a setting error on every valve and a calibrated regulator on every collector. Pipe friction is solved approximately here (to first order), because a full solve for 10⁸ valves is out of reach; at the Museum setting that is within 7% of the full solve.</p>
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
    const ntok = $<HTMLInputElement>('h-ntok')
    const syncRange = (i: HTMLInputElement) => i.style.setProperty('--fill', `${((Number(i.value) - Number(i.min)) / (Number(i.max) - Number(i.min))) * 100}%`)
    ntok.addEventListener('input', () => {
      $('h-ntok-v').textContent = ntok.value
      syncRange(ntok)
    })
    syncRange(ntok)
    $('h-load').addEventListener('click', () => void this.load())
    $('h-go').addEventListener('click', () => void this.generate())
    $('h-stop').addEventListener('click', () => (this.running = false))
    $('h-tour-go').addEventListener('click', () => void this.startTour())
    $('h-tour-next').addEventListener('click', () => this.showStop(this.tourAt + 1))
    $('h-tour-prev').addEventListener('click', () => this.showStop(this.tourAt - 1))
    $('h-tour-end').addEventListener('click', () => this.endTour())
    addEventListener('keydown', (e) => {
      if ($('h-tour').hidden || (e.target as HTMLElement).closest('textarea, input')) return
      if (e.key === 'ArrowRight') this.showStop(this.tourAt + 1)
      if (e.key === 'ArrowLeft') this.showStop(this.tourAt - 1)
      if (e.key === 'Escape') this.endTour()
    })
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
    loadBtn.textContent = mode.loaded ? 'Valves set' : `Set the valves · download ${info.approxMB} MB`
    $<HTMLButtonElement>('h-go').disabled = !mode.loaded || !mode.machine || this.running
    $<HTMLButtonElement>('h-tour-go').disabled = !mode.loaded || !mode.machine || this.running
    const files = resolveFiles(mode.id, params)
    isCached(files.weights).then((hit) => {
      if (hit && !mode.loaded) loadBtn.textContent = 'Set the valves · from your cache'
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
          p.phase === 'weights' ? 'Setting valves…' : p.phase === 'ready' ? 'Valves set' : p.phase === 'finalizing' ? 'Calibrating every block…' : 'Opening the valve store…'
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
      $('h-note').innerHTML = `<p class="note-title">The valves could not be set</p><p>${escapeHtml(String((err as Error).message ?? err))}</p>`
      loadBtn.disabled = false
      loadBtn.textContent = 'Try again'
    }
  }

  async generate(): Promise<void> {
    const mode = this.mode
    const r = this.renderer
    const $ = this.$
    if (!mode?.machine || !r || this.running) return
    this.endTour()
    const machine = mode.machine
    this.running = true
    $<HTMLButtonElement>('h-go').disabled = true
    $<HTMLButtonElement>('h-tour-go').disabled = true
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
    const nNew = Number($<HTMLInputElement>('h-ntok').value)
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
        // read out in water: every output collector feeds one node through its own check
        // valve, and the collector that fills that node is the next token
        const next = argmax(logits)
        ids.push(next)
        made++
        gen.textContent = mode.decode(ids.slice(promptLen))
        // the water's path through the machine for this token
        const sweep = Math.min(0.025, Math.max(0.006, lastMs / 1000 / order.length))
        const now = r.now()
        order.forEach((g, k) => r.activate(g, now + k * sweep))
        machine.readActivity().then((a) => (this.activity = a))
        await new Promise((res) => setTimeout(res, 0))
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
      $<HTMLButtonElement>('h-tour-go').disabled = false
      $<HTMLButtonElement>('h-stop').disabled = true
    }
  }

  // ---------------------------------------------------------------- guided tour

  private tourStops: TourStop[] = []
  tourAt = 0
  private tourFlight = 0
  private tourMark: TourStop['mark'] | null = null

  /** Work out the next word in water, then walk through how the machine did it, one stop at a time. */
  async startTour(): Promise<void> {
    const mode = this.mode
    const r = this.renderer
    const $ = this.$
    if (!mode?.machine || !r || this.running) return
    const m = mode.machine
    const promptText = $<HTMLTextAreaElement>('h-prompt').value
    const ids = mode.encode(promptText)
    if (ids.length === 0) ids.push(mode.stopToken)
    if (ids.length >= m.ctx) return
    this.running = true
    $<HTMLButtonElement>('h-go').disabled = true
    $<HTMLButtonElement>('h-tour-go').disabled = true
    let next = 0
    let probe: NeuronProbe | null = null
    try {
      // capture layer 1's MLP-up crossbar: its reservoir levels and its outputs, for the zoom-in
      const fcName = 'L0.fc'
      m.captureOp = m.program.findIndex((op) => op.kind === 'matmul' && op.grid === fcName)
      const logits = await m.step(ids)
      this.activity = await m.readActivity()
      next = argmax(logits)
      const cap = await m.readCapture()
      if (cap) {
        const fc = m.w.grid(fcName)
        // the most active neuron (after its GELU valve), and the valve that feeds it most
        const c = argmax(cap.y.subarray(0, fc.cols))
        const { w, wmax } = await m.readColumn(fc.id, c)
        const x = cap.x.subarray(0, fc.rows)
        let sum = 0
        const contrib = Array.from(x, (xi, i) => {
          sum += xi * w[i]
          return { i, x: xi, w: w[i], wmax: wmax[i], f: xi * w[i] }
        })
        const byFlow = [...contrib].sort((p, q) => q.f - p.f)
        const valve = byFlow.find((v) => v.x > 0 && v.w > 0) ?? byFlow[0]
        const lay = m.layout[fc.id]
        probe = {
          grid: fc.id,
          col: c,
          rows: fc.rows,
          cols: fc.cols,
          valve,
          top: byFlow.slice(0, 3),
          bottom: byFlow.slice(-2).reverse(),
          sum,
          built: this.activity.act[lay.actOff + fc.rows + c],
          bias: m.w.v(`${fcName}.b`)[c],
          out: cap.y[c],
        }
      }
    } finally {
      m.captureOp = null
      this.running = false
    }
    $('h-output').innerHTML = `<span class="prompt">${escapeHtml(promptText)}</span><span class="gen"></span>`
    this.tourStops = tourStops(mode, r, ids[ids.length - 1], next, probe, () => {
      ;($('h-output').querySelector('.gen') as HTMLElement).textContent = mode.decode([next])
    })
    $('h-tour').hidden = false
    this.showStop(0)
  }

  showStop(i: number): void {
    const stops = this.tourStops
    if (!stops.length || this.$('h-tour').hidden) return
    if (i >= stops.length) return this.endTour()
    this.tourAt = Math.max(0, i)
    const s = stops[this.tourAt]
    const $ = this.$
    $('h-tour-step').textContent = `Step ${this.tourAt + 1} of ${stops.length} · ${s.kind}`
    $('h-tour-title').textContent = s.title
    $('h-tour-body').innerHTML = s.body
    $<HTMLButtonElement>('h-tour-prev').disabled = this.tourAt === 0
    $('h-tour-next').textContent = this.tourAt === stops.length - 1 ? 'Finish' : 'Next ›'
    const flight = ++this.tourFlight
    this.tourMark = s.mark ?? null
    const mk = $('h-tour-mark')
    mk.hidden = !s.mark
    if (s.mark) (mk.firstElementChild as HTMLElement).textContent = s.mark.label
    void s.enter(() => flight === this.tourFlight)
  }

  endTour(): void {
    this.tourFlight++
    this.tourMark = null
    this.$('h-tour-mark').hidden = true
    this.tourStops = []
    this.$('h-tour').hidden = true
    const mode = this.mode
    this.$<HTMLButtonElement>('h-go').disabled = !mode?.machine || this.running
    this.$<HTMLButtonElement>('h-tour-go').disabled = !mode?.machine || this.running
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
            ? `Vocabulary bank <span>${g.rows}×${g.cols}</span>`
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
    const m = this.tourMark
    if (m) {
      const p = r.toScreen(m.x0, m.y0)
      const q = r.toScreen(m.x0 + m.w, m.y0 + m.h)
      const el = this.$('h-tour-mark')
      const w = Math.max(8, q.x - p.x)
      el.style.transform = `translate(${(p.x - (w - (q.x - p.x)) / 2 - 3).toFixed(1)}px, ${(p.y - 3).toFixed(1)}px)`
      el.style.width = `${w + 6}px`
      el.style.height = `${Math.max(8, q.y - p.y) + 6}px`
    }
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
    const where = spec.layer >= 0 ? `Layer ${spec.layer + 1} · ${spec.label}` : spec.layer === -1 ? 'Vocabulary bank' : 'Position table'
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
        flowLine = `reservoir level ${head >= 0 ? 'x⁺' : 'x⁻'} = ${Math.abs(head).toFixed(3)} · collector pair out ${y.toFixed(3)}`
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

interface TourStop {
  kind: 'crossbar' | 'water circuit' | 'read-out' | 'input'
  title: string
  body: string
  /** Fly the camera and light the crossbars; `alive()` turns false when the visitor moves on. */
  enter: (alive: () => boolean) => void | Promise<void>
  /** A world rect to ring on the stage (e.g. one token's column), with a label. */
  mark?: { x0: number; y0: number; w: number; h: number; label: string }
}

interface NeuronProbe {
  grid: number
  col: number
  rows: number
  cols: number
  /** The valve that feeds the neuron most: input row i, level x, weight w, its tile's w_max, flow f. */
  valve: { i: number; x: number; w: number; wmax: number; f: number }
  top: { i: number; x: number; w: number; f: number }[]
  bottom: { i: number; x: number; w: number; f: number }[]
  /** Σ x·w with the factory weights, and what the as-built crossbar's collector pair gave. */
  sum: number
  built: number
  bias: number
  /** After the bias inflow and the GELU valve. */
  out: number
}

function tourStops(mode: BigMode, r: ValveFieldRenderer, last: number, next: number, probe: NeuronProbe | null, reveal: () => void): TourStop[] {
  const w = r.machine.w
  const { d, nHead, nLayer, vocab } = w.cfg
  const id = (n: string) => w.grid(n).id
  const n = (x: number) => x.toLocaleString('en-US')
  const f2 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2)
  const f3 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3)
  const valves = (name: string) => {
    const g = w.grids[id(name)]
    return n(g.rows * g.cols)
  }
  const totalValves = n(w.grids.reduce((a, g) => a + g.rows * g.cols, 0))
  const word = (t: number) => `<q>${escapeHtml(mode.decode([t]))}</q>`
  const light = (...names: string[]) => {
    const t = r.now()
    names.forEach((g, k) => r.activate(id(g), t + k * 0.15))
  }
  const L = (l: number, k: string) => `L${l}.${k}`
  const column = (grid: number, col: number, rows: number, label: string): TourStop['mark'] => {
    const p = valveWorld(r.layout, grid, 0, col)
    return p ? { x0: p.x, y0: p.y, w: 1, h: rows, label } : undefined
  }
  const stops: TourStop[] = [
    {
      kind: 'input',
      title: 'Your last word opens its reservoirs',
      body: `<p>The input is the last token of your prompt, ${word(last)} (token #${n(last)}). A digital computer would look it up in memory. Here it is a <b>place</b> in the machine: that token's own column of ${n(d)} valves in the vocabulary bank.</p>
        <p>Water is driven backwards through that column, and a row of the position table adds where the word sits in the text. Out come ${n(d)} water levels: the word, as ${n(d)} numbers held as the heights of ${n(d)} reservoirs. Now let's follow them, starting as close up as we can get.</p>`,
      enter: () => {
        r.flyToColumn(id('lm_head'), last, d)
        light('lm_head', 'wpe')
      },
      mark: column(id('lm_head'), last, d, `the column of ${mode.decode([last]).trim() || 'this token'}`),
    },
  ]
  if (probe) {
    const v = probe.valve
    const open = v.wmax > 0 ? Math.abs(v.w) / v.wmax : 0
    const row = (c: { i: number; x: number; w: number; f: number }) =>
      `<tr><td>reservoir ${c.i}</td><td>${f2(c.x)}</td><td>× ${f3(c.w)}</td><td class="${c.f >= 0 ? 'pos' : 'neg'}">= ${f3(c.f)}</td></tr>`
    stops.push(
      {
        kind: 'crossbar',
        title: 'Zoom in: one valve, one multiplication',
        body: `<p>This is one valve deep inside layer 1, in the crossbar called <i>MLP up</i>. Its reservoir (input ${v.i}) stands at level <b>${f2(v.x)}</b>. The valve was set at the factory to a weight of <b>${f3(v.w)}</b>: ${(open * 100).toFixed(0)}% of its tubes are open (a fully open valve is the largest weight in its block).</p>
          <p>Pressure pushes water through it in proportion to both, so <b>${f2(v.x)} × ${f3(v.w)} = ${f3(v.f)}</b> units flow out. That's one multiplication, done by plumbing. It is real: these are this word's levels and the model's own weight.</p>`,
        enter: () => {
          r.flyToValve(probe.grid, v.i, probe.col, Math.min(360, r.canvas.clientHeight * 0.5))
          light('L0.fc')
        },
        mark: (() => {
          const p = valveWorld(r.layout, probe.grid, v.i, probe.col)
          return p ? { x0: p.x, y0: p.y, w: 1, h: 1, label: 'this valve' } : undefined
        })(),
      },
      {
        kind: 'crossbar',
        title: `Zoom out: one column, one neuron`,
        body: `<p>That valve is one of ${n(probe.rows)} in its column. Every one of them pours its own product into the same collector, and the collector simply holds the total:</p>
          <table class="tour-sum">${probe.top.map(row).join('')}<tr><td colspan="4" class="dim">… ${n(probe.rows - 5)} more …</td></tr>${probe.bottom.map(row).join('')}
          <tr class="tot"><td>collector</td><td colspan="2">Σ of all ${n(probe.rows)}</td><td>= ${f3(probe.built)}</td></tr></table>
          <p>That's a <b>dot product</b>: ${n(probe.rows)} multiplications and their sum, at once. A fixed inflow adds the bias (${f3(probe.bias)}), and a <b>GELU valve</b> (a spring-loaded check valve) lets ${f3(probe.out)} through. That number is one <b>neuron</b>.</p>
          <p class="tour-fine">With perfect valves the sum would be ${f3(probe.sum)}; the machine as built gives ${f3(probe.built)}. The difference is the manufacturing error.</p>`,
        enter: () => {
          r.flyToColumn(probe.grid, probe.col, probe.rows)
          light('L0.fc')
        },
        mark: column(probe.grid, probe.col, probe.rows, 'one neuron'),
      },
      {
        kind: 'crossbar',
        title: `Zoom out: one crossbar, ${n(probe.cols)} neurons at once`,
        body: `<p>Here is the whole crossbar: ${n(probe.cols)} columns like that one, side by side, ${valves('L0.fc')} valves in all. Every column fills its collector at the same moment.</p>
          <p>That's the point of an <b>analogue computer</b>. A digital chip would grind through these ${valves('L0.fc')} multiply-adds a few at a time. Here they aren't steps at all: water flows through every valve at once, and making the grid bigger doesn't make it slower.</p>`,
        enter: () => {
          r.flyToGrid('L0.fc')
          light('L0.fc')
        },
      },
    )
  }
  stops.push(
    {
      kind: 'crossbar',
      title: 'Zoom out: one layer',
      body: `<p>The MLP is one of several stages in layer 1. In the order the water goes:</p>
        <p><b>LayerNorm</b>, a water circuit that evens out the levels → <b>Q·K·V</b> (${valves(L(0, 'qkv'))} valves), which gives each word a query, a key and a value → <b>attention</b> → <b>attention out</b> → another LayerNorm → <b>MLP up</b> with its GELU valves (where we just were) → <b>MLP down</b>, back to ${n(d)} levels.</p>
        <p>The result merges into the word's running levels: two flows meeting in a pipe.</p>`,
      enter: () => {
        r.flyToLayer(0)
        light(L(0, 'qkv'), L(0, 'attn_out'), L(0, 'fc'), L(0, 'proj'))
      },
    },
    {
      kind: 'crossbar',
      title: 'Attention: valves set by the words themselves',
      body: `<p>One stage is different. These valves were not set at the factory: every earlier word left its key behind as a <b>column</b> of valves here, and its value as a <b>row</b>.</p>
        <p>The new word's query fills the reservoirs, and each column measures how well an earlier word matches. The <b>softmax circuit</b> turns those scores into shares: check valves find the best score, valves that open exponentially pass the others, and a fixed inflow splits between them, so the shares always add up to 1. The shares then blend the earlier words' values. ${n(nHead)} heads do this side by side.</p>`,
      enter: () => r.flyToCache(0),
    },
  )
  if (nLayer > 1)
    stops.push({
      kind: 'crossbar',
      title: `Zoom out: the whole machine`,
      body: `<p>Layer 1 is one bay of ${n(nLayer)}. Each has the same plumbing with its own valves, and the levels pass from bay to bay. Watch the water work its way through: <b id="h-tour-layer">layer 1 of ${n(nLayer)}</b>.</p>
        <p class="tour-fine">The whole machine holds ${totalValves} factory-set valves, plus the attention valves that the words set as they pass.</p>`,
      enter: async (alive) => {
        r.home()
        await new Promise((res) => setTimeout(res, 900))
        for (let l = 0; l < nLayer && alive(); l++) {
          light(L(l, 'qkv'), L(l, 'attn_out'), L(l, 'fc'), L(l, 'proj'))
          const el = document.getElementById('h-tour-layer')
          if (el) el.textContent = `layer ${l + 1} of ${nLayer}`
          await new Promise((res) => setTimeout(res, Math.max(350, 7000 / nLayer)))
        }
      },
    })
  stops.push(
    {
      kind: 'crossbar',
      title: 'Zoom in: one collector for every word',
      body: `<p>A last LayerNorm circuit, then the largest crossbar of all: ${n(d)} reservoirs × ${n(vocab)} collectors, ${valves('lm_head')} valves. It is the same bank the input word came from, now used forwards.</p>
        <p>Each collector gathers a score for one token of the vocabulary: how well that token would fit next.</p>`,
      enter: () => {
        r.flyToGrid('lm_head')
        light('lm_head')
      },
    },
    {
      kind: 'read-out',
      title: 'Read-out: the fullest collector wins',
      body: `<p>All ${n(vocab)} collectors drain into one node, each through its own check valve. Water only flows forwards through a check valve, so the node rises to the level of the fullest collector, and only that collector keeps flowing.</p>
        <p>The winner is token #${n(next)}: ${word(next)}. It is added to the text, and the whole machine runs again for the word after.</p>
        <p class="tour-fine">The only part that isn't water is the keyboard: turning your text into which reservoir to open.</p>`,
      enter: () => {
        r.flyToColumn(id('lm_head'), next, d)
        light('lm_head')
        reveal()
      },
      mark: column(id('lm_head'), next, d, `the winner: ${mode.decode([next]).trim() || 'this token'}`),
    },
  )
  return stops
}
