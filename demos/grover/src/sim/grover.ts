// Grover's two moves — each written twice.
//
// The "direct" forms are the geometric story the essay tells (flip a sign,
// reflect about the mean). The "gate" forms are the same operations built
// from H, X and MCZ, as a quantum computer would run them. Unit tests
// assert the two forms agree — that equality is the essay's central claim.

import { applyMCZ, applyX, hadamardAll, zeroState, type StateVector } from './statevector'

/** The oracle, directly: flip the sign of every marked amplitude. */
export function oraclePhaseFlip(s: StateVector, marked: ReadonlySet<number>): void {
  for (const m of marked) {
    s.re[m] = -s.re[m]
    s.im[m] = -s.im[m]
  }
}

/**
 * The oracle as gates, for a single marked item m: wrap MCZ in X gates on
 * every qubit where m has a 0 bit, so that exactly |m⟩ picks up the minus
 * sign. The X placement is where the answer is wired into the circuit.
 */
export function oracleAsGates(s: StateVector, m: number): void {
  const flips: number[] = []
  for (let q = 0; q < s.n; q++) {
    if (!(m & (1 << q))) flips.push(q)
  }
  for (const q of flips) applyX(s, q)
  applyMCZ(s)
  for (const q of flips) applyX(s, q)
}

/** Diffusion, directly: reflect every amplitude about the mean. */
export function diffusionDirect(s: StateVector): void {
  let meanRe = 0
  let meanIm = 0
  for (let i = 0; i < s.re.length; i++) {
    meanRe += s.re[i]
    meanIm += s.im[i]
  }
  meanRe /= s.re.length
  meanIm /= s.re.length
  for (let i = 0; i < s.re.length; i++) {
    s.re[i] = 2 * meanRe - s.re[i]
    s.im[i] = 2 * meanIm - s.im[i]
  }
}

/**
 * Diffusion as gates: H⊗ⁿ, X⊗ⁿ, MCZ, X⊗ⁿ, H⊗ⁿ. This implements
 * −(2|s⟩⟨s| − I): the same reflection as diffusionDirect times a global
 * phase of −1, which no measurement can detect.
 */
export function diffusionAsGates(s: StateVector): void {
  hadamardAll(s)
  for (let q = 0; q < s.n; q++) applyX(s, q)
  applyMCZ(s)
  for (let q = 0; q < s.n; q++) applyX(s, q)
  hadamardAll(s)
}

/** One Grover iteration: oracle, then diffusion. Two mirrors. */
export function groverIteration(s: StateVector, marked: ReadonlySet<number>): void {
  oraclePhaseFlip(s, marked)
  diffusionDirect(s)
}

/** The state Grover starts from: H on every qubit of |0…0⟩. */
export function uniformSuperposition(n: number): StateVector {
  const s = zeroState(n)
  hadamardAll(s)
  return s
}
