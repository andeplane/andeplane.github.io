// Every tunable in one place. All positions/velocities are Q8 fixed point
// (1 cell = 256 units) and all durations are in 60 Hz ticks.

export const TICK_HZ = 60

export const GRID_W = 48
export const GRID_H = 32
export const CELLS = GRID_W * GRID_H

export const Q = 256
export const BOARD_W = GRID_W * Q
export const BOARD_H = GRID_H * Q

// Balls
export const BALL_HALF = 96 // AABB half-extent, 0.375 cells
export const MAX_BALLS = 60
export const MAX_CHASERS = 3

export const BallType = {
  Bouncer: 0,
  Breaker: 1,
  Chaser: 2,
  Splitter: 3,
  Fragment: 4,
} as const
export type BallType = (typeof BallType)[keyof typeof BallType]

// Per-axis speed in Q8/tick (bouncers move at (±v, ±v)).
export const BALL_SPEED: Record<BallType, number> = {
  [BallType.Bouncer]: 17, // ~4 cells/s per axis
  [BallType.Breaker]: 14, // steering speed (total, not per axis)
  [BallType.Chaser]: 22,
  [BallType.Splitter]: 15,
  [BallType.Fragment]: 26,
}

export const BALL_HP: Record<BallType, number> = {
  [BallType.Bouncer]: 3,
  [BallType.Breaker]: 5,
  [BallType.Chaser]: 4,
  [BallType.Splitter]: 6,
  [BallType.Fragment]: 1,
}

export const SPLITTER_CHILDREN = 2
export const TUTORIAL_BALL_SPEED = 12 // the two t=0 bouncers are slow

// Cuts
export const WALL_SPEED = 36 // Q8/tick per head ≈ 8.4 cells/s
export const CUT_COOLDOWN = 150 // 2.5 s after a shatter
export const CUT_COOLDOWN_CHASED = 75 // halved when a chaser did it
export const STEER_REPLAN_TICKS = 20

// Breaker
export const GNAW_TICKS = 75 // 1.25 s per wall cell
export const FRESH_PAINT_TICKS = 900 // walls younger than this are immune (upgrade 6)

// Claims
export const DRAIN_TICKS = 240 // 4 s breach grace window

// Economy (money unit: ¢)
export const START_MONEY = 30
export const INCOME_BASE = 2 // per second
export const INCOME_PCT_DIVISOR = 10 // +1¢/s per 10% claimed
export const BURST_DIVISOR = 4 // burst = floor(area * mult / 4)
// Capture burst multiplier tiers, compared as exact rationals:
// area*100 >= pct*CELLS  →  ×2 at 5 %, ×3 at 10 %
export const BURST_TIER2_PCT = 5
export const BURST_TIER3_PCT = 10
export const OVERCLAIM_CENTS_PER_PCT = 2

// Towers
export const TowerType = {
  Turret: 0,
  Slow: 1,
} as const
export type TowerType = (typeof TowerType)[keyof typeof TowerType]
// [tier1, tier2, tier3]
export const TURRET_COST = [25, 55, 110]
export const TURRET_DMG = [1, 2, 2]
export const TURRET_PERIOD = [48, 48, 30] // ticks between shots
export const TURRET_RANGE = [6 * Q, 6 * Q, 8 * Q]
export const SLOW_COST = [35, 60, 95]
export const SLOW_MULT = [154, 115, 115] // Q8 speed multiplier (0.60, 0.45)
export const SLOW_RANGE = [4 * Q, 4 * Q, 6 * Q]
export const SELL_REFUND_NUM = 2 // refund = 2/3 of total spent
export const SELL_REFUND_DEN = 3

// Waves (10 waves; times in ticks)
export const WAVE_COUNT = 10
export const FIRST_WAVE_TICK = 5 * TICK_HZ
export const WAVE_INTERVAL = 30 * TICK_HZ
export const TELEGRAPH_TICKS = 5 * TICK_HZ
export const WIN_TAIL_TICKS = 30 * TICK_HZ // survive this long after wave 10
export const SPAWN_STAGGER = 15 // ticks between balls of one wave
export const QUOTA_PCT = [12, 18, 25, 32, 40, 48, 54, 60, 63, 65]

// Wave composition base counts [bouncer, breaker, chaser, splitter] per wave.
export const WAVE_COMP: ReadonlyArray<readonly [number, number, number, number]> = [
  [3, 0, 0, 0],
  [2, 2, 0, 0],
  [3, 2, 1, 0],
  [3, 4, 1, 0],
  [4, 5, 2, 0],
  [4, 5, 2, 2],
  [4, 5, 2, 2],
  [4, 5, 3, 3],
  [5, 6, 3, 3],
  [6, 7, 3, 4],
]

// Upgrades
export const UPGRADE_COUNT = 8
export const Upgrade = {
  SparkingEdge: 0, // growing heads fire at nearby balls
  TwinCut: 1, // two simultaneous cuts
  DetonatingClaims: 2, // sealing damages balls within 2 cells
  ArmoredWalls: 3, // a growing half survives one hit
  FastHands: 4, // +40% wall growth speed
  FreshPaint: 5, // new walls breaker-proof for 15 s
  Garrison: 6, // big claims spawn a free turret
  OverclaimDividend: 7, // income per % above quota
} as const
export type Upgrade = (typeof Upgrade)[keyof typeof Upgrade]
export const SPARK_DMG_PERIOD = 60 // 1 dmg/s
export const SPARK_RANGE = 5 * Q
export const DETONATE_DMG = 3
export const DETONATE_RANGE_CELLS = 2
export const FAST_HANDS_MULT = 358 // Q8 ×1.4
export const GARRISON_MIN_PCT = 4 // area*100 >= pct*CELLS
