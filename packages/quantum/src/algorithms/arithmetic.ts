// Modular arithmetic out of phase gates, after Beauregard, "Circuit for Shor's
// algorithm using 2n+3 qubits" (2003), building on Draper's adder (2000).
//
// The trick: in the Fourier basis, adding a classical constant a is just a
// phase e^{2πi·a·y/2^m} on each basis state |y⟩, and that phase factorizes
// into one single-qubit phase gate per qubit. No carries, no ancillas. Every
// other block here is a careful arrangement of those adders.

import type { Circuit } from '../circuit.ts'
import { qft, inverseQft } from './qft.ts'

/**
 * φADD(a): b → b + a mod 2^m, with b already in the Fourier basis.
 * One phase gate per qubit, each sharing the given controls.
 */
export function phiAdd(c: Circuit, b: readonly number[], a: number, controls: readonly number[] = [], name = `φADD(${a})`): void {
  c.block(name, () => phiAddBody(c, b, a, controls), { controls, meta: { a } })
}

/** φADD(a)†: subtract a. */
export function phiSub(c: Circuit, b: readonly number[], a: number, controls: readonly number[] = [], name = `φSUB(${a})`): void {
  c.inverse(name, () => phiAddBody(c, b, a, controls), { controls, meta: { a } })
}

function phiAddBody(c: Circuit, b: readonly number[], a: number, controls: readonly number[]): void {
  const M = 2 ** b.length
  for (let j = 0; j < b.length; j++) {
    const k = (a * 2 ** j) % M
    if (k !== 0) c.p((2 * Math.PI * k) / M, b[j], controls)
  }
}

export interface ModRegisters {
  /** n+1 qubits: one more than N needs, so a+b never overflows. */
  readonly b: readonly number[]
  /** One ancilla, |0⟩ before and after. */
  readonly anc: number
}

/**
 * φADDMOD(a) mod N: b → (b + a) mod N in the Fourier basis, when every
 * control is 1. Needs 0 ≤ a, b < N. Beauregard figure 5.
 */
export function phiAddMod(c: Circuit, regs: ModRegisters, a: number, N: number, controls: readonly number[]): void {
  const { b, anc } = regs
  const msb = b[b.length - 1]
  c.block(`φADD(${a}) mod ${N}`, () => {
    phiAdd(c, b, a, controls)
    phiSub(c, b, N)
    // b + a − N went negative exactly when its top bit is set: remember that.
    inverseQft(c, b)
    c.cx(msb, anc)
    qft(c, b)
    phiAdd(c, b, N, [anc])
    // Uncompute the flag: subtracting a again goes negative exactly when we
    // did *not* add N back, so flip the ancilla on a clear top bit.
    phiSub(c, b, a, controls)
    inverseQft(c, b)
    c.x(msb)
    c.cx(msb, anc)
    c.x(msb)
    qft(c, b)
    phiAdd(c, b, a, controls)
  }, { controls, meta: { a, N } })
}

/**
 * CMULT(a) mod N: |x⟩|b⟩ → |x⟩|b + a·x mod N⟩ when `control` is 1.
 * Beauregard figure 6: one modular addition of a·2^i per bit of x.
 */
export function cMultMod(
  c: Circuit, control: number, x: readonly number[], regs: ModRegisters, a: number, N: number,
): void {
  c.block(`CMULT(${a}) mod ${N}`, () => cMultModBody(c, control, x, regs, a, N), { controls: [control], meta: { a, N } })
}

function cMultModBody(c: Circuit, control: number, x: readonly number[], regs: ModRegisters, a: number, N: number): void {
  qft(c, regs.b)
  for (let i = 0; i < x.length; i++) phiAddMod(c, regs, (a * 2 ** i) % N, N, [control, x[i]])
  inverseQft(c, regs.b)
}

/**
 * Controlled U_a: |x⟩ → |a·x mod N⟩ when `control` is 1, with b and the
 * ancilla returned to |0⟩. Beauregard figure 7: multiply into b, swap, then
 * un-multiply by a⁻¹ to clear the old x out of b.
 */
export function cModMul(
  c: Circuit, control: number, x: readonly number[], regs: ModRegisters, a: number, N: number,
): void {
  const aInv = modInverse(a, N)
  c.block(`×${a} mod ${N}`, () => {
    cMultMod(c, control, x, regs, a, N)
    c.block('CSWAP', () => {
      for (let i = 0; i < x.length; i++) c.swap(x[i], regs.b[i], [control])
    }, { controls: [control] })
    c.inverse(`CMULT(${aInv})† mod ${N}`, () => cMultModBody(c, control, x, regs, aInv, N), {
      controls: [control], meta: { a: aInv, N },
    })
  }, { controls: [control], meta: { a, N } })
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function modInverse(a: number, N: number): number {
  let [r0, r1] = [((a % N) + N) % N, N]
  let [s0, s1] = [1, 0]
  while (r1) {
    const q = Math.floor(r0 / r1)
    ;[r0, r1] = [r1, r0 - q * r1]
    ;[s0, s1] = [s1, s0 - q * s1]
  }
  if (r0 !== 1) throw new Error(`${a} has no inverse mod ${N}`)
  return ((s0 % N) + N) % N
}

/** a^e mod N, exact for N < 2^26 (products stay below 2^53). */
export function modPow(a: number, e: number, N: number): number {
  let result = 1 % N
  let base = a % N
  while (e > 0) {
    if (e & 1) result = (result * base) % N
    base = (base * base) % N
    e = Math.floor(e / 2)
  }
  return result
}
