// Wave schedule, portals, quota loss check, win check. All wave randomness
// comes from substream(seed, 'wave', w) — identical for every player on a
// daily regardless of their actions.

import {
  BALL_HP,
  BALL_SPEED,
  BallType,
  CELLS,
  FIRST_WAVE_TICK,
  GRID_H,
  GRID_W,
  MAX_BALLS,
  MAX_CHASERS,
  Q,
  QUOTA_PCT,
  SPAWN_STAGGER,
  TELEGRAPH_TICKS,
  WAVE_COMP,
  WAVE_COUNT,
  WAVE_INTERVAL,
  WIN_TAIL_TICKS,
} from './constants'
import { substream } from './rng'
import { LOST, OPEN, PLAYING, WON, cellX, cellY, makeBall, type GameState } from './state'

export function waveSpawnTick(w: number): number {
  return FIRST_WAVE_TICK + w * WAVE_INTERVAL
}

export function winTick(): number {
  return waveSpawnTick(WAVE_COUNT - 1) + WIN_TAIL_TICKS
}

// Border cells (row-major order): y=0 row, y=H-1 row, x=0 col, x=W-1 col —
// deduplicated by construction order for determinism.
function borderCells(): number[] {
  const out: number[] = []
  for (let x = 0; x < GRID_W; x++) out.push(x)
  for (let x = 0; x < GRID_W; x++) out.push((GRID_H - 1) * GRID_W + x)
  for (let y = 1; y < GRID_H - 1; y++) out.push(y * GRID_W)
  for (let y = 1; y < GRID_H - 1; y++) out.push(y * GRID_W + GRID_W - 1)
  return out
}

const BORDER = borderCells()

function openBorderCells(s: GameState): number[] {
  return BORDER.filter((c) => s.grid[c] === OPEN)
}

// Deterministic BFS (4-way, walls passable — pure distance) to the nearest
// OPEN cell. Returns -1 if the board has no open cell at all.
function nearestOpen(s: GameState, from: number): number {
  if (s.grid[from] === OPEN) return from
  const seen = new Uint8Array(GRID_W * GRID_H)
  seen[from] = 1
  let frontier = [from]
  while (frontier.length > 0) {
    const next: number[] = []
    for (const c of frontier) {
      const cx = cellX(c)
      const cy = cellY(c)
      const neighbors = [
        cy > 0 ? c - GRID_W : -1,
        cy < GRID_H - 1 ? c + GRID_W : -1,
        cx > 0 ? c - 1 : -1,
        cx < GRID_W - 1 ? c + 1 : -1,
      ]
      for (const n of neighbors) {
        if (n < 0 || seen[n]) continue
        if (s.grid[n] === OPEN) return n
        seen[n] = 1
        next.push(n)
      }
    }
    frontier = next
  }
  return -1
}

// Fully sealed board: punch a 3×3 breach so the wave can land anyway.
function punch(s: GameState, center: number): void {
  const cx = cellX(center)
  const cy = cellY(center)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue
      const c = ny * GRID_W + nx
      s.grid[c] = OPEN
      s.drainUntil[c] = 0
      s.wallCreatedAt[c] = -1
      s.fx.breaches.push({ cell: c })
    }
  }
}

// Inward diagonal velocity for a ball spawned at a border cell.
function spawnVelocity(cell: number, speed: number, flip: boolean): [number, number] {
  const cx = cellX(cell)
  const cy = cellY(cell)
  let sx = cx < GRID_W / 2 ? 1 : -1
  let sy = cy < GRID_H / 2 ? 1 : -1
  if (flip) {
    if (cy === 0 || cy === GRID_H - 1) sx = -sx
    else sy = -sy
  }
  return [sx * speed, sy * speed]
}

export function updateWaves(s: GameState): boolean {
  let ballsChanged = false

  if (s.wave < WAVE_COUNT) {
    const st = waveSpawnTick(s.wave)

    // Telegraph: pick portals and queue spawns. (>= with a fired-guard: wave
    // 1's telegraph tick is 0 and the counter starts at 1.)
    if (s.tick >= st - TELEGRAPH_TICKS && s.telegraphedWave !== s.wave) {
      const stream = substream(s.seed, 'wave', s.wave)
      const comp = WAVE_COMP[s.wave]
      const counts = [
        Math.max(1, comp[0] + (stream.int(3) - 1)), // bouncers ±1
        comp[1] > 0 ? Math.max(1, comp[1] + (stream.int(3) - 1)) : 0, // breakers ±1
        comp[2],
        comp[3],
      ]
      const portalCount = Math.min(1 + Math.floor(s.wave / 3), 3)
      // Prefer open border cells; a sealed border just moves the pressure
      // inland to wherever open space is left (row-major candidate order).
      let candidates = openBorderCells(s)
      if (candidates.length === 0) {
        candidates = []
        for (let c = 0; c < GRID_W * GRID_H; c++) {
          if (s.grid[c] === OPEN) candidates.push(c)
        }
      }
      const portals: number[] = []
      for (let i = 0; i < portalCount && candidates.length > 0; i++) {
        const idx = stream.int(candidates.length)
        portals.push(candidates[idx])
        candidates.splice(idx, 1)
      }
      s.portals = portals
      s.telegraphedWave = s.wave
      // Queue spawns: interleave types, cycle portals, stagger ticks.
      const types: BallType[] = []
      const typeIds = [BallType.Bouncer, BallType.Breaker, BallType.Chaser, BallType.Splitter]
      for (let t = 0; t < 4; t++) {
        for (let i = 0; i < counts[t]; i++) types.push(typeIds[t])
      }
      // Deterministic shuffle of spawn order from the same stream.
      for (let i = types.length - 1; i > 0; i--) {
        const j = stream.int(i + 1)
        const tmp = types[i]
        types[i] = types[j]
        types[j] = tmp
      }
      for (let i = 0; i < types.length; i++) {
        s.spawnQueue.push({
          at: st + i * SPAWN_STAGGER,
          type: types[i],
          portal: portals.length > 0 ? portals[i % portals.length] : -1,
        })
      }
    }

    // Wave lands: quota check, then the wave counts as spawned.
    if (s.tick === st) {
      if (s.wave >= 1 && s.claimedCells * 100 < QUOTA_PCT[s.wave - 1] * CELLS) {
        s.status = LOST
        return ballsChanged
      }
      s.wave++
      s.telegraphedWave = -1
    }
  }

  // Process due spawns.
  while (s.spawnQueue.length > 0 && s.spawnQueue[0].at <= s.tick) {
    const sp = s.spawnQueue.shift()!
    if (s.balls.length >= MAX_BALLS) continue
    let portal = sp.portal
    if (portal < 0) portal = BORDER[0]
    // Portal may have been claimed during the telegraph: relocate to the
    // nearest open cell; if the whole board is sealed, punch through.
    if (s.grid[portal] !== OPEN) {
      const relocated = nearestOpen(s, portal)
      if (relocated >= 0) {
        portal = relocated
      } else {
        punch(s, portal)
      }
    }
    let type = sp.type
    if (type === BallType.Chaser) {
      const chasers = s.balls.filter((b) => b.type === BallType.Chaser).length
      if (chasers >= MAX_CHASERS) type = BallType.Bouncer
    }
    // Late waves spawn tougher, faster balls so tower DPS growth never
    // sterilizes the board: +1 HP per 3 waves, +3 Q8/tick per 4 waves.
    const waveNo = Math.max(1, s.wave)
    const speed = BALL_SPEED[type] + Math.floor((waveNo - 1) / 4) * 3
    const stream = substream(s.seed, 'spawnvel', sp.at)
    const [vx, vy] = spawnVelocity(portal, speed, stream.int(2) === 1)
    const b = makeBall(s, type, cellX(portal) * Q + Q / 2, cellY(portal) * Q + Q / 2, vx, vy)
    b.hp = BALL_HP[type] + Math.floor((waveNo - 1) / 3)
    b.speed = speed
    s.balls.push(b)
    ballsChanged = true
  }

  // Win check.
  if (s.status === PLAYING && s.wave === WAVE_COUNT && s.tick >= winTick()) {
    s.status = s.claimedCells * 100 >= QUOTA_PCT[WAVE_COUNT - 1] * CELLS ? WON : LOST
  }

  return ballsChanged
}
