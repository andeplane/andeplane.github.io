import './style.css'
import { DEFAULT_WATER, TILE, type Physics } from '../crossbar.ts'
import { requestMachineDevice } from '../gpu/machine.ts'
import { BIG_MODELS, BigMode, type BigModelId, type LoadProgress } from '../mode.ts'
import { ValveFieldRenderer, type HoverInfo } from '../render/valve-field.ts'
import { sample } from '../runner-cpu.ts'
import { isCached, resolveFiles } from '../weights/source.ts'

/**
 * Standalone harness for the hall of valves (big.html). The integrated water-gpt app
 * can reuse the same pieces: BigMode (load/tokenize/step) + ValveFieldRenderer.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)

const state = {
  model: (params.get('model') === 'tinystories' ? 'tinystories' : 'gpt2') as BigModelId,
  device: null as GPUDevice | null,
  mode: null as BigMode | null,
  renderer: null as ValveFieldRenderer | null,
  running: false,
  physics: { ...DEFAULT_WATER } as Physics,
  activity: null as { act: Float32Array; meta: Float32Array } | null,
  loadedModel: null as BigModelId | null,
}

const PRESETS: Record<string, Partial<Physics>> = {
  museum: { bits: DEFAULT_WATER.bits, inBits: DEFAULT_WATER.inBits, progNoise: DEFAULT_WATER.progNoise, readNoise: DEFAULT_WATER.readNoise, irDrop: DEFAULT_WATER.irDrop },
  workshop: { bits: 6, inBits: 9, progNoise: 0.01, readNoise: 0.003, irDrop: 5e-6 },
  leaky: { bits: 5, inBits: 8, progNoise: 0.02, readNoise: 0.005, irDrop: 1e-5 },
}

// ------------------------------------------------------------------ model picker
function selectModel(m: BigModelId): void {
  state.model = m
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.model === m)))
  const info = BIG_MODELS[m]
  $('model-blurb').textContent = info.blurb
  const prompt = $<HTMLTextAreaElement>('prompt')
  if (!prompt.value || Object.values(BIG_MODELS).some((x) => x.prompt === prompt.value)) prompt.value = info.prompt
  const files = resolveFiles(m, params)
  const loadBtn = $<HTMLButtonElement>('load')
  loadBtn.textContent = state.loadedModel === m ? 'Reservoirs full' : `Fill the reservoirs · ${info.approxMB} MB`
  loadBtn.disabled = state.loadedModel === m || !state.device
  isCached(files.weights).then((hit) => {
    if (hit && state.loadedModel !== m) loadBtn.textContent = 'Fill the reservoirs · from your cache'
  })
}

document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.running) return
    selectModel(b.dataset.model as BigModelId)
  }),
)

// ------------------------------------------------------------------ physics controls
const bitsEl = $<HTMLInputElement>('bits')
const inbitsEl = $<HTMLInputElement>('inbits')
const progEl = $<HTMLInputElement>('prog')
const readEl = $<HTMLInputElement>('read')
const irEl = $<HTMLInputElement>('ir')

function syncPhysicsUi(): void {
  const p = state.physics
  bitsEl.value = String(p.bits)
  inbitsEl.value = String(p.inBits === 0 ? 13 : p.inBits)
  progEl.value = String(p.progNoise * 100)
  readEl.value = String(p.readNoise * 100)
  irEl.value = String(p.irDrop * 1e6)
  $('bits-v').textContent = `${(1 << p.bits) - 1} per side`
  $('inbits-v').textContent = p.inBits === 0 ? 'continuous' : `${p.inBits} bit`
  $('prog-v').textContent = `±${(p.progNoise * 100).toFixed(1)} %`
  $('read-v').textContent = `${(p.readNoise * 100).toFixed(2)} %`
  $('ir-v').textContent = p.irDrop === 0 ? 'none' : `ρ = ${(p.irDrop * 1e6).toFixed(1)}·10⁻⁶`
}

function readPhysicsUi(): void {
  const inb = Number(inbitsEl.value)
  state.physics = {
    ...state.physics,
    ideal: false,
    bits: Number(bitsEl.value),
    inBits: inb >= 13 ? 0 : inb,
    progNoise: Number(progEl.value) / 100,
    readNoise: Number(readEl.value) / 100,
    irDrop: Number(irEl.value) * 1e-6,
  }
  state.mode?.setPhysics(state.physics)
  syncPhysicsUi()
}

for (const el of [bitsEl, inbitsEl, progEl, readEl, irEl]) el.addEventListener('input', readPhysicsUi)
document.querySelectorAll<HTMLButtonElement>('.presets button').forEach((b) =>
  b.addEventListener('click', () => {
    state.physics = { ...state.physics, ...PRESETS[b.dataset.preset!] }
    state.mode?.setPhysics(state.physics)
    syncPhysicsUi()
  }),
)

// ------------------------------------------------------------------ sliders
const tempEl = $<HTMLInputElement>('temp')
const ntokEl = $<HTMLInputElement>('ntok')
tempEl.addEventListener('input', () => ($('temp-v').textContent = Number(tempEl.value).toFixed(2)))
ntokEl.addEventListener('input', () => ($('ntok-v').textContent = ntokEl.value))

// ------------------------------------------------------------------ loading
function fmtMB(b: number): string {
  return (b / 1e6).toFixed(b < 1e8 ? 1 : 0)
}

function fmtValves(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n)
}

async function load(): Promise<void> {
  if (!state.device) return
  const model = state.model
  const loadBtn = $<HTMLButtonElement>('load')
  loadBtn.disabled = true
  $<HTMLButtonElement>('go').disabled = true
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => (b.disabled = true))
  state.renderer?.destroy()
  state.renderer = null
  state.mode?.machine?.destroy()
  state.mode = null
  state.loadedModel = null
  $('stage-note').hidden = true
  $('fill').hidden = false
  const mode = new BigMode({
    model,
    backend: 'gpu',
    device: state.device,
    physics: state.physics,
    onMachine: (w, machine) => {
      const r = new ValveFieldRenderer(state.device!, $<HTMLCanvasElement>('field'), machine!, w, params.get('present') === 'readback' ? 'readback' : 'canvas')
      state.renderer = r
      r.onHover = showPlaque
      r.onFrame = () => placeLabels()
      buildLabels()
      buildLayerMenu()
      r.renderScale = Math.min(1, Math.max(0.1, Number(params.get('rscale') ?? 1)))
      if (!params.has('norender')) r.start()
    },
    onBand: (e) => state.renderer?.onBand(e),
  })
  state.mode = mode
  const t0 = performance.now()
  try {
    await mode.load((p: LoadProgress) => {
      loadBtn.textContent =
        p.phase === 'weights' ? 'Filling…' : p.phase === 'ready' ? 'Reservoirs full' : p.phase === 'finalizing' ? 'Priming pumps…' : 'Opening the sluices…'
      if (p.totalBytes) {
        $('fill-mb').textContent = `${fmtMB(p.bytes)} / ${fmtMB(p.totalBytes)} MB`
        $('fill-bar').style.width = `${Math.min(100, (100 * p.bytes) / p.totalBytes).toFixed(1)}%`
      }
      $('fill-valves').textContent = `${fmtValves(p.valves)} of ${fmtValves(p.totalValves)} valves set`
      $('fill-src').textContent = p.phase === 'weights' ? (p.fromCache ? 'from your browser cache' : `from ${weightsHost()}`) : ''
    })
    state.loadedModel = model
    $('fill-valves').textContent = `all ${fmtValves(mode.weights!.totalValves)} valves set in ${((performance.now() - t0) / 1000).toFixed(1)} s`
    setTimeout(() => ($('fill').hidden = true), 2500)
    $<HTMLButtonElement>('go').disabled = false
    loadBtn.textContent = 'Reservoirs full'
  } catch (err) {
    console.error(err)
    $('fill').hidden = true
    $('stage-note').hidden = false
    $('stage-note').innerHTML = `<p class="note-title">The sluices jammed</p><p>${String((err as Error).message ?? err)}</p>`
    loadBtn.disabled = false
    loadBtn.textContent = 'Try again'
  } finally {
    document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => (b.disabled = false))
  }
}

$('load').addEventListener('click', () => void load())

// ------------------------------------------------------------------ generation
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

async function generate(): Promise<void> {
  const mode = state.mode
  const r = state.renderer
  if (!mode || !r || state.running) return
  state.running = true
  $<HTMLButtonElement>('go').disabled = true
  $<HTMLButtonElement>('stop').disabled = false
  const out = $('output')
  const promptText = $<HTMLTextAreaElement>('prompt').value
  const ids = mode.tokenize(promptText)
  if (ids.length === 0) ids.push(mode.eosId)
  const promptLen = ids.length
  out.innerHTML = `<span class="prompt">${escapeHtml(promptText)}</span><span class="gen"></span><span class="caret"></span>`
  const gen = out.querySelector('.gen') as HTMLElement
  const grids = mode.weights!.specs
  const order = mode.machine!.program.filter((op) => op.kind === 'matmul').map((op) => mode.weights!.grid((op as { grid: string }).grid).id)
  const slow = () => $<HTMLInputElement>('slowmo').checked
  const nNew = Number(ntokEl.value)
  const temperature = Number(tempEl.value)
  let made = 0
  const t0 = performance.now()
  let computeMs = 0
  try {
    for (let i = 0; i < nNew && state.running; i++) {
      if (ids.length >= mode.machine!.ctx) break
      const ts = performance.now()
      const logits = await mode.step(ids)
      computeMs += performance.now() - ts
      const next = sample(logits, temperature, 40)
      ids.push(next)
      made++
      gen.textContent = mode.detokenize(ids.slice(promptLen))
      // the water's path through the machine for this token
      const sweep = slow() ? 0.07 : Math.min(0.025, Math.max(0.006, mode.machine!.lastTokenMs / 1000 / order.length))
      const now = r.now()
      order.forEach((g, k) => r.activate(g, now + k * sweep))
      mode.machine!.readActivity().then((a) => (state.activity = a))
      if (slow()) {
        for (let k = 0; k < order.length && state.running; k++) {
          const spec = grids[order[k]]
          if (k % 4 === 0 || spec.layer < 0) {
            if (spec.layer >= 0) r.flyToLayer(spec.layer)
            else r.flyToGrid(spec.name)
          }
          await new Promise((res) => setTimeout(res, sweep * 1000 * (k % 4 === 3 ? 4 : 1)))
        }
      } else {
        await new Promise((res) => setTimeout(res, 0))
      }
      const el = (performance.now() - t0) / 1000
      $('stats').textContent = `${made} tokens · ${(made / el).toFixed(1)} tok/s overall · ${(computeMs / made).toFixed(0)} ms of water per token`
      if (next === mode.eosId) break
    }
  } catch (err) {
    console.error(err)
    $('stats').textContent = `The machine stalled: ${(err as Error).message}`
  } finally {
    out.querySelector('.caret')?.remove()
    state.running = false
    $<HTMLButtonElement>('go').disabled = false
    $<HTMLButtonElement>('stop').disabled = true
  }
}

$('go').addEventListener('click', () => void generate())
$('stop').addEventListener('click', () => (state.running = false))

// ------------------------------------------------------------------ labels + plaque
let labelEls: { el: HTMLElement; x0: number; y0: number; w: number; h: number; kind: 'bay' | 'rect' }[] = []

function buildLabels(): void {
  const root = $('labels')
  root.innerHTML = ''
  labelEls = []
  const r = state.renderer!
  for (const b of r.layout.bays) {
    const el = document.createElement('div')
    el.className = 'lbl bay'
    el.textContent = `Layer ${b.layer}`
    root.appendChild(el)
    labelEls.push({ el, ...b, kind: 'bay' })
  }
  const vb = r.layout.vocabBay
  const v = document.createElement('div')
  v.className = 'lbl bay'
  v.textContent = 'Vocabulary · 50 257 collectors (also read backwards as the embedding)'
  root.appendChild(v)
  labelEls.push({ el: v, ...vb, kind: 'bay' })
  for (const rect of r.layout.rects) {
    if (rect.layer < 0 && rect.bank > 0) continue
    const el = document.createElement('div')
    el.className = 'lbl rect'
    const g = state.mode!.weights!.grids[rect.grid]
    el.innerHTML =
      rect.kind !== 'weights'
        ? `${rect.label} <span>${rect.h}×${rect.w}</span>`
        : rect.layer < 0
          ? `LM head <span>${g.rows}×${g.cols}</span>`
          : `${rect.label} <span>${g.rows}×${g.cols}</span>`
    if (rect.kind !== 'weights') el.classList.add('kv')
    root.appendChild(el)
    labelEls.push({ el, x0: rect.x0, y0: rect.y0, w: rect.w, h: rect.h, kind: 'rect' })
  }
}

function placeLabels(): void {
  const r = state.renderer
  if (!r) return
  const s = r.camera.scale
  const cw = r.canvas.clientWidth
  const ch = r.canvas.clientHeight
  for (const L of labelEls) {
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
  $('zoomhint').style.opacity = s < 0.5 ? '0' : '1'
}

function weightsHost(): string {
  try {
    return new URL(resolveFiles(state.model, params).weights).host
  } catch {
    return 'huggingface.co'
  }
}

/** Put the plaque beside the valve (right, else left, else below/above), never over it. */
function placePlaque(el: HTMLElement, h: HoverInfo): void {
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

function showPlaque(h: HoverInfo | null): void {
  const el = $('plaque')
  const mode = state.mode
  if (!h || !mode?.weights) {
    el.hidden = true
    return
  }
  if (h.rect.kind !== 'weights') {
    const cfg = mode.weights.cfg
    const hd = cfg.d / cfg.nHead
    const pos = h.rect.kind === 'keys' ? h.col : h.row
    const dim = h.rect.kind === 'keys' ? h.row : h.col
    const n = mode.machine?.programmed ?? 0
    el.innerHTML =
      `<div class="pl-where">Layer ${h.rect.layer} · ${h.rect.kind === 'keys' ? 'key' : 'value'} valves (KV cache)</div>` +
      `<div class="pl-row">token position ${pos} · head ${Math.floor(dim / hd)}, dim ${dim % hd}</div>` +
      `<div class="pl-row">${pos < n ? 'programmed from the activations when this token flowed through: these valves are set by data, not by training' : '<span class="dim">not programmed yet: no token has reached this position</span>'}</div>`
    el.hidden = false
    placePlaque(el, h)
    return
  }
  const g = mode.weights.grids[h.grid]
  const spec = mode.weights.specs[h.grid]
  const code = g.codes[g.index(h.row, h.col)]
  const p = state.physics
  const L = (1 << p.bits) - 1
  const detent = Math.round((Math.abs(code) * L) / 127)
  const wv = g.realisedWeight(h.row, h.col, p)
  const gauge = g.scale[Math.floor(h.row / TILE) * g.cols + h.col]
  const where = spec.layer >= 0 ? `Layer ${spec.layer} · ${spec.label}` : 'LM head · vocabulary'
  let flowLine = '<span class="dim">no water has flowed here yet</span>'
  const a = state.activity
  if (a) {
    const lay = mode.machine!.layout[h.grid]
    const head = a.act[lay.actOff + h.row]
    const y = a.act[lay.actOff + g.rows + h.col]
    const gval = g.conductance(h.row, h.col, p)
    flowLine = `head h = ${head.toFixed(3)} · flow h·g = ${(head * gval).toFixed(4)} · column out ${y.toFixed(3)}`
  }
  const token = spec.layer < 0 ? ` · token “${escapeHtml(mode.detokenize([h.col]))}”` : ''
  el.innerHTML =
    `<div class="pl-where">${where}</div>` +
    `<div class="pl-w">${wv >= 0 ? '+' : '−'}${Math.abs(wv).toFixed(5)}</div>` +
    `<div class="pl-row">input row ${h.row} → output column ${h.col}${token}</div>` +
    `<div class="pl-row">valve ${detent}/${L} open, draining to the <b class="${code >= 0 ? 'pos' : 'neg'}">${code >= 0 ? '+' : '−'}</b> collector · gauge ${gauge.toExponential(2)}</div>` +
    `<div class="pl-row">${flowLine}</div>`
  el.hidden = false
  placePlaque(el, h)
}

function buildLayerMenu(): void {
  const sel = $<HTMLSelectElement>('layer')
  const w = state.mode!.weights!
  sel.innerHTML = '<option value="">Fly to…</option>'
  for (let l = 0; l < w.cfg.nLayer; l++) sel.innerHTML += `<option value="L${l}">Layer ${l}</option>`
  sel.innerHTML += '<option value="lm_head">Vocabulary (LM head)</option>'
}

$<HTMLSelectElement>('layer').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value
  if (!v || !state.renderer) return
  if (v === 'lm_head') state.renderer.flyToGrid('lm_head')
  else state.renderer.flyToLayer(Number(v.slice(1)))
})
$('home').addEventListener('click', () => state.renderer?.home())
$('random').addEventListener('click', () => {
  const r = state.renderer
  const w = state.mode?.weights
  if (!r || !w) return
  const rect = r.layout.rects[Math.floor(Math.random() * r.layout.rects.length)]
  const row = Math.floor(Math.random() * rect.h)
  const col = rect.colStart + Math.floor(Math.random() * rect.w)
  r.flyToValve(rect.grid, row, col, Math.min(420, r.canvas.clientHeight * 0.55))
})

// ------------------------------------------------------------------ boot
async function boot(): Promise<void> {
  syncPhysicsUi()
  selectModel(state.model)
  try {
    state.device = await requestMachineDevice()
    state.device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', (e as GPUUncapturedErrorEvent).error.message))
    state.device.lost.then((info) => {
      console.error('WebGPU device lost:', info.reason, info.message)
      $('nogpu').hidden = false
      $('nogpu-detail').textContent = `The graphics device was lost (${info.message || info.reason}). Reload the page to try again.`
    })
  } catch (err) {
    $('nogpu').hidden = false
    $('stage-note').hidden = true
    $('nogpu-detail').textContent += ` (${(err as Error).message})`
    $<HTMLButtonElement>('load').disabled = true
    return
  }
  const small = matchMedia('(max-width: 720px), (pointer: coarse)').matches
  if (small) {
    $('load-fine').textContent = 'On a phone this is a heavy download and a lot of GPU memory: TinyStories (291 MB) is the gentler choice.'
    if (!params.get('model')) selectModel('tinystories')
  }
  selectModel(state.model)
  if (params.get('autoload') === '1') void load()
}

void boot()

/** Verification hook: GPU logits vs the CPU reference crossbar on the same valves. */
async function compareCpu(text: string, physics?: Physics): Promise<Record<string, unknown>> {
  const mode = state.mode!
  const ids = mode.tokenize(text)
  const phys = physics ?? state.physics
  mode.setPhysics(phys)
  const { CpuRunner, argmax } = await import('../runner-cpu.ts')
  const run = new CpuRunner(mode.weights!, phys)
  const t0 = performance.now()
  const gpu = await mode.step(ids)
  const tg = performance.now() - t0
  const t1 = performance.now()
  const cpu = run.step(ids)
  const tc = performance.now() - t1
  let maxAbs = 0
  let maxRef = 0
  for (let i = 0; i < cpu.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(gpu[i] - cpu[i]))
    maxRef = Math.max(maxRef, Math.abs(cpu[i]))
  }
  const top = (v: Float32Array) => Array.from(v.keys()).sort((a, b) => v[b] - v[a]).slice(0, 5)
  return { tokens: ids.length, maxAbs, maxRef, argmaxGpu: argmax(gpu), argmaxCpu: argmax(cpu), top5Gpu: top(gpu), top5Cpu: top(cpu), gpuMs: tg, cpuMs: tc }
}

// test hooks (headless verification)
;(window as unknown as { __hall: unknown }).__hall = { state, load, generate, compareCpu }
