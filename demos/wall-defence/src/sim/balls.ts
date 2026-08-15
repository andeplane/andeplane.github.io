// Ball movement, steering, damage. Per-axis integrate-and-resolve kills
// diagonal corner tunneling; steering uses the baked 16-heading LUT.

import {
  BALL_HALF,
  BALL_SPEED,
  BallType,
  BOARD_H,
  BOARD_W,
  FRESH_PAINT_TICKS,
  GNAW_TICKS,
  GRID_H,
  GRID_W,
  MAX_BALLS,
  Q,
  SLOW_MULT,
  SLOW_RANGE,
  SPLITTER_CHILDREN,
  STEER_REPLAN_TICKS,
  TowerType,
  Upgrade,
} from './constants'
import { bestHeading, cellOf, clamp, HEADING_X, HEADING_Y, mulQ } from './fixed'
import { rngNext } from './rng'
import {
  CLAIMED,
  DRAINING,
  WALL,
  cellX,
  cellY,
  hasUpgrade,
  makeBall,
  type Ball,
  type GameState,
} from './state'

export function isSolid(v: number): boolean {
  return v === WALL || v === CLAIMED
}

function towerCenterX(cell: number): number {
  return cellX(cell) * Q + Q / 2
}
function towerCenterY(cell: number): number {
  return cellY(cell) * Q + Q / 2
}

// Q8 speed multiplier from powered slow fields (min, no stacking).
function slowMultAt(s: GameState, x: number, y: number): number {
  let m = Q
  for (const t of s.towers) {
    if (t.type !== TowerType.Slow) continue
    if (s.grid[t.cell] !== CLAIMED) continue
    const dx = x - towerCenterX(t.cell)
    const dy = y - towerCenterY(t.cell)
    const r = SLOW_RANGE[t.tier]
    if (dx * dx + dy * dy <= r * r) {
      const sm = SLOW_MULT[t.tier]
      if (sm < m) m = sm
    }
  }
  return m
}

// Move one axis; returns true if a solid (or board edge) was hit.
function moveX(s: GameState, b: Ball, dx: number): boolean {
  if (dx === 0) return false
  const y0 = Math.max(0, cellOf(b.y - BALL_HALF))
  const y1 = Math.min(GRID_H - 1, cellOf(b.y + BALL_HALF - 1))
  let nx = b.x + dx
  let hit = false
  if (dx > 0) {
    if (nx > BOARD_W - BALL_HALF) {
      nx = BOARD_W - BALL_HALF
      hit = true
    }
    const from = cellOf(b.x + BALL_HALF - 1) + 1
    const to = Math.min(GRID_W - 1, cellOf(nx + BALL_HALF - 1))
    outer: for (let cx = from; cx <= to; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        if (isSolid(s.grid[cy * GRID_W + cx])) {
          nx = cx * Q - BALL_HALF
          hit = true
          break outer
        }
      }
    }
  } else {
    if (nx < BALL_HALF) {
      nx = BALL_HALF
      hit = true
    }
    const from = cellOf(b.x - BALL_HALF) - 1
    const to = Math.max(0, cellOf(nx - BALL_HALF))
    outer: for (let cx = from; cx >= to; cx--) {
      if (cx < 0) break
      for (let cy = y0; cy <= y1; cy++) {
        if (isSolid(s.grid[cy * GRID_W + cx])) {
          nx = (cx + 1) * Q + BALL_HALF
          hit = true
          break outer
        }
      }
    }
  }
  b.x = nx
  return hit
}

function moveY(s: GameState, b: Ball, dy: number): boolean {
  if (dy === 0) return false
  const x0 = Math.max(0, cellOf(b.x - BALL_HALF))
  const x1 = Math.min(GRID_W - 1, cellOf(b.x + BALL_HALF - 1))
  let ny = b.y + dy
  let hit = false
  if (dy > 0) {
    if (ny > BOARD_H - BALL_HALF) {
      ny = BOARD_H - BALL_HALF
      hit = true
    }
    const from = cellOf(b.y + BALL_HALF - 1) + 1
    const to = Math.min(GRID_H - 1, cellOf(ny + BALL_HALF - 1))
    outer: for (let cy = from; cy <= to; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (isSolid(s.grid[cy * GRID_W + cx])) {
          ny = cy * Q - BALL_HALF
          hit = true
          break outer
        }
      }
    }
  } else {
    if (ny < BALL_HALF) {
      ny = BALL_HALF
      hit = true
    }
    const from = cellOf(b.y - BALL_HALF) - 1
    const to = Math.max(0, cellOf(ny - BALL_HALF))
    outer: for (let cy = from; cy >= to; cy--) {
      if (cy < 0) break
      for (let cx = x0; cx <= x1; cx++) {
        if (isSolid(s.grid[cy * GRID_W + cx])) {
          ny = (cy + 1) * Q + BALL_HALF
          hit = true
          break outer
        }
      }
    }
  }
  b.y = ny
  return hit
}

// BFS over non-solid cells from the breaker's cell to the nearest gnawable
// WALL. Neighbor order and queue order are fixed → deterministic. Returns
// [firstStepCell, standCell, wallCell] or null.
const NB_OFF = [-GRID_W, GRID_W, -1, 1] as const

function gnawable(s: GameState, cell: number): boolean {
  if (s.grid[cell] !== WALL) return false
  if (hasUpgrade(s, Upgrade.FreshPaint)) {
    const born = s.wallCreatedAt[cell]
    if (born >= 0 && s.tick - born < FRESH_PAINT_TICKS) return false
  }
  return true
}

function planBreaker(s: GameState, b: Ball): [number, number, number] | null {
  const startCell =
    clamp(cellOf(b.y), 0, GRID_H - 1) * GRID_W + clamp(cellOf(b.x), 0, GRID_W - 1)
  if (isSolid(s.grid[startCell])) return null
  const parent = new Int32Array(GRID_W * GRID_H).fill(-2)
  parent[startCell] = -1
  const queue: number[] = [startCell]
  let qi = 0
  while (qi < queue.length) {
    const c = queue[qi++]
    const cx = cellX(c)
    const cy = cellY(c)
    // Check neighbors for a gnawable wall (fixed order).
    for (let k = 0; k < 4; k++) {
      const off = NB_OFF[k]
      if (off === -1 && cx === 0) continue
      if (off === 1 && cx === GRID_W - 1) continue
      if (off === -GRID_W && cy === 0) continue
      if (off === GRID_W && cy === GRID_H - 1) continue
      const n = c + off
      if (gnawable(s, n)) {
        // Walk back to the first step out of the start cell.
        let step = c
        while (step !== startCell && parent[step] !== startCell && parent[step] >= 0) {
          step = parent[step]
        }
        return [step, c, n]
      }
    }
    for (let k = 0; k < 4; k++) {
      const off = NB_OFF[k]
      if (off === -1 && cx === 0) continue
      if (off === 1 && cx === GRID_W - 1) continue
      if (off === -GRID_W && cy === 0) continue
      if (off === GRID_W && cy === GRID_H - 1) continue
      const n = c + off
      if (parent[n] === -2 && !isSolid(s.grid[n])) {
        parent[n] = c
        queue.push(n)
      }
    }
  }
  return null
}

function steerToward(b: Ball, tx: number, ty: number, speed: number): void {
  const k = bestHeading(tx - b.x, ty - b.y)
  b.vx = mulQ(speed, HEADING_X[k])
  b.vy = mulQ(speed, HEADING_Y[k])
}

// Nearest live cut head point for chasers (ties: lower cut id, then head A).
function nearestHead(s: GameState, b: Ball): [number, number] | null {
  let best: [number, number] | null = null
  let bestD = Infinity
  for (const c of s.cuts) {
    const halves = [c.a, c.b]
    for (let hi = 0; hi < 2; hi++) {
      const h = halves[hi]
      if (h.done || h.shattered) continue
      const hx = c.orient === 0 ? c.cx * Q + Q / 2 : h.head
      const hy = c.orient === 0 ? h.head : c.cy * Q + Q / 2
      const dx = hx - b.x
      const dy = hy - b.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = [hx, hy]
      }
    }
  }
  return best
}

// Move all balls. Appends DRAINING cells any ball ends up overlapping to
// drainTouched (instant-unclaim rule).
export function moveBalls(s: GameState, drainTouched: number[]): void {
  for (const b of s.balls) {
    if (b.type === BallType.Breaker) {
      if (b.gnawCell >= 0) continue // gnawing in place; handled in gnawStep
      if (s.tick >= b.replanAt) {
        b.replanAt = s.tick + STEER_REPLAN_TICKS
        const plan = planBreaker(s, b)
        if (plan) {
          b.pathCell = plan[0] === plan[1] ? plan[1] : plan[0]
          b.targetWall = plan[2]
          // If already standing on the stand cell, start gnawing.
          const myCell = cellOf(b.y) * GRID_W + cellOf(b.x)
          if (myCell === plan[1]) {
            b.gnawCell = plan[2]
            // Breakers chew faster in later waves — the pressure that only
            // killing them (towers) can relieve.
            b.gnawLeft = Math.max(42, GNAW_TICKS - (s.wave - 1) * 4)
            b.pathCell = -1
            continue
          }
        } else {
          b.pathCell = -1
          b.targetWall = -1
        }
      }
      if (b.pathCell >= 0) {
        steerToward(b, cellX(b.pathCell) * Q + Q / 2, cellY(b.pathCell) * Q + Q / 2, b.speed)
      }
      const m = slowMultAt(s, b.x, b.y)
      moveX(s, b, mulQ(b.vx, m))
      moveY(s, b, mulQ(b.vy, m))
    } else if (b.type === BallType.Chaser) {
      const target = nearestHead(s, b)
      if (target) {
        steerToward(b, target[0], target[1], b.speed)
        const m = slowMultAt(s, b.x, b.y)
        // Steerers slide: collisions zero out progress but don't bounce
        // (heading is re-aimed next tick anyway).
        moveX(s, b, mulQ(b.vx, m))
        moveY(s, b, mulQ(b.vy, m))
      } else {
        bounceMove(s, b)
      }
    } else {
      bounceMove(s, b)
    }
    collectDrainTouches(s, b, drainTouched)
  }
}

function bounceMove(s: GameState, b: Ball): void {
  const m = slowMultAt(s, b.x, b.y)
  if (moveX(s, b, mulQ(b.vx, m))) b.vx = -b.vx
  if (moveY(s, b, mulQ(b.vy, m))) b.vy = -b.vy
}

function collectDrainTouches(s: GameState, b: Ball, out: number[]): void {
  const x0 = Math.max(0, cellOf(b.x - BALL_HALF))
  const x1 = Math.min(GRID_W - 1, cellOf(b.x + BALL_HALF - 1))
  const y0 = Math.max(0, cellOf(b.y - BALL_HALF))
  const y1 = Math.min(GRID_H - 1, cellOf(b.y + BALL_HALF - 1))
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * GRID_W + cx
      if (s.grid[c] === DRAINING) out.push(c)
    }
  }
}

// Breakers gnaw their target wall cell. Returns true if topology changed.
export function gnawStep(s: GameState): boolean {
  let changed = false
  for (const b of s.balls) {
    if (b.type !== BallType.Breaker || b.gnawCell < 0) continue
    if (!gnawable(s, b.gnawCell)) {
      b.gnawCell = -1
      continue
    }
    b.gnawLeft--
    if (b.gnawLeft <= 0) {
      s.grid[b.gnawCell] = 0 // OPEN
      s.wallCreatedAt[b.gnawCell] = -1
      s.drainUntil[b.gnawCell] = 0
      s.fx.breaches.push({ cell: b.gnawCell })
      b.gnawCell = -1
      b.replanAt = s.tick // replan immediately next tick
      changed = true
    }
  }
  return changed
}

// Damage + death sweep. Returns true if any ball was removed or spawned.
export function damageBall(_s: GameState, b: Ball, dmg: number): void {
  b.hp -= dmg
}

export function sweepDead(s: GameState): boolean {
  let changed = false
  const survivors: Ball[] = []
  const spawns: Ball[] = []
  for (const b of s.balls) {
    if (b.hp > 0) {
      survivors.push(b)
      continue
    }
    changed = true
    s.fx.deaths.push({ x: b.x, y: b.y, type: b.type })
    if (b.type === BallType.Splitter && s.balls.length + spawns.length < MAX_BALLS) {
      for (let i = 0; i < SPLITTER_CHILDREN; i++) {
        const [ns, v] = rngNext(s.rngState)
        s.rngState = ns
        const sx = (v & 1) === 0 ? -1 : 1
        const sy = (v & 2) === 0 ? -1 : 1
        const f = makeBall(s, BallType.Fragment, b.x, b.y, sx * BALL_SPEED[BallType.Fragment], sy * BALL_SPEED[BallType.Fragment])
        f.hp = 1
        spawns.push(f)
      }
    }
  }
  if (changed) {
    s.balls = survivors.concat(spawns)
  }
  return changed
}
