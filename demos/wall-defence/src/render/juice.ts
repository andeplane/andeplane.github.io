// Client-side transient effects fed from state.fx after each sim step.
// Nothing here touches the sim.

import { BallType, DRAIN_TICKS, GRID_W, Q, TICK_HZ } from '../sim/constants'
import { cellX, cellY, type Fx, type GameState } from '../sim/state'
import { ballColor, theme } from './theme'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface Floater {
  x: number
  y: number
  text: string
  life: number
  maxLife: number
  color: string
}

export interface Beam {
  x1: number
  y1: number
  x2: number
  y2: number
  life: number
  kind: number
}

export interface FloodAnim {
  cells: number[]
  originX: number
  originY: number
  start: number // ms
}

export class Juice {
  particles: Particle[] = []
  floaters: Floater[] = []
  beams: Beam[] = []
  floods: FloodAnim[] = []
  shake = 0
  waveFlash = ''
  waveFlashUntil = 0

  private rnd(): number {
    return Math.random() // render-only randomness, never sim
  }

  consume(s: GameState, fx: Fx, now: number): void {
    for (const b of fx.beams) {
      this.beams.push({ x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, life: 1, kind: b.kind })
    }
    for (const sh of fx.shatters) {
      this.shake = Math.min(8, this.shake + 5)
      for (let i = 0; i < 14; i++) {
        const a = this.rnd() * Math.PI * 2
        const sp = 40 + this.rnd() * 160
        this.particles.push({
          x: sh.x,
          y: sh.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          maxLife: 0.5 + this.rnd() * 0.3,
          size: 3 + this.rnd() * 4,
          color: theme.cutLine,
        })
      }
    }
    for (const d of fx.deaths) {
      const col = ballColor[d.type] ?? theme.bouncer
      for (let i = 0; i < 10; i++) {
        const a = this.rnd() * Math.PI * 2
        const sp = 30 + this.rnd() * 120
        this.particles.push({
          x: d.x,
          y: d.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          maxLife: 0.4 + this.rnd() * 0.3,
          size: 2 + this.rnd() * 3,
          color: col,
        })
      }
    }
    for (const c of fx.claims) {
      let sx = 0
      let sy = 0
      for (const cell of c.cells) {
        sx += cellX(cell)
        sy += cellY(cell)
      }
      const ox = ((sx / c.cells.length) + 0.5) * Q
      const oy = ((sy / c.cells.length) + 0.5) * Q
      this.floods.push({ cells: c.cells, originX: ox, originY: oy, start: now })
      const pct = ((c.cells.length * 100) / (s.grid.length)).toFixed(1)
      this.floaters.push({
        x: ox,
        y: oy,
        text: `+${pct}%`,
        life: 1,
        maxLife: 1.4,
        color: theme.floater,
      })
      this.floaters.push({
        x: ox,
        y: oy + 40,
        text: `+${c.burst}¢`,
        life: 1,
        maxLife: 1.4,
        color: theme.floaterMoney,
      })
    }
    for (const br of fx.breaches) {
      const x = (cellX(br.cell) + 0.5) * Q
      const y = (cellY(br.cell) + 0.5) * Q
      if (this.particles.length < 400) {
        for (let i = 0; i < 3; i++) {
          const a = this.rnd() * Math.PI * 2
          this.particles.push({
            x,
            y,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 60,
            life: 1,
            maxLife: 0.5,
            size: 2 + this.rnd() * 2,
            color: theme.drainWarn,
          })
        }
      }
    }
  }

  flashWave(text: string, now: number): void {
    this.waveFlash = text
    this.waveFlashUntil = now + 1600
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 18)
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.94
      p.vy *= 0.94
      p.life -= dt / p.maxLife
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const f of this.floaters) {
      f.y -= 26 * dt
      f.life -= dt / f.maxLife
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
    for (const b of this.beams) b.life -= dt * 7
    this.beams = this.beams.filter((b) => b.life > 0)
    const cutoff = performance.now() - 900
    this.floods = this.floods.filter((f) => f.start > cutoff)
  }
}

// Drain progress 0..1 (1 = fully drained) for warning styling.
export function drainProgress(s: GameState, cell: number): number {
  const until = s.drainUntil[cell]
  if (until <= 0) return 0
  const left = until - s.tick
  return 1 - Math.max(0, Math.min(1, left / DRAIN_TICKS))
}

export function ballDisplayName(t: BallType): string {
  switch (t) {
    case BallType.Bouncer:
      return 'bouncer'
    case BallType.Breaker:
      return 'breaker'
    case BallType.Chaser:
      return 'chaser'
    case BallType.Splitter:
      return 'splitter'
    default:
      return 'fragment'
  }
}

export function cellCenter(cell: number): [number, number] {
  return [(cell % GRID_W) * Q + Q / 2, Math.floor(cell / GRID_W) * Q + Q / 2]
}

export const SECONDS_PER_TICK = 1 / TICK_HZ
