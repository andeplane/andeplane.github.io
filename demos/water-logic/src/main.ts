import './style.css'
import { GpuFluid } from './gl/fluid.ts'
import { Overlay, buildSchematic } from './overlay.ts'
import { BITS, buildBoard, gateAt } from './sim/board.ts'
import { Adder } from './sim/logic.ts'

const board = buildBoard()
const adder = new Adder(board)

const boardEl = document.getElementById('board')!
const glCanvas = document.getElementById('gl') as HTMLCanvasElement
const ovCanvas = document.getElementById('overlay') as HTMLCanvasElement
const boardUi = document.getElementById('board-ui')!
boardEl.style.setProperty('--aspect', String(board.w / board.h))

let fluid: GpuFluid
try {
  fluid = new GpuFluid(glCanvas, board)
} catch (e) {
  document.getElementById('board')!.hidden = true
  const fb = document.getElementById('fallback')!
  fb.hidden = false
  document.getElementById('fallback-detail')!.textContent = String(e instanceof Error ? e.message : e)
  throw e
}

const schematic = buildSchematic(board, adder)
const overlay = new Overlay(ovCanvas, board, adder, schematic)

// ---------- inputs ----------

const params = new URLSearchParams(location.search)
let A = clamp15(Number(params.get('a') ?? 5))
let B = clamp15(Number(params.get('b') ?? 3))
function clamp15(v: number) {
  return Number.isFinite(v) ? Math.max(0, Math.min(15, Math.round(v))) : 0
}

const valveButtons: { el: HTMLButtonElement; op: 'a' | 'b'; bit: number }[] = []
for (let i = 0; i < BITS; i++) {
  const g = gateAt(board, 'ha1', i)
  ;(['a', 'b'] as const).forEach((op, k) => {
    const n = board.nozzles[g.nozzleBase + k]
    const el = document.createElement('button')
    el.className = 'valve'
    el.type = 'button'
    el.style.left = `${(n.ax / board.w) * 100}%`
    el.style.top = `${((g.oy - 21) / board.h) * 100}%`
    el.style.setProperty('--vc', op === 'a' ? 'var(--c0)' : 'var(--c1)')
    el.textContent = `${op.toUpperCase()}${i}`
    el.title = `Valve ${op.toUpperCase()}${i} (bit ${i}, worth ${1 << i})`
    el.addEventListener('click', () => toggle(op, i))
    boardUi.appendChild(el)
    valveButtons.push({ el, op, bit: i })
  })
}

const panelBits: { el: HTMLButtonElement; op: 'a' | 'b'; bit: number }[] = []
document.querySelectorAll<HTMLElement>('.operand').forEach((row) => {
  const op = row.dataset.op as 'a' | 'b'
  const holder = row.querySelector('.bits')!
  for (let i = BITS - 1; i >= 0; i--) {
    const el = document.createElement('button')
    el.className = 'bit'
    el.type = 'button'
    el.innerHTML = `0<small>${1 << i}</small>`
    el.setAttribute('aria-label', `${op.toUpperCase()} bit ${i}`)
    el.addEventListener('click', () => toggle(op, i))
    holder.appendChild(el)
    panelBits.push({ el, op, bit: i })
  }
})

function toggle(op: 'a' | 'b', bit: number) {
  if (op === 'a') A ^= 1 << bit
  else B ^= 1 << bit
  applyInputs()
}

function applyInputs() {
  adder.setInputs(A, B)
  for (const v of [...valveButtons, ...panelBits]) {
    const on = (((v.op === 'a' ? A : B) >> v.bit) & 1) === 1
    v.el.classList.toggle('on', on)
    v.el.setAttribute('aria-pressed', String(on))
    if (v.el.classList.contains('bit')) v.el.firstChild!.textContent = on ? '1' : '0'
  }
  document.querySelector('.operand[data-op="a"] .dec')!.textContent = String(A)
  document.querySelector('.operand[data-op="b"] .dec')!.textContent = String(B)
  document.getElementById('eq-a')!.textContent = String(A)
  document.getElementById('eq-b')!.textContent = String(B)
}

document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    const p = b.dataset.preset!
    if (p === 'random') {
      A = Math.floor(Math.random() * 16)
      B = Math.floor(Math.random() * 16)
    } else {
      ;[A, B] = p.split(',').map(Number)
    }
    applyInputs()
  }),
)

let mode = 0
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    mode = Number(b.dataset.mode)
    document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b))
  }),
)

type Pace = 'slow' | 'normal' | 'fast'
let pace: Pace = 'normal'
document.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) =>
  b.addEventListener('click', () => {
    pace = b.dataset.pace as Pace
    document.querySelectorAll('[data-pace]').forEach((x) => x.classList.toggle('on', x === b))
  }),
)

// ---------- readout ----------

const sumBits = document.getElementById('sum-bits')!
const sumSpans: HTMLSpanElement[] = []
for (let i = BITS; i >= 0; i--) {
  const s = document.createElement('span')
  s.innerHTML = `0<small>${1 << i}</small>`
  sumBits.appendChild(s)
  sumSpans[i] = s
}
const eqSum = document.getElementById('eq-sum')!
const statusEl = document.getElementById('status')!
const bar = document.getElementById('progress-bar')!
const statsEl = document.getElementById('stats')!

const ROLE_NAME = { ha1: 'first half adder', ha2: 'second half adder', or: 'carry OR' } as const

function updateReadout() {
  const settled = adder.settled
  const result = adder.result
  for (let i = 0; i <= BITS; i++) {
    const on = ((result >> i) & 1) === 1
    const pending = i < BITS ? adder.run('ha2', i).phase !== 'valid' : adder.run('or', BITS - 1).phase !== 'valid'
    sumSpans[i].classList.toggle('on', on)
    sumSpans[i].classList.toggle('pending', pending && !settled)
    sumSpans[i].firstChild!.textContent = on ? '1' : '0'
  }
  if (settled) {
    const ok = result === A + B
    eqSum.textContent = String(result)
    eqSum.className = ok ? 'ok' : 'bad'
    statusEl.innerHTML = ok
      ? `<b>Settled.</b> The water says ${A} + ${B} = ${result}, which is right. It took ${adder.sinceInput.toLocaleString()} lattice steps.`
      : `<b>Settled on ${result}</b>, but ${A} + ${B} = ${A + B}. The fluid got this one wrong.`
    bar.style.width = '100%'
  } else {
    eqSum.textContent = String(result)
    eqSum.className = 'wait'
    const busy = board.gates
      .map((g, gi) => ({ g, run: adder.runs[gi] }))
      .filter(({ run }) => run.phase !== 'valid')
      .sort((x, y) => y.g.bit - x.g.bit)
    if (busy.length) {
      const top = busy[busy.length - 1]
      const what = top.run.phase === 'flush' ? 'purging' : 'settling'
      statusEl.innerHTML = `Computing… <b>bit ${top.g.bit} ${ROLE_NAME[top.g.role]}</b> is ${what}${busy.length > 1 ? `, ${busy.length - 1} more chamber${busy.length > 2 ? 's' : ''} busy` : ''}.`
    } else statusEl.textContent = 'Passing the answer along…'
    const done = board.gates.filter((_, gi) => adder.runs[gi].phase === 'valid').length
    bar.style.width = `${(100 * done) / board.gates.length}%`
  }
}

// ---------- loop ----------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const r = boardEl.getBoundingClientRect()
  const w = Math.max(1, Math.round(r.width * dpr))
  const h = Math.max(1, Math.round(r.height * dpr))
  for (const c of [glCanvas, ovCanvas]) {
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
  }
}
new ResizeObserver(resize).observe(boardEl)
resize()

// ?steps=N pins the steps per frame and ?render=K draws only every K-th frame
// (used to drive the exhibit quickly under a software renderer in tests).
const fixedSteps = Number(params.get('steps')) || 0
const renderEvery = Math.max(1, Number(params.get('render')) || 1)
let stepsPerFrame = fixedSteps || 24
let lastSimMs = 0
let frames = 0
let fpsT0 = performance.now()
let fps = 0
let fpsFrames = 0
const BUDGET = { slow: 4, normal: 13, fast: 26 } as const

let paused = false
function frame(t: number) {
  if (paused) {
    fluid.render({ scale: glCanvas.width / board.w, ox: 0, oy: 0 }, glCanvas.width, glCanvas.height, t, mode)
    overlay.draw(t)
    requestAnimationFrame(frame)
    return
  }
  const budget = BUDGET[pace]
  const t0 = performance.now()
  const n = fixedSteps || (pace === 'slow' ? 4 : stepsPerFrame)
  fluid.step(n, adder.valves)
  const probes = fluid.readProbes() // synchronous: also acts as the GPU timer
  adder.advance(n, probes)
  lastSimMs = performance.now() - t0
  if (pace !== 'slow' && !fixedSteps) {
    if (lastSimMs < budget * 0.8 && stepsPerFrame < 400) stepsPerFrame = Math.ceil(stepsPerFrame * 1.08)
    else if (lastSimMs > budget * 1.2 && stepsPerFrame > 2) stepsPerFrame = Math.max(2, Math.floor(stepsPerFrame * 0.85))
  }
  frames++
  if (frames % renderEvery === 0) {
    fluid.render({ scale: glCanvas.width / board.w, ox: 0, oy: 0 }, glCanvas.width, glCanvas.height, t, mode)
    overlay.draw(t)
  }
  if (t - fpsT0 > 500) {
    fps = ((frames - fpsFrames) * 1000) / (t - fpsT0)
    fpsFrames = frames
    fpsT0 = t
    statsEl.textContent = `${n} steps/frame · ${fps.toFixed(0)} fps · ${Math.round(n * fps).toLocaleString()} steps/s · ${board.w}×${board.h} lattice`
  }
  updateReadout()
  requestAnimationFrame(frame)
}

applyInputs()
requestAnimationFrame(frame)

// Hook for automated checks (headless browser tests read the fluid's verdict).
declare global {
  interface Window {
    __waterLogic: unknown
  }
}
window.__waterLogic = {
  setInputs(a: number, b: number) {
    A = clamp15(a)
    B = clamp15(b)
    applyInputs()
  },
  state() {
    return {
      a: A,
      b: B,
      settled: adder.settled,
      result: adder.result,
      steps: fluid.steps,
      sinceInput: adder.sinceInput,
      stepsPerFrame,
      gates: board.gates.map((g, gi) => ({
        id: `${g.role}${g.bit}`,
        phase: adder.runs[gi].phase,
        out: adder.runs[gi].out,
        flux: adder.runs[gi].flux.map((f) => +f.toFixed(2)),
      })),
    }
  },
  pause(p: boolean) {
    paused = p
  },
  setPace(p: Pace) {
    pace = p
  },
}
