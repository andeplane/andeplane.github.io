// Single-qubit gates as 2×2 complex matrices.
//
// A matrix is stored flat, row-major, interleaved real/imaginary:
//   [re00, im00, re01, im01, re10, im10, re11, im11]
// so that it can be copied straight into a GPU uniform. Every gate the engine
// knows is one of these plus a set of control qubits; swaps and permutations
// are the only other primitives.

export type Mat2 = readonly [number, number, number, number, number, number, number, number]

const S = Math.SQRT1_2

export const I: Mat2 = [1, 0, 0, 0, 0, 0, 1, 0]
export const H: Mat2 = [S, 0, S, 0, S, 0, -S, 0]
export const X: Mat2 = [0, 0, 1, 0, 1, 0, 0, 0]
export const Y: Mat2 = [0, 0, 0, -1, 0, 1, 0, 0]
export const Z: Mat2 = [1, 0, 0, 0, 0, 0, -1, 0]
export const SGate: Mat2 = [1, 0, 0, 0, 0, 0, 0, 1]
export const SDG: Mat2 = [1, 0, 0, 0, 0, 0, 0, -1]
export const T: Mat2 = [1, 0, 0, 0, 0, 0, S, S]
export const TDG: Mat2 = [1, 0, 0, 0, 0, 0, S, -S]

/** diag(1, e^{iθ}): the phase gate, also called P(θ) or R(θ). */
export function phase(theta: number): Mat2 {
  return [1, 0, 0, 0, 0, 0, Math.cos(theta), Math.sin(theta)]
}

export function rx(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2)
  return [c, 0, 0, -s, 0, -s, c, 0]
}

export function ry(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2)
  return [c, 0, -s, 0, s, 0, c, 0]
}

export function rz(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2)
  return [c, -s, 0, 0, 0, 0, c, s]
}

/** Conjugate transpose: the inverse of a unitary. */
export function dagger(m: Mat2): Mat2 {
  return [m[0], -m[1], m[4], -m[5], m[2], -m[3], m[6], -m[7]]
}

/** Matrix product a·b (apply b first, then a). */
export function mul(a: Mat2, b: Mat2): Mat2 {
  const out = new Array<number>(8)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      let re = 0, im = 0
      for (let k = 0; k < 2; k++) {
        const aRe = a[(r * 2 + k) * 2], aIm = a[(r * 2 + k) * 2 + 1]
        const bRe = b[(k * 2 + c) * 2], bIm = b[(k * 2 + c) * 2 + 1]
        re += aRe * bRe - aIm * bIm
        im += aRe * bIm + aIm * bRe
      }
      out[(r * 2 + c) * 2] = re
      out[(r * 2 + c) * 2 + 1] = im
    }
  }
  return out as unknown as Mat2
}

/** True when the matrix only multiplies |0⟩ and |1⟩ by phases (no mixing). */
export function isDiagonal(m: Mat2): boolean {
  return m[2] === 0 && m[3] === 0 && m[4] === 0 && m[5] === 0
}
