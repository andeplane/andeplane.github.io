// Game shell: fixed-timestep loop with interpolation, mode flow
// (menu → playing → end), and the one UX rule — any overlay pauses the sim.

import './style.css'
import { TICK_HZ, WAVE_COUNT } from './sim/constants'
import type { SimEvent } from './sim/events'
import { step } from './sim/sim'
import { createState, PLAYING, type GameState } from './sim/state'
import { computeView, draw, type PrevPos, type View } from './render/draw'
import { Juice } from './render/juice'
import { dailySeed, recordDailyRun, utcDateString, loadDaily } from './daily'
import { Input } from './input'
import { Hud } from './ui/hud'
import { Hints } from './ui/hints'
import { Picker } from './ui/picker'
import { Radial } from './ui/radial'
import { Screens } from './ui/screens'

const FIXED_DT = 1 / TICK_HZ
const MAX_STEPS = 6

const canvas = document.getElementById('view') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const uiRoot = document.getElementById('ui')!

const rotateNudge = document.createElement('div')
rotateNudge.className = 'rotate-nudge'
rotateNudge.textContent = 'rotate for the best view ⟳'
uiRoot.appendChild(rotateNudge)

let state: GameState = createState(1)
let mode: 'menu' | 'playing' | 'ended' = 'menu'
let isDaily = true
let view: View
let pendingEvents: SimEvent[] = []
let prev = new Map<number, PrevPos>()
let acc = 0
let lastTime = performance.now()
let lastWave = 0
let firstClaimSeen = false
let firstTelegraphSeen = false
let idleHintAt = 0

const juice = new Juice()
const hud = new Hud(uiRoot)
const hints = new Hints(uiRoot)
const picker = new Picker(uiRoot)
const radial = new Radial(uiRoot)
const screens = new Screens(uiRoot)

const input = new Input(
  canvas,
  uiRoot,
  () => view,
  () => state,
  {
    emit: (e) => pendingEvents.push(e),
    radial,
    isInteractive: () => mode === 'playing' && !screens.isOpen && state.currentOffer.length === 0,
    onFirstCut: () => {
      idleHintAt = Infinity
    },
  },
)

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(canvas.clientWidth * dpr)
  canvas.height = Math.floor(canvas.clientHeight * dpr)
  view = computeView(canvas)
}
window.addEventListener('resize', resize)
resize()

function startRun(daily: boolean): void {
  isDaily = daily
  const seed = daily ? dailySeed() : (Math.random() * 0xffffffff) >>> 0
  state = createState(seed)
  pendingEvents = []
  prev = new Map()
  acc = 0
  lastWave = 0
  firstClaimSeen = false
  firstTelegraphSeen = false
  mode = 'playing'
  input.reset()
  radial.close()
  hints.reset()
  hud.setVisible(true)
  idleHintAt = performance.now() + 3000
  lastTime = performance.now()
}

function showMenu(): void {
  mode = 'menu'
  hud.setVisible(false)
  radial.close()
  screens.showMenu((c) => startRun(c.mode === 'daily'))
}

function endRun(): void {
  mode = 'ended'
  radial.close()
  input.reset()
  let attempt = 0
  if (isDaily) {
    const date = utcDateString()
    recordDailyRun(date, state)
    attempt = loadDaily(date).attempts
  }
  screens.showEnd(
    state,
    isDaily,
    attempt,
    () => startRun(isDaily),
    () => showMenu(),
  )
}

function snapshotPrev(): void {
  prev.clear()
  for (const b of state.balls) prev.set(b.id, { x: b.x, y: b.y })
}

function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now

  if (mode === 'playing') {
    const paused = screens.isOpen || radial.isOpen
    if (!paused) {
      acc += dt
      let steps = 0
      while (acc >= FIXED_DT && steps < MAX_STEPS) {
        acc -= FIXED_DT
        steps++
        snapshotPrev()
        const events = pendingEvents
        pendingEvents = []
        step(state, events)
        juice.consume(state, state.fx, now)
        if (state.status !== PLAYING) {
          endRun()
          break
        }
      }
      if (acc > FIXED_DT * MAX_STEPS) acc = 0
    }

    // Picker sync (sim frozen internally while an offer is up).
    picker.sync(state.currentOffer, (choice) => {
      pendingEvents.push({ kind: 'PickUpgrade', choice })
      // Apply immediately so the modal closes without waiting a frame.
      const events = pendingEvents
      pendingEvents = []
      step(state, events)
      juice.consume(state, state.fx, now)
      picker.sync(state.currentOffer, () => undefined)
    })

    // Wave flash + hints.
    if (state.wave !== lastWave && state.wave > 0 && state.wave <= WAVE_COUNT) {
      juice.flashWave(`WAVE ${state.wave}`, now)
      lastWave = state.wave
    }
    if (now > idleHintAt) {
      hints.fire('cut', input.isTouch ? 'Tap open space to aim a cut, tap ✓ to commit' : 'Click to cut — Space flips direction', now)
      idleHintAt = Infinity
    }
    if (!firstClaimSeen && state.claimedCells > 0) {
      firstClaimSeen = true
      hints.fire('claim', 'Sealed land is yours — tap it to build towers', now)
    }
    if (!firstTelegraphSeen && state.telegraphedWave >= 1) {
      firstTelegraphSeen = true
      hints.fire('quota', 'Keep the bar past ◆ before the wave lands', now)
    }
    hud.update(state)
  }

  juice.update(dt)
  hints.update(now)

  const alpha = Math.max(0, Math.min(1, acc / FIXED_DT))
  const ghost =
    mode === 'playing' && !screens.isOpen && state.currentOffer.length === 0
      ? input.currentGhost()
      : null
  draw(ctx, state, view, juice, prev, alpha, ghost, now)
}

showMenu()
requestAnimationFrame(frame)

// Debug/verification hook for tools and screenshot scripts: start a run on a
// chosen seed and synchronously replay a recorded event log to a target tick.
interface ScheduledEvent {
  tick: number
  e: SimEvent
}
const wd = {
  get state() {
    return state
  },
  emit(e: SimEvent): void {
    pendingEvents.push(e)
  },
  startSeed(seed: number): void {
    screens.close()
    startRun(false)
    state = createState(seed >>> 0)
  },
  advance(ticks: number, log: ScheduledEvent[] = []): void {
    let li = 0
    for (let i = 0; i < ticks; i++) {
      const events: SimEvent[] = []
      while (li < log.length && log[li].tick === state.tick) {
        events.push(log[li].e)
        li++
      }
      snapshotPrev()
      step(state, events)
      if (state.status !== PLAYING) break
    }
    hud.update(state)
  },
}
;(window as unknown as { __wd: typeof wd }).__wd = wd
