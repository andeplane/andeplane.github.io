// The classical bookkeeping around the circuit: which N are worth handing to
// a quantum computer, and which bases a are worth trying.

import { bitLength, gcd, multiplicativeOrder, modPow, shorQubits, type ShorArithmetic } from '@andeplane/quantum'

export function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
  return true
}

/** n = p^k for a prime p and k ≥ 1. */
export function isPrimePower(n: number): boolean {
  for (let p = 2; p * p <= n; p++) {
    if (n % p !== 0) continue
    while (n % p === 0) n /= p
    return n === 1
  }
  return n > 1
}

/**
 * Why N is not a job for Shor's algorithm, or null if it is. Classical
 * pre-checks catch even numbers, primes and prime powers cheaply.
 */
export function rejectN(N: number): string | null {
  if (!Number.isInteger(N) || N < 15) return 'Pick an integer of at least 15; that is the smallest number Shor is interesting for.'
  if (N % 2 === 0) return `${N} is even. A classical computer spots the factor 2 instantly.`
  if (isPrime(N)) return `${N} is prime, so there is nothing to factor.`
  if (isPrimePower(N)) return `${N} is a prime power. A classical root test finds that without any quantum help.`
  return null
}

/** The odd composites, non-prime-powers, in a range: Shor's natural targets. */
export function shorTargets(max: number): number[] {
  const out: number[] = []
  for (let N = 15; N <= max; N++) if (rejectN(N) === null) out.push(N)
  return out
}

export interface BaseInfo {
  readonly a: number
  /** Order of a mod N: the period the circuit finds. Only for hinting after a run. */
  readonly r: number
  /** True when r is even and a^{r/2} ≢ −1, i.e. this a factors N. */
  readonly good: boolean
}

/** Every base a with gcd(a, N) = 1, and whether it leads to factors. */
export function bases(N: number): BaseInfo[] {
  const out: BaseInfo[] = []
  for (let a = 2; a < N; a++) {
    if (gcd(a, N) !== 1) continue
    const r = multiplicativeOrder(a, N)
    out.push({ a, r, good: r % 2 === 0 && modPow(a, r / 2, N) !== N - 1 })
  }
  return out
}

export interface Plan {
  readonly n: number
  readonly t: number
  readonly qubits: number
  readonly bytes: number
}

/** Qubits for a configuration, and the largest counting register that fits. */
export function plan(N: number, t: number, arithmetic: ShorArithmetic): Plan {
  const qubits = shorQubits(N, t, arithmetic)
  return { n: bitLength(N), t, qubits, bytes: 2 ** qubits * 8 }
}

export function maxCounting(N: number, arithmetic: ShorArithmetic, maxQubits: number): number {
  return maxQubits - shorQubits(N, 0, arithmetic)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** An angle as a tidy multiple of π where possible: π/4, 3π/8, −π/2. */
export function formatAngle(theta: number): string {
  const x = theta / Math.PI
  for (let den = 1; den <= 4096; den *= 2) {
    const num = Math.round(x * den)
    if (Math.abs(num / den - x) < 1e-9) {
      if (num === 0) return '0'
      const sign = num < 0 ? '−' : ''
      const a = Math.abs(num)
      const top = a === 1 ? 'π' : `${a}π`
      return den === 1 ? `${sign}${top}` : `${sign}${top}/${den}`
    }
  }
  return theta.toFixed(3)
}
