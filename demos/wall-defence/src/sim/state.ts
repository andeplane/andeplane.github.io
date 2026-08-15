// GameState: every field is an integer (or array/list of integers). The hash
// folds fields in a fixed schema order — never via JSON.

import {
  BallType,
  CELLS,
  GRID_W,
  Q,
  START_MONEY,
  TUTORIAL_BALL_SPEED,
  TowerType,
  UPGRADE_COUNT,
} from './constants'
import { fnv1aInt, substream } from './rng'

export const OPEN = 0
export const WALL = 1
export const CLAIMED = 2
export const DRAINING = 3

export const PLAYING = 0
export const WON = 1
export const LOST = 2

export interface Ball {
  id: number
  type: BallType
  x: number // Q8 center
  y: number
  vx: number // Q8 per tick
  vy: number
  hp: number
  // Breaker bookkeeping
  gnawCell: number // -1 when not gnawing
  gnawLeft: number
  replanAt: number
  pathCell: number // next BFS step target cell, -1 none
  targetWall: number // wall cell the breaker is heading to gnaw, -1 none
}

export interface CutHalf {
  head: number // Q8 along the growth axis
  done: boolean
  shattered: boolean
  armorLeft: number
}

export interface Cut {
  id: number
  orient: 0 | 1 // 0: vertical line (fixed column cx, heads move in y); 1: horizontal (fixed row cy, heads move in x)
  cx: number
  cy: number
  a: CutHalf // decreasing coordinate
  b: CutHalf // increasing coordinate
  sparkAt: number // next SparkingEdge shot tick
}

export interface Tower {
  id: number
  type: TowerType
  tier: number // 0..2
  cell: number
  nextFireAt: number
  spent: number
}

export interface PendingSpawn {
  at: number // tick
  type: BallType
  portal: number // cell index
}

// Transient per-tick effects for the renderer. Never hashed, cleared each tick.
export interface Fx {
  beams: { x1: number; y1: number; x2: number; y2: number; kind: number }[]
  claims: { cells: number[]; burst: number }[]
  shatters: { x: number; y: number }[]
  deaths: { x: number; y: number; type: BallType }[]
  breaches: { cell: number }[]
}

export interface GameState {
  seed: number
  tick: number
  status: number // PLAYING | WON | LOST
  grid: Uint8Array
  drainUntil: Int32Array // per cell; 0 = none
  wallCreatedAt: Int32Array // per cell; -1 for non-wall
  balls: Ball[]
  cuts: Cut[]
  towers: Tower[]
  nextId: number
  money: number
  cutCooldownUntil: number
  claimedCells: number // CLAIMED + DRAINING count (cache, refreshed on recompute)
  wave: number // waves spawned so far (0..10)
  spawnQueue: PendingSpawn[]
  portals: number[] // telegraphed portals for the next wave
  telegraphedWave: number // which wave the portals belong to (-1 none)
  upgrades: number // bitmask
  offerPerm: number[] // daily permutation of upgrade ids
  pendingPicks: number
  currentOffer: number[] // upgrade ids; non-empty freezes step()
  quotasCrossed: number
  rngState: number // in-state stream (player-timing-dependent randomness)
  fx: Fx
}

export function emptyFx(): Fx {
  return { beams: [], claims: [], shatters: [], deaths: [], breaches: [] }
}

export function hasUpgrade(s: GameState, u: number): boolean {
  return (s.upgrades & (1 << u)) !== 0
}

export function makeBall(s: GameState, type: BallType, x: number, y: number, vx: number, vy: number): Ball {
  const b: Ball = {
    id: s.nextId++,
    type,
    x,
    y,
    vx,
    vy,
    hp: 0,
    gnawCell: -1,
    gnawLeft: 0,
    replanAt: 0,
    pathCell: -1,
    targetWall: -1,
  }
  return b
}

export function createState(seed: number): GameState {
  const grid = new Uint8Array(CELLS)
  const drainUntil = new Int32Array(CELLS)
  const wallCreatedAt = new Int32Array(CELLS).fill(-1)

  // Daily permutation of the upgrade pool (Fisher–Yates from a named stream).
  const permStream = substream(seed, 'offers', 0)
  const offerPerm: number[] = []
  for (let i = 0; i < UPGRADE_COUNT; i++) offerPerm.push(i)
  for (let i = UPGRADE_COUNT - 1; i > 0; i--) {
    const j = permStream.int(i + 1)
    const t = offerPerm[i]
    offerPerm[i] = offerPerm[j]
    offerPerm[j] = t
  }

  const s: GameState = {
    seed: seed >>> 0,
    tick: 0,
    status: PLAYING,
    grid,
    drainUntil,
    wallCreatedAt,
    balls: [],
    cuts: [],
    towers: [],
    nextId: 1,
    money: START_MONEY,
    cutCooldownUntil: 0,
    claimedCells: 0,
    wave: 0,
    spawnQueue: [],
    portals: [],
    telegraphedWave: -1,
    upgrades: 0,
    offerPerm,
    pendingPicks: 0,
    currentOffer: [],
    quotasCrossed: 0,
    rngState: (seed ^ 0x9e3779b9) | 0,
    fx: emptyFx(),
  }

  // Two slow tutorial bouncers on the board at t=0, placed from a named
  // stream with generous spacing (left third / right third, mid-height band).
  const place = substream(seed, 'initial', 0)
  const positions: [number, number][] = []
  for (let i = 0; i < 2; i++) {
    const cx = i === 0 ? 8 + place.int(8) : 32 + place.int(8)
    const cy = 8 + place.int(16)
    positions.push([cx * Q + Q / 2, cy * Q + Q / 2])
  }
  for (const [x, y] of positions) {
    const sx = place.int(2) === 0 ? -1 : 1
    const sy = place.int(2) === 0 ? -1 : 1
    const b = makeBall(s, BallType.Bouncer, x, y, sx * TUTORIAL_BALL_SPEED, sy * TUTORIAL_BALL_SPEED)
    b.hp = 3
    s.balls.push(b)
  }
  return s
}

// FNV-1a over every sim-relevant field in fixed schema order. fx excluded.
export function hashState(s: GameState): number {
  let h = 0x811c9dc5
  h = fnv1aInt(h, s.seed)
  h = fnv1aInt(h, s.tick)
  h = fnv1aInt(h, s.status)
  for (let i = 0; i < CELLS; i++) h = fnv1aInt(h, s.grid[i])
  for (let i = 0; i < CELLS; i++) h = fnv1aInt(h, s.drainUntil[i])
  for (let i = 0; i < CELLS; i++) h = fnv1aInt(h, s.wallCreatedAt[i])
  h = fnv1aInt(h, s.balls.length)
  for (const b of s.balls) {
    h = fnv1aInt(h, b.id)
    h = fnv1aInt(h, b.type)
    h = fnv1aInt(h, b.x)
    h = fnv1aInt(h, b.y)
    h = fnv1aInt(h, b.vx)
    h = fnv1aInt(h, b.vy)
    h = fnv1aInt(h, b.hp)
    h = fnv1aInt(h, b.gnawCell)
    h = fnv1aInt(h, b.gnawLeft)
    h = fnv1aInt(h, b.replanAt)
    h = fnv1aInt(h, b.pathCell)
    h = fnv1aInt(h, b.targetWall)
  }
  h = fnv1aInt(h, s.cuts.length)
  for (const c of s.cuts) {
    h = fnv1aInt(h, c.id)
    h = fnv1aInt(h, c.orient)
    h = fnv1aInt(h, c.cx)
    h = fnv1aInt(h, c.cy)
    for (const half of [c.a, c.b]) {
      h = fnv1aInt(h, half.head)
      h = fnv1aInt(h, half.done ? 1 : 0)
      h = fnv1aInt(h, half.shattered ? 1 : 0)
      h = fnv1aInt(h, half.armorLeft)
    }
    h = fnv1aInt(h, c.sparkAt)
  }
  h = fnv1aInt(h, s.towers.length)
  for (const t of s.towers) {
    h = fnv1aInt(h, t.id)
    h = fnv1aInt(h, t.type)
    h = fnv1aInt(h, t.tier)
    h = fnv1aInt(h, t.cell)
    h = fnv1aInt(h, t.nextFireAt)
    h = fnv1aInt(h, t.spent)
  }
  h = fnv1aInt(h, s.nextId)
  h = fnv1aInt(h, s.money)
  h = fnv1aInt(h, s.cutCooldownUntil)
  h = fnv1aInt(h, s.claimedCells)
  h = fnv1aInt(h, s.wave)
  h = fnv1aInt(h, s.spawnQueue.length)
  for (const q of s.spawnQueue) {
    h = fnv1aInt(h, q.at)
    h = fnv1aInt(h, q.type)
    h = fnv1aInt(h, q.portal)
  }
  h = fnv1aInt(h, s.portals.length)
  for (const p of s.portals) h = fnv1aInt(h, p)
  h = fnv1aInt(h, s.telegraphedWave)
  h = fnv1aInt(h, s.upgrades)
  for (const u of s.offerPerm) h = fnv1aInt(h, u)
  h = fnv1aInt(h, s.pendingPicks)
  h = fnv1aInt(h, s.currentOffer.length)
  for (const u of s.currentOffer) h = fnv1aInt(h, u)
  h = fnv1aInt(h, s.quotasCrossed)
  h = fnv1aInt(h, s.rngState)
  return h >>> 0
}

export function cellX(cell: number): number {
  return cell % GRID_W
}
export function cellY(cell: number): number {
  return Math.floor(cell / GRID_W)
}
