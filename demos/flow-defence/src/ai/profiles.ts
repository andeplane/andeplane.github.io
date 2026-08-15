// Attacker AI profiles — pure data (the particle-defence AIProfile pattern).
// One profile = one strategy; they double as difficulty settings and, later,
// as balance-test instruments in headless tournaments.

export interface AIProfile {
  name: string
  /** Seconds between decision epochs. */
  epochSeconds: number
  /** Steady release level on active arms (0..1). */
  dripLevel: number
  /** Bank until tank ≥ this fraction of capacity, then surge; null = never surge. */
  surgeThreshold: number | null
  /** Release level during a surge. */
  surgeBiomass: number
  /** Route concentration: 0 = spread across arms, 1 = all-in on the best arm. */
  focus: number
  /** Probability per epoch of re-testing a random arm (exploration). */
  explore: number
}

export const PROFILES: Record<string, AIProfile> = {
  steady: {
    name: 'steady',
    epochSeconds: 6,
    dripLevel: 0.5,
    // A rare, mild surge: teaches the mechanic gently — and means even a lazy
    // attacker can eventually crack a total dam (the no-block rule needs it).
    surgeThreshold: 0.97,
    surgeBiomass: 0.6,
    // High focus: one readable main river (that occasionally migrates), not a
    // featureless flood across every arm.
    focus: 0.75,
    explore: 0.2,
  },
  burster: {
    name: 'burster',
    epochSeconds: 4,
    dripLevel: 0.18,
    surgeThreshold: 0.85,
    surgeBiomass: 1,
    focus: 0.8,
    explore: 0.15,
  },
  prober: {
    name: 'prober',
    epochSeconds: 3,
    dripLevel: 0.35,
    surgeThreshold: 0.6,
    surgeBiomass: 0.9,
    focus: 0.55,
    explore: 0.35,
  },
}
