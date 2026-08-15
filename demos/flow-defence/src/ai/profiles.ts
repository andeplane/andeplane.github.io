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
    epochSeconds: 5,
    dripLevel: 0.55,
    surgeThreshold: null,
    surgeBiomass: 0,
    focus: 0.15,
    explore: 0.1,
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
