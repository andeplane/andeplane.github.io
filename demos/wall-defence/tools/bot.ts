// Scripted self-play bot. Produces SimEvents from observed state; its own
// randomness is a private Stream so runs are reproducible per seed. Bot
// heuristics may use floats — only the emitted events touch the sim.

import { BALL_HALF, GRID_H, GRID_W, Q, TowerType } from '../src/sim/constants'
import type { SimEvent } from '../src/sim/events'
import { Stream } from '../src/sim/rng'
import { CLAIMED, OPEN, cellX, cellY, type GameState } from '../src/sim/state'
import { towerCost } from '../src/sim/towers'

export interface BotOptions {
  useTowers: boolean
}

export class Bot {
  private rng: Stream
  private opts: BotOptions

  constructor(seed: number, opts: BotOptions) {
    this.rng = new Stream(seed ^ 0x5eedb07)
    this.opts = opts
  }

  act(s: GameState): SimEvent[] {
    const events: SimEvent[] = []

    if (s.currentOffer.length > 0) {
      events.push({ kind: 'PickUpgrade', choice: 0 })
      return events
    }

    // Try a cut every half second when idle.
    if (s.cuts.length === 0 && s.tick >= s.cutCooldownUntil && s.tick % 30 === 0) {
      const cut = this.pickCut(s)
      if (cut) events.push(cut)
    }

    // Tower economy every second.
    if (this.opts.useTowers && s.tick % 60 === 0) {
      const type = s.towers.length % 3 === 2 ? TowerType.Slow : TowerType.Turret
      const cost = towerCost(type, 0)
      if (s.money >= cost) {
        const cell = this.pickTowerCell(s)
        if (cell >= 0) {
          events.push({ kind: 'PlaceTower', cell, tower: type })
        } else {
          const up = s.towers.find((t) => t.tier < 2 && s.money >= towerCost(t.type, t.tier + 1))
          if (up) events.push({ kind: 'UpgradeTower', id: up.id })
        }
      }
    }

    return events
  }

  private pickCut(s: GameState): SimEvent | null {
    let best: SimEvent | null = null
    let bestScore = -Infinity
    for (let i = 0; i < 40; i++) {
      const cx = this.rng.int(GRID_W)
      const cy = this.rng.int(GRID_H)
      const orient = (this.rng.int(2) as 0 | 1)
      const cell = cy * GRID_W + cx
      if (s.grid[cell] !== OPEN) continue
      const score = this.scoreCut(s, cx, cy, orient)
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'StartCut', cx, cy, orient }
      }
    }
    // Only commit when the nearest ball is comfortably far.
    if (best && bestScore > 2.5 * Q) return best
    return null
  }

  // Score = distance from the nearest ball to the would-be line segment,
  // plus a bonus if one side of the line is currently ball-free (claim
  // likely). Coarse heuristics on purpose.
  private scoreCut(s: GameState, cx: number, cy: number, orient: 0 | 1): number {
    // Find the open span of the line.
    let lo = orient === 0 ? cy : cx
    let hi = lo
    const solid = (v: number) => v === 1 || v === 2 // WALL | CLAIMED
    while (lo > 0) {
      const c = orient === 0 ? (lo - 1) * GRID_W + cx : cy * GRID_W + (lo - 1)
      if (solid(s.grid[c])) break
      lo--
    }
    const max = orient === 0 ? GRID_H - 1 : GRID_W - 1
    while (hi < max) {
      const c = orient === 0 ? (hi + 1) * GRID_W + cx : cy * GRID_W + (hi + 1)
      if (solid(s.grid[c])) break
      hi++
    }
    const x1 = orient === 0 ? cx * Q + Q / 2 : lo * Q + Q / 2
    const y1 = orient === 0 ? lo * Q + Q / 2 : cy * Q + Q / 2
    const x2 = orient === 0 ? cx * Q + Q / 2 : hi * Q + Q / 2
    const y2 = orient === 0 ? hi * Q + Q / 2 : cy * Q + Q / 2

    let minDist = Infinity
    let sideA = 0
    let sideB = 0
    for (const b of s.balls) {
      const d = pointSegDist(b.x, b.y, x1, y1, x2, y2) - BALL_HALF
      if (d < minDist) minDist = d
      const coord = orient === 0 ? b.x : b.y
      const line = orient === 0 ? cx * Q + Q / 2 : cy * Q + Q / 2
      if (coord < line) sideA++
      else sideB++
    }
    let score = minDist
    if (Math.min(sideA, sideB) === 0 && s.balls.length > 0) score += 3 * Q
    // Prefer shorter spans (finish faster, less exposure).
    score -= (hi - lo) * 8
    return score
  }

  private pickTowerCell(s: GameState): number {
    for (let i = 0; i < 30; i++) {
      const cell = this.rng.int(GRID_W * GRID_H)
      if (s.grid[cell] !== CLAIMED) continue
      if (s.towers.some((t) => t.cell === cell)) continue
      // Want open space within 4 cells (something to shoot at).
      const cx = cellX(cell)
      const cy = cellY(cell)
      let nearOpen = false
      for (let dy = -4; dy <= 4 && !nearOpen; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue
          if (s.grid[ny * GRID_W + nx] === OPEN) {
            nearOpen = true
            break
          }
        }
      }
      if (nearOpen) return cell
    }
    return -1
  }
}

function pointSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = x1 + t * dx
  const qy = y1 + t * dy
  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy))
}
