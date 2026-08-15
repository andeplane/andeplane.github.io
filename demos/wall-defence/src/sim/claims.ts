// Region bookkeeping per docs/DESIGN.md §2: no region identity across ticks.
// On any relevant change, recompute connected components over non-WALL cells
// (4-way) and re-derive CLAIMED/DRAINING from ball membership.

import {
  BALL_HALF,
  BURST_DIVISOR,
  BURST_TIER2_PCT,
  BURST_TIER3_PCT,
  CELLS,
  DETONATE_DMG,
  DETONATE_RANGE_CELLS,
  DRAIN_TICKS,
  GARRISON_MIN_PCT,
  GRID_H,
  GRID_W,
  QUOTA_PCT,
  TowerType,
  Upgrade,
  WAVE_COUNT,
} from './constants'
import { cellOf, clamp } from './fixed'
import { damageBall } from './balls'
import {
  CLAIMED,
  DRAINING,
  OPEN,
  WALL,
  cellX,
  cellY,
  hasUpgrade,
  type GameState,
} from './state'

// Instant-unclaim: a ball touched a DRAINING cell → its whole connected
// DRAINING group opens immediately. Returns true if anything changed.
export function openTouchedDrains(s: GameState, touched: number[]): boolean {
  let changed = false
  for (const start of touched) {
    if (s.grid[start] !== DRAINING) continue
    const stack = [start]
    s.grid[start] = OPEN
    s.drainUntil[start] = 0
    changed = true
    while (stack.length > 0) {
      const c = stack.pop()!
      const cx = cellX(c)
      const cy = cellY(c)
      const neighbors = [
        cy > 0 ? c - GRID_W : -1,
        cy < GRID_H - 1 ? c + GRID_W : -1,
        cx > 0 ? c - 1 : -1,
        cx < GRID_W - 1 ? c + 1 : -1,
      ]
      for (const n of neighbors) {
        if (n >= 0 && s.grid[n] === DRAINING) {
          s.grid[n] = OPEN
          s.drainUntil[n] = 0
          stack.push(n)
        }
      }
    }
  }
  return changed
}

// Expire drain timers. Returns true if anything changed.
export function expireDrains(s: GameState): boolean {
  let changed = false
  for (let c = 0; c < CELLS; c++) {
    if (s.grid[c] === DRAINING && s.drainUntil[c] <= s.tick) {
      s.grid[c] = OPEN
      s.drainUntil[c] = 0
      changed = true
    }
  }
  return changed
}

export function recomputeClaims(s: GameState): void {
  // Label connected components of non-WALL cells.
  const label = new Int32Array(CELLS).fill(-1)
  const compCells: number[][] = []
  for (let c = 0; c < CELLS; c++) {
    if (s.grid[c] === WALL || label[c] >= 0) continue
    const id = compCells.length
    const cells: number[] = []
    const stack = [c]
    label[c] = id
    while (stack.length > 0) {
      const cur = stack.pop()!
      cells.push(cur)
      const cx = cellX(cur)
      const cy = cellY(cur)
      const neighbors = [
        cy > 0 ? cur - GRID_W : -1,
        cy < GRID_H - 1 ? cur + GRID_W : -1,
        cx > 0 ? cur - 1 : -1,
        cx < GRID_W - 1 ? cur + 1 : -1,
      ]
      for (const n of neighbors) {
        if (n >= 0 && s.grid[n] !== WALL && label[n] < 0) {
          label[n] = id
          stack.push(n)
        }
      }
    }
    compCells.push(cells)
  }

  // Ball membership by AABB overlap (post any same-tick spawns).
  const hasBall = new Array<boolean>(compCells.length).fill(false)
  for (const b of s.balls) {
    const x0 = clamp(cellOf(b.x - BALL_HALF), 0, GRID_W - 1)
    const x1 = clamp(cellOf(b.x + BALL_HALF - 1), 0, GRID_W - 1)
    const y0 = clamp(cellOf(b.y - BALL_HALF), 0, GRID_H - 1)
    const y1 = clamp(cellOf(b.y + BALL_HALF - 1), 0, GRID_H - 1)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const l = label[cy * GRID_W + cx]
        if (l >= 0) hasBall[l] = true
      }
    }
  }

  for (let id = 0; id < compCells.length; id++) {
    const cells = compCells[id]
    if (!hasBall[id]) {
      // Claim: OPEN cells are new captures (burst); DRAINING cells are
      // rescues (no burst).
      const newly: number[] = []
      for (const c of cells) {
        if (s.grid[c] === OPEN) newly.push(c)
        else if (s.grid[c] === DRAINING) s.drainUntil[c] = 0
        s.grid[c] = CLAIMED
      }
      if (newly.length > 0) {
        let mult = 1
        if (newly.length * 100 >= BURST_TIER3_PCT * CELLS) mult = 3
        else if (newly.length * 100 >= BURST_TIER2_PCT * CELLS) mult = 2
        const burst = Math.max(1, Math.floor((newly.length * mult) / BURST_DIVISOR))
        s.money += burst
        s.fx.claims.push({ cells: newly, burst })

        if (hasUpgrade(s, Upgrade.DetonatingClaims)) {
          for (const b of s.balls) {
            const bx = cellOf(b.x)
            const by = cellOf(b.y)
            let near = false
            for (const c of newly) {
              const dx = Math.abs(cellX(c) - bx)
              const dy = Math.abs(cellY(c) - by)
              if (Math.max(dx, dy) <= DETONATE_RANGE_CELLS) {
                near = true
                break
              }
            }
            if (near) damageBall(s, b, DETONATE_DMG)
          }
        }

        if (hasUpgrade(s, Upgrade.Garrison) && newly.length * 100 >= GARRISON_MIN_PCT * CELLS) {
          // Free T1 turret at the newly claimed cell nearest the centroid.
          let sx = 0
          let sy = 0
          for (const c of newly) {
            sx += cellX(c)
            sy += cellY(c)
          }
          const mx = Math.floor(sx / newly.length)
          const my = Math.floor(sy / newly.length)
          let best = -1
          let bestD = Infinity
          for (const c of newly) {
            if (s.towers.some((t) => t.cell === c)) continue
            const dx = cellX(c) - mx
            const dy = cellY(c) - my
            const d = dx * dx + dy * dy
            if (d < bestD) {
              bestD = d
              best = c
            }
          }
          if (best >= 0) {
            s.towers.push({
              id: s.nextId++,
              type: TowerType.Turret,
              tier: 0,
              cell: best,
              nextFireAt: s.tick,
              spent: 0,
            })
          }
        }
      }
    } else {
      // Breached: CLAIMED cells in a ball component start draining.
      for (const c of cells) {
        if (s.grid[c] === CLAIMED) {
          s.grid[c] = DRAINING
          s.drainUntil[c] = s.tick + DRAIN_TICKS
          s.fx.breaches.push({ cell: c })
        }
      }
    }
  }

  // Refresh the claimed-cell cache (CLAIMED + DRAINING both count).
  let count = 0
  for (let c = 0; c < CELLS; c++) {
    const v = s.grid[c]
    if (v === CLAIMED || v === DRAINING) count++
  }
  s.claimedCells = count

  // Quota crossings queue upgrade picks (exact rational comparison).
  while (
    s.quotasCrossed < WAVE_COUNT &&
    s.claimedCells * 100 >= QUOTA_PCT[s.quotasCrossed] * CELLS
  ) {
    s.quotasCrossed++
    s.pendingPicks++
  }
}
