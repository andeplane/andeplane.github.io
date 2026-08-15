// The GPU↔gameplay boundary. Everything gameplay-critical that crosses back
// from the GPU is a monotone accumulator; the engine consumes diffs between
// successive snapshots, so readback staleness can never lose or double-count.

export interface ObservableSnapshot {
  /** Sim tick this snapshot was requested at (monotone). */
  tick: number
  /** Breaches since match start (monotone). */
  breachCount: number
  /** Spores killed by towers since match start (monotone) — feeds bounty. */
  kills: number
  /** Spores that reached the outlet since match start (monotone) — drains lives. */
  escapes: number
}

/** A CPU-side view of one live enemy (from the position readback, extrapolated). */
export interface EnemyView {
  x: number
  y: number
  /** Displacement per tick (for extrapolation between readbacks). */
  vx: number
  vy: number
  hp: number
}

/** A spawn command from the engine to the sim. */
export interface SpawnRequest {
  x: number
  y: number
  hp: number
  seed: number
}
