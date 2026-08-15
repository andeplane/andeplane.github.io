// The GPU↔gameplay boundary. Everything gameplay-critical that crosses back
// from the GPU is a monotone accumulator; the engine consumes diffs between
// successive snapshots, so readback staleness can never lose or double-count.

export interface ObservableSnapshot {
  /** Sim tick this snapshot was requested at (monotone). */
  tick: number
  /** Breaches since match start (monotone). */
  breachCount: number
  /** Total biomass absorbed at the outlet since match start (monotone) — the score integral. */
  outletBiomass: number
  /** Biomass neutralized by towers since match start (monotone) — feeds bounty. */
  neutralized: number
  /** Biomass currently in flight (instantaneous). */
  totalBiomass: number
  /** Mean density over each inlet segment (instantaneous) — the surge telegraph. */
  segmentRho: number[]
}
