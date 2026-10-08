// Shor's algorithm as a circuit, plus the classical code either side of it.
//
// The quantum part is phase estimation of U_a: |x⟩ → |a·x mod N⟩. A counting
// register of t qubits in uniform superposition controls U_a^{2^k} from qubit
// k, which writes a^j mod N into the work register for every j at once. The
// work register's values repeat with the period r we are after, and the
// inverse QFT turns that period into peaks at multiples of 2^t / r.

import { Circuit, type Block } from '../circuit.ts'
import { inverseQft } from './qft.ts'
import { cModMul, gcd, modPow } from './arithmetic.ts'

export type ShorArithmetic =
  /** Every modular multiplication built from phase gates (Beauregard). */
  | 'gates'
  /** Each controlled multiplication as one permutation op on the work register. */
  | 'oracle'

export interface ShorOptions {
  readonly N: number
  readonly a: number
  /** Counting qubits; 2n gives the textbook success guarantee. */
  readonly countingQubits?: number
  readonly arithmetic?: ShorArithmetic
}

export interface ShorCircuit {
  readonly circuit: Circuit
  readonly N: number
  readonly a: number
  /** Bits in N. */
  readonly n: number
  readonly counting: readonly number[]
  readonly work: readonly number[]
  /** Fourier-space accumulator and ancilla; empty in oracle mode. */
  readonly scratch: readonly number[]
  /** Top-level steps, in order: prepare, one multiplication per counting qubit, QFT†. */
  readonly steps: readonly Block[]
}

export function bitLength(N: number): number {
  return Math.ceil(Math.log2(N + 1))
}

/** Qubits a configuration needs, without building it. */
export function shorQubits(N: number, countingQubits: number, arithmetic: ShorArithmetic): number {
  const n = bitLength(N)
  return countingQubits + n + (arithmetic === 'gates' ? n + 2 : 0)
}

export function shorCircuit(opts: ShorOptions): ShorCircuit {
  const { N, a } = opts
  const arithmetic = opts.arithmetic ?? 'gates'
  if (!Number.isInteger(N) || N < 3) throw new Error('N must be an integer ≥ 3')
  if (!Number.isInteger(a) || a < 2 || a >= N) throw new Error('a must be an integer with 2 ≤ a < N')
  if (gcd(a, N) !== 1) throw new Error(`gcd(${a}, ${N}) = ${gcd(a, N)}: that is already a factor, no quantum computer needed`)
  const n = bitLength(N)
  const t = opts.countingQubits ?? 2 * n

  const c = new Circuit(`Shor: factor ${N} with a = ${a}`)
  const counting = c.addRegister('counting', t)
  const work = c.addRegister('work', n)
  let scratch: number[] = []
  let b: number[] = []
  let anc = -1
  if (arithmetic === 'gates') {
    b = c.addRegister('accumulator', n + 1)
    ;[anc] = c.addRegister('ancilla', 1)
    scratch = [...b, anc]
  }

  const steps: Block[] = []
  steps.push(c.block('Prepare', () => {
    for (const q of counting) c.h(q)
    c.x(work[0])
  }))

  for (let k = 0; k < t; k++) {
    const m = modPow(a, 2 ** k, N)
    const control = counting[k]
    if (arithmetic === 'gates') {
      cModMul(c, control, work, { b, anc }, m, N)
      steps.push(c.root.children[c.root.children.length - 1] as Block)
    } else {
      steps.push(c.block(`×${m} mod ${N}`, () => {
        c.permute(`×${m} mod ${N}`, work, mulModTable(m, N, n), [control])
      }, { controls: [control], meta: { a: m, N } }))
    }
  }

  inverseQft(c, counting)
  steps.push(c.root.children[c.root.children.length - 1] as Block)

  return { circuit: c, N, a, n, counting, work, scratch, steps }
}

/** x → m·x mod N on n bits; values ≥ N (never reached) map to themselves. */
export function mulModTable(m: number, N: number, n: number): Uint32Array {
  const table = new Uint32Array(2 ** n)
  for (let x = 0; x < table.length; x++) table[x] = x < N ? (m * x) % N : x
  return table
}

/** The order of a mod N, the hard way: the answer the circuit should find. */
export function multiplicativeOrder(a: number, N: number): number {
  let r = 1
  let v = a % N
  while (v !== 1) {
    v = (v * a) % N
    r++
    if (r > N) throw new Error(`${a} has no order mod ${N}`)
  }
  return r
}

export interface Convergent {
  readonly s: number
  readonly r: number
}

/** Convergents s/r of the continued fraction of y/2^t, with r < N. */
export function convergents(y: number, t: number, N: number): Convergent[] {
  const out: Convergent[] = []
  let num = y, den = 2 ** t
  let [h0, h1] = [0, 1]
  let [k0, k1] = [1, 0]
  while (den !== 0) {
    const q = Math.floor(num / den)
    ;[h0, h1] = [h1, q * h1 + h0]
    ;[k0, k1] = [k1, q * k1 + k0]
    if (k1 >= N) break
    out.push({ s: h1, r: k1 })
    ;[num, den] = [den, num - q * den]
  }
  return out
}

export interface ShorReading {
  readonly y: number
  /** y / 2^t, the measured estimate of s/r. */
  readonly phase: number
  readonly convergents: readonly Convergent[]
  /** The smallest convergent denominator that is a true period, if any. */
  readonly r: number | null
  /** Non-trivial factors from gcd(a^{r/2} ± 1, N), if this r yields them. */
  readonly factors: readonly [number, number] | null
  /** Why no factors came out, in words. */
  readonly note: string
}

/** Everything a classical computer does with one measurement y. */
export function interpretMeasurement(y: number, t: number, N: number, a: number): ShorReading {
  const cs = convergents(y, t, N)
  const phase = y / 2 ** t
  let r: number | null = null
  for (const { r: cand } of cs) {
    if (cand > 0 && modPow(a, cand, N) === 1) {
      r = cand
      break
    }
  }
  if (y === 0) return { y, phase, convergents: cs, r: null, factors: null, note: 'y = 0 carries no information about r. Measure again.' }
  if (r === null) {
    return { y, phase, convergents: cs, r, factors: null, note: 'No convergent denominator is a period. Measure again (or try multiples of a candidate).' }
  }
  if (r % 2 === 1) return { y, phase, convergents: cs, r, factors: null, note: `r = ${r} is odd, so a^{r/2} is not an integer power. Pick another a.` }
  const half = modPow(a, r / 2, N)
  if (half === N - 1) {
    return { y, phase, convergents: cs, r, factors: null, note: `a^{r/2} ≡ −1 (mod ${N}), so the gcds are trivial. Pick another a.` }
  }
  const p = gcd(half - 1, N), q = gcd(half + 1, N)
  const f = p > 1 && p < N ? p : q
  const [lo, hi] = [Math.min(f, N / f), Math.max(f, N / f)]
  return { y, phase, convergents: cs, r, factors: [lo, hi], note: `${N} = ${lo} × ${hi}` }
}
