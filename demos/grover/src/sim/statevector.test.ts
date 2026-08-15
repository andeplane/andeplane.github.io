import { describe, expect, it } from 'vitest'
import {
  applyH,
  applyMCZ,
  applyX,
  applyZ,
  hadamardAll,
  norm,
  probabilities,
  zeroState,
  type StateVector,
} from './statevector'

/** Deterministic pseudo-random state for algebra tests. */
function randomState(n: number, seed = 12345): StateVector {
  const dim = 1 << n
  const s = { re: new Float64Array(dim), im: new Float64Array(dim), n }
  let x = seed
  const next = () => {
    // xorshift32
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) / 0xffffffff) * 2 - 1
  }
  let normSq = 0
  for (let i = 0; i < dim; i++) {
    s.re[i] = next()
    s.im[i] = next()
    normSq += s.re[i] * s.re[i] + s.im[i] * s.im[i]
  }
  const inv = 1 / Math.sqrt(normSq)
  for (let i = 0; i < dim; i++) {
    s.re[i] *= inv
    s.im[i] *= inv
  }
  return s
}

function clone(s: StateVector): StateVector {
  return { re: s.re.slice(), im: s.im.slice(), n: s.n }
}

function expectClose(a: StateVector, b: StateVector, tol = 1e-12) {
  for (let i = 0; i < a.re.length; i++) {
    expect(Math.abs(a.re[i] - b.re[i])).toBeLessThan(tol)
    expect(Math.abs(a.im[i] - b.im[i])).toBeLessThan(tol)
  }
}

describe('zeroState', () => {
  it('is |0…0⟩ with norm 1', () => {
    const s = zeroState(3)
    expect(s.re[0]).toBe(1)
    expect(norm(s)).toBe(1)
    expect(probabilities(s)[0]).toBe(1)
  })
})

describe('gate algebra', () => {
  it('H·H = I on random states', () => {
    for (let q = 0; q < 4; q++) {
      const s = randomState(4)
      const before = clone(s)
      applyH(s, q)
      applyH(s, q)
      expectClose(s, before)
    }
  })

  it('X·X = I and Z·Z = I', () => {
    const s = randomState(3)
    const before = clone(s)
    applyX(s, 1)
    applyX(s, 1)
    expectClose(s, before)
    applyZ(s, 2)
    applyZ(s, 2)
    expectClose(s, before)
  })

  it('X on qubit q swaps amplitudes across bit q', () => {
    const s = zeroState(3)
    applyX(s, 1) // |000⟩ → |010⟩
    expect(s.re[2]).toBe(1)
    expect(s.re[0]).toBe(0)
  })

  it('MCZ negates only the last index', () => {
    const s = randomState(3)
    const before = clone(s)
    applyMCZ(s)
    for (let i = 0; i < 8; i++) {
      const sign = i === 7 ? -1 : 1
      expect(s.re[i]).toBe(sign * before.re[i])
      expect(s.im[i]).toBe(sign * before.im[i])
    }
  })

  it('hadamardAll on |0…0⟩ gives the uniform superposition', () => {
    const s = zeroState(4)
    hadamardAll(s)
    for (let i = 0; i < 16; i++) {
      expect(s.re[i]).toBeCloseTo(0.25, 12)
      expect(s.im[i]).toBe(0)
    }
  })

  it('gates preserve the norm', () => {
    const s = randomState(5)
    applyH(s, 0)
    applyX(s, 3)
    applyZ(s, 2)
    applyMCZ(s)
    hadamardAll(s)
    expect(norm(s)).toBeCloseTo(1, 12)
  })
})
