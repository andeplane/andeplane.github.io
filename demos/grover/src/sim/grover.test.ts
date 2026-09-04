import { describe, expect, it } from 'vitest'
import { norm, type StateVector } from './statevector'
import {
  diffusionAsGates,
  diffusionDirect,
  groverIteration,
  oracleAsGates,
  oraclePhaseFlip,
  uniformSuperposition,
} from './grover'
import { optimalIterations, successProb, theta } from './analytic'
import { runSchedule, snapshotIndex, successProbability } from './engine'

function clone(s: StateVector): StateVector {
  return { re: s.re.slice(), im: s.im.slice(), n: s.n }
}

/** Assert a ≡ b exactly, or a ≡ −b (equal up to global phase −1). */
function expectEqualUpToGlobalSign(a: StateVector, b: StateVector, tol = 1e-12) {
  // Decide the sign from the largest-magnitude amplitude of b.
  let big = 0
  for (let i = 1; i < b.re.length; i++) {
    if (Math.abs(b.re[i]) > Math.abs(b.re[big])) big = i
  }
  const sign = Math.sign(a.re[big]) === Math.sign(b.re[big]) ? 1 : -1
  for (let i = 0; i < a.re.length; i++) {
    expect(Math.abs(a.re[i] - sign * b.re[i])).toBeLessThan(tol)
    expect(Math.abs(a.im[i] - sign * b.im[i])).toBeLessThan(tol)
  }
  return sign
}

describe('oracle: gate form ≡ direct form', () => {
  it('agrees exactly for every marked item, n = 3 and 4', () => {
    for (const n of [3, 4]) {
      for (let m = 0; m < 1 << n; m++) {
        const a = uniformSuperposition(n)
        const b = clone(a)
        oraclePhaseFlip(a, new Set([m]))
        oracleAsGates(b, m)
        for (let i = 0; i < a.re.length; i++) {
          expect(Math.abs(a.re[i] - b.re[i])).toBeLessThan(1e-12)
        }
      }
    }
  })
})

describe('diffusion: gate form ≡ direct form up to global phase', () => {
  it('agrees up to a global −1 for n = 2, 3, 4', () => {
    for (const n of [2, 3, 4]) {
      const a = uniformSuperposition(n)
      oraclePhaseFlip(a, new Set([1])) // a non-trivial state
      const b = clone(a)
      diffusionDirect(a)
      diffusionAsGates(b)
      const sign = expectEqualUpToGlobalSign(a, b)
      // The decomposition really is −(2|s⟩⟨s| − I): the sign must be −1.
      expect(sign).toBe(-1)
    }
  })
})

describe('exact analytic hits', () => {
  it('N=4, k=1: one iteration reaches probability 1 exactly', () => {
    const s = uniformSuperposition(2)
    groverIteration(s, new Set([3]))
    expect(s.re[3]).toBeCloseTo(1, 12)
    expect(s.re[0]).toBeCloseTo(0, 12)
    expect(optimalIterations(4, 1)).toBe(1)
  })

  it('N=16, k=4: one iteration reaches probability 1 exactly', () => {
    const marked = new Set([2, 5, 11, 14])
    const s = uniformSuperposition(4)
    groverIteration(s, marked)
    let p = 0
    for (const m of marked) p += s.re[m] * s.re[m]
    expect(p).toBeCloseTo(1, 12)
    expect(optimalIterations(16, 4)).toBe(1)
  })
})

describe('simulation matches the closed form', () => {
  it('sim success probability equals sin²((2t+1)θ) for N∈{8,16,64}, k∈{1,2}', () => {
    for (const n of [3, 4, 6]) {
      const N = 1 << n
      for (const k of [1, 2]) {
        const marked = new Set(Array.from({ length: k }, (_, i) => i * 3 + 1))
        const snaps = runSchedule(n, marked, 12)
        for (let t = 0; t <= 12; t++) {
          const snap = snaps[snapshotIndex(t, t === 0 ? 'initial' : 'post-diffusion')]
          expect(Math.abs(successProbability(snap, marked) - successProb(t, N, k))).toBeLessThan(
            1e-12,
          )
        }
      }
    }
  })

  it('overshoot: probability dips after t* and comes back within one period', () => {
    const N = 64
    const tStar = optimalIterations(N) // 6
    const pStar = successProb(tStar, N)
    expect(successProb(tStar + 3, N)).toBeLessThan(pStar / 2)
    const period = Math.ceil(Math.PI / (2 * theta(N)))
    let recovered = false
    for (let t = tStar + 1; t <= tStar + period; t++) {
      if (successProb(t, N) > 0.99 * pStar) recovered = true
    }
    expect(recovered).toBe(true)
  })

  it('norm stays 1 for 50 iterations at n=10', () => {
    const s = uniformSuperposition(10)
    const marked = new Set([777])
    for (let t = 0; t < 50; t++) groverIteration(s, marked)
    expect(Math.abs(norm(s) - 1)).toBeLessThan(1e-12)
  })

  it('n=12 smoke test hits the analytic optimum', () => {
    const N = 1 << 12
    const marked = new Set([1234])
    const tStar = optimalIterations(N)
    const s = uniformSuperposition(12)
    for (let t = 0; t < tStar; t++) groverIteration(s, marked)
    const p = s.re[1234] * s.re[1234]
    expect(Math.abs(p - successProb(tStar, N))).toBeLessThan(1e-12)
    expect(p).toBeGreaterThan(0.999)
  })
})

describe('broken oracles', () => {
  it('no-op oracle: probabilities never move off uniform', () => {
    const marked = new Set([5])
    const snaps = runSchedule(3, marked, 6, { behavior: 'no-op' })
    for (const snap of snaps) {
      expect(Math.abs(successProbability(snap, marked) - 1 / 8)).toBeLessThan(1e-12)
    }
  })

  it('wrong-item oracle: amplifies the wrong index, not the marked one', () => {
    const marked = new Set([5])
    const snaps = runSchedule(3, marked, 2, { behavior: 'wrong-item' })
    const last = snaps[snaps.length - 1]
    // The wrong item (index 0, first unmarked) gets the amplification…
    expect(last.probs[0]).toBeCloseTo(successProb(2, 8, 1), 12)
    // …while the actually-marked item decays like any other loser.
    expect(successProbability(last, marked)).toBeLessThan(1 / 8)
  })
})
