// Closed-form Grover, no simulation.
//
// With k marked items out of N, the state lives in a 2D plane and each
// iteration rotates it by 2θ, where sin θ = √(k/N). Everything below
// follows from that one fact.

/** The rotation half-angle: sin θ = √(k/N). */
export function theta(N: number, k = 1): number {
  return Math.asin(Math.sqrt(k / N))
}

/** Probability of measuring a marked item after t full iterations. */
export function successProb(t: number, N: number, k = 1): number {
  const s = Math.sin((2 * t + 1) * theta(N, k))
  return s * s
}

/**
 * The iteration count that lands closest to the target, ≈ (π/4)·√(N/k).
 * When k/N > 1/2 this is 0 — the uniform state already beats a coin flip
 * and any iteration only rotates past the target.
 */
export function optimalIterations(N: number, k = 1): number {
  return Math.floor((Math.PI / 4) / theta(N, k))
}

/** Expected classical queries to find one of k winners among N boxes. */
export function classicalExpectedQueries(N: number, k = 1): number {
  return (N + 1) / (k + 1)
}
