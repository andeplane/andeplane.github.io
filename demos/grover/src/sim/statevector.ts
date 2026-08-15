// A quantum statevector simulator, in full.
//
// A state on n qubits is 2^n complex amplitudes. That's the whole data
// structure — two Float64Arrays. Every gate below is a loop that mixes
// pairs of amplitudes. There is no other machinery.

export interface StateVector {
  re: Float64Array
  im: Float64Array
  n: number // number of qubits; dimension is 2^n
}

/** |00…0⟩ — amplitude 1 at index 0, zero everywhere else. */
export function zeroState(n: number): StateVector {
  const dim = 1 << n
  const s = { re: new Float64Array(dim), im: new Float64Array(dim), n }
  s.re[0] = 1
  return s
}

const SQRT1_2 = Math.SQRT1_2 // 1/√2

/**
 * Hadamard on qubit q. Pairs up basis states that differ only in bit q
 * and replaces (a, b) with ((a+b)/√2, (a−b)/√2).
 */
export function applyH(s: StateVector, q: number): void {
  const mask = 1 << q
  for (let i = 0; i < s.re.length; i++) {
    if (i & mask) continue // visit each pair once, from its low member
    const j = i | mask
    const aRe = s.re[i], aIm = s.im[i]
    const bRe = s.re[j], bIm = s.im[j]
    s.re[i] = (aRe + bRe) * SQRT1_2
    s.im[i] = (aIm + bIm) * SQRT1_2
    s.re[j] = (aRe - bRe) * SQRT1_2
    s.im[j] = (aIm - bIm) * SQRT1_2
  }
}

/** Pauli X (NOT) on qubit q: swap the amplitudes of each pair. */
export function applyX(s: StateVector, q: number): void {
  const mask = 1 << q
  for (let i = 0; i < s.re.length; i++) {
    if (i & mask) continue
    const j = i | mask
    const tRe = s.re[i], tIm = s.im[i]
    s.re[i] = s.re[j]
    s.im[i] = s.im[j]
    s.re[j] = tRe
    s.im[j] = tIm
  }
}

/** Pauli Z on qubit q: flip the sign of every amplitude where bit q is 1. */
export function applyZ(s: StateVector, q: number): void {
  const mask = 1 << q
  for (let i = 0; i < s.re.length; i++) {
    if (i & mask) {
      s.re[i] = -s.re[i]
      s.im[i] = -s.im[i]
    }
  }
}

/**
 * Multi-controlled Z across all qubits: flip the sign of |11…1⟩ only.
 * The scariest-sounding gate in the algorithm is one line of physics.
 */
export function applyMCZ(s: StateVector): void {
  const last = s.re.length - 1
  s.re[last] = -s.re[last]
  s.im[last] = -s.im[last]
}

/** H on every qubit. From |0…0⟩ this builds the uniform superposition. */
export function hadamardAll(s: StateVector): void {
  for (let q = 0; q < s.n; q++) applyH(s, q)
}

/** Measurement probabilities: |amplitude|² for each basis state. */
export function probabilities(s: StateVector): Float64Array {
  const p = new Float64Array(s.re.length)
  for (let i = 0; i < p.length; i++) {
    p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i]
  }
  return p
}

/** Total probability. Gates are unitary, so this stays exactly 1. */
export function norm(s: StateVector): number {
  let t = 0
  for (let i = 0; i < s.re.length; i++) {
    t += s.re[i] * s.re[i] + s.im[i] * s.im[i]
  }
  return Math.sqrt(t)
}
