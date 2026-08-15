import { describe, expect, it } from 'vitest'
import { classicalExpectedQueries, optimalIterations, successProb, theta } from './analytic'

describe('theta', () => {
  it('sin θ = √(k/N)', () => {
    expect(theta(4, 1)).toBeCloseTo(Math.PI / 6, 12) // sin θ = 1/2
    expect(theta(2, 1)).toBeCloseTo(Math.PI / 4, 12)
    expect(theta(16, 4)).toBeCloseTo(Math.PI / 6, 12)
  })
})

describe('successProb', () => {
  it('starts at k/N before any iteration', () => {
    expect(successProb(0, 8, 1)).toBeCloseTo(1 / 8, 12)
    expect(successProb(0, 64, 4)).toBeCloseTo(4 / 64, 12)
  })

  it('is exactly 1 at the N=4 sweet spot', () => {
    expect(successProb(1, 4, 1)).toBeCloseTo(1, 12)
  })

  it('is periodic: comes back around after overshooting', () => {
    // The true period π/θ is not an integer, so stepping the nearest whole
    // number of iterations only approximately closes the loop.
    const N = 256
    const t = optimalIterations(N)
    const period = Math.PI / theta(N)
    expect(successProb(t + Math.round(period), N)).toBeCloseTo(successProb(t, N), 2)
  })
})

describe('optimalIterations', () => {
  it('matches ⌊(π/4)√N⌋ for k=1', () => {
    expect(optimalIterations(4)).toBe(1)
    expect(optimalIterations(64)).toBe(6)
    expect(optimalIterations(1024)).toBe(25)
    expect(optimalIterations(1 << 14)).toBe(100)
  })

  it('scales like √(N/k) for k marked items', () => {
    expect(optimalIterations(1024, 4)).toBe(12)
    expect(optimalIterations(16, 4)).toBe(1)
  })

  it('achieves near-certain success at t*', () => {
    for (const N of [64, 256, 4096]) {
      expect(successProb(optimalIterations(N), N)).toBeGreaterThan(0.99)
    }
  })
})

describe('classicalExpectedQueries', () => {
  it('is about N/2 for one winner', () => {
    expect(classicalExpectedQueries(1000, 1)).toBeCloseTo(500.5, 12)
  })
})
