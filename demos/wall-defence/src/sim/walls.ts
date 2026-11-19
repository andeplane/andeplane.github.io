// The verb: cut lifecycle per docs/DESIGN.md §2. Provisional status is an
// overlay derived from head extents — underlying cells (and drain timers) are
// untouched until a half completes and converts its cells to WALL.

import {
  BALL_HALF,
  BallType,
  BOARD_H,
  BOARD_W,
  CUT_COOLDOWN,
  CUT_COOLDOWN_CHASED,
  FAST_HANDS_MULT,
  GRID_H,
  GRID_W,
  Q,
  SPARK_DMG_PERIOD,
  SPARK_RANGE,
  Upgrade,
  WALL_SPEED,
} from './constants'
import { cellOf, mulQ } from './fixed'
import { damageBall, isSolid } from './balls'
import { hasUpgrade, WALL, type Cut, type GameState } from './state'

export function maxCuts(s: GameState): number {
  return hasUpgrade(s, Upgrade.TwinCut) ? 2 : 1
}

export function startCut(s: GameState, cx: number, cy: number, orient: 0 | 1): boolean {
  if (s.tick < s.cutCooldownUntil) return false
  if (s.cuts.length >= maxCuts(s)) return false
  if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false
  const cell = cy * GRID_W + cx
  if (isSolid(s.grid[cell])) return false
  const center = orient === 0 ? cy * Q + Q / 2 : cx * Q + Q / 2
  const armor = hasUpgrade(s, Upgrade.ArmoredWalls) ? 1 : 0
  s.cuts.push({
    id: s.nextId++,
    orient,
    cx,
    cy,
    a: { head: center, done: false, shattered: false, armorLeft: armor },
    b: { head: center, done: false, shattered: false, armorLeft: armor },
    sparkAt: s.tick,
  })
  return true
}

function wallSpeed(s: GameState): number {
  return hasUpgrade(s, Upgrade.FastHands) ? mulQ(WALL_SPEED, FAST_HANDS_MULT) : WALL_SPEED
}

// Provisional cell range of a half along the growth axis, inclusive.
// Anchor cell belongs to both halves.
function halfRange(c: Cut, which: 0 | 1): [number, number] {
  const anchor = c.orient === 0 ? c.cy : c.cx
  if (which === 0) return [cellOf(c.a.head), anchor]
  return [anchor, cellOf(c.b.head)]
}

function cellAlong(c: Cut, along: number): number {
  return c.orient === 0 ? along * GRID_W + c.cx : c.cy * GRID_W + along
}

// Advance heads, shatter-check against balls, convert completed halves.
// Returns true if any wall cells were created (topology change).
export function advanceCuts(s: GameState): boolean {
  const speed = wallSpeed(s)
  const limit = (c: Cut) => (c.orient === 0 ? BOARD_H : BOARD_W)
  let topology = false
  let cooldownThisTick = 0

  for (const c of s.cuts) {
    // 1. Advance heads.
    if (!c.a.done && !c.a.shattered) {
      c.a.head -= speed
      if (c.a.head <= 0) {
        c.a.head = 0
        c.a.done = true
      } else {
        const cellIdx = cellAlong(c, cellOf(c.a.head))
        if (isSolid(s.grid[cellIdx])) {
          c.a.head = (cellOf(c.a.head) + 1) * Q
          c.a.done = true
        }
      }
    }
    if (!c.b.done && !c.b.shattered) {
      c.b.head += speed
      if (c.b.head >= limit(c)) {
        // limit-1 keeps cellOf(head) on the last in-bounds cell.
        c.b.head = limit(c) - 1
        c.b.done = true
      } else {
        const cellIdx = cellAlong(c, cellOf(c.b.head))
        if (isSolid(s.grid[cellIdx])) {
          // Stop just short of the solid cell so the provisional range
          // (and conversion) never includes it.
          c.b.head = cellOf(c.b.head) * Q - 1
          c.b.done = true
        }
      }
    }

    // 2. Shatter check: ball AABB vs provisional cells of each growing half.
    for (const b of s.balls) {
      const alongMin = c.orient === 0 ? b.y - BALL_HALF : b.x - BALL_HALF
      const alongMax = c.orient === 0 ? b.y + BALL_HALF - 1 : b.x + BALL_HALF - 1
      const crossMin = c.orient === 0 ? b.x - BALL_HALF : b.y - BALL_HALF
      const crossMax = c.orient === 0 ? b.x + BALL_HALF - 1 : b.y + BALL_HALF - 1
      const lineCross = c.orient === 0 ? c.cx : c.cy
      if (cellOf(crossMax) < lineCross || cellOf(crossMin) > lineCross) continue
      const c0 = cellOf(alongMin)
      const c1 = cellOf(alongMax)
      for (const which of [0, 1] as const) {
        const half = which === 0 ? c.a : c.b
        if (half.done || half.shattered) continue
        const [r0, r1] = halfRange(c, which)
        if (c1 < r0 || c0 > r1) continue
        if (half.armorLeft > 0) {
          // Armored: absorb the hit and knock the ball off the line.
          half.armorLeft--
          if (c.orient === 0) {
            b.vx = -b.vx
            b.x = b.x < c.cx * Q + Q / 2 ? c.cx * Q - BALL_HALF : (c.cx + 1) * Q + BALL_HALF
          } else {
            b.vy = -b.vy
            b.y = b.y < c.cy * Q + Q / 2 ? c.cy * Q - BALL_HALF : (c.cy + 1) * Q + BALL_HALF
          }
          continue
        }
        half.shattered = true
        s.fx.shatters.push({
          x: c.orient === 0 ? c.cx * Q + Q / 2 : half.head,
          y: c.orient === 0 ? half.head : c.cy * Q + Q / 2,
        })
        const cd = b.type === BallType.Chaser ? CUT_COOLDOWN_CHASED : CUT_COOLDOWN
        cooldownThisTick = cooldownThisTick === 0 ? cd : Math.min(cooldownThisTick, cd)
      }
    }

    // 3. Convert completed halves to permanent WALL.
    for (const which of [0, 1] as const) {
      const half = which === 0 ? c.a : c.b
      if (!half.done || half.armorLeft < 0) continue
      if (half.shattered) continue
      // done halves convert once: mark by armorLeft = -1 sentinel after
      // conversion (armor is spent or irrelevant once permanent).
      const [r0, r1] = halfRange(c, which)
      for (let along = r0; along <= r1; along++) {
        const idx = cellAlong(c, along)
        if (s.grid[idx] !== WALL) {
          s.grid[idx] = WALL
          s.wallCreatedAt[idx] = s.tick
          s.drainUntil[idx] = 0
          topology = true
        }
      }
      half.armorLeft = -1
    }
  }

  // 4. SparkingEdge: live heads fire at the nearest ball.
  if (hasUpgrade(s, Upgrade.SparkingEdge)) {
    for (const c of s.cuts) {
      if (s.tick < c.sparkAt) continue
      let target = -1
      let bestD = SPARK_RANGE * SPARK_RANGE
      let hx = 0
      let hy = 0
      for (const which of [0, 1] as const) {
        const half = which === 0 ? c.a : c.b
        if (half.done || half.shattered) continue
        const px = c.orient === 0 ? c.cx * Q + Q / 2 : half.head
        const py = c.orient === 0 ? half.head : c.cy * Q + Q / 2
        for (let i = 0; i < s.balls.length; i++) {
          const b = s.balls[i]
          const dx = b.x - px
          const dy = b.y - py
          const d = dx * dx + dy * dy
          if (d < bestD) {
            bestD = d
            target = i
            hx = px
            hy = py
          }
        }
      }
      if (target >= 0) {
        const b = s.balls[target]
        damageBall(s, b, 1)
        s.fx.beams.push({ x1: hx, y1: hy, x2: b.x, y2: b.y, kind: 1 })
        c.sparkAt = s.tick + SPARK_DMG_PERIOD
      }
    }
  }

  // 5. Drop fully-resolved cuts.
  s.cuts = s.cuts.filter((c) => {
    const aDone = c.a.done || c.a.shattered
    const bDone = c.b.done || c.b.shattered
    return !(aDone && bDone)
  })

  if (cooldownThisTick > 0) {
    s.cutCooldownUntil = s.tick + cooldownThisTick
  }
  return topology
}
