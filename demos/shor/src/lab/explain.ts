// One or two sentences for whatever the reader has opened or is hovering.

import type { Block } from '@andeplane/quantum'

export function explainBlock(b: Block, N: number): string {
  const name = b.name
  const a = b.meta?.a
  if (name === 'Prepare') {
    return 'Hadamards put the counting register into an equal superposition of every value j at once, and X sets the work register to 1, the starting point for computing a^j mod N.'
  }
  if (name === 'QFT†') {
    return 'The inverse quantum Fourier transform. The counting register now holds a periodic pattern with period r; this turns it into sharp peaks at multiples of 2^t / r.'
  }
  if (name === 'QFT') {
    return 'Quantum Fourier transform. It moves the accumulator into the Fourier basis, where adding a known constant needs only one phase rotation per qubit.'
  }
  if (name.startsWith('×') && b.children.some((c) => c.kind === 'permute')) {
    return `Multiply the work register by ${a} mod ${N} where this counting qubit is 1, as a single black-box permutation of the register's basis states. Switch arithmetic to "gates" to build it from phase rotations instead.`
  }
  if (name.startsWith('×1 ')) {
    return `Multiply by 1: a^(2^k) mod ${N} has already wrapped around to 1, so this step changes nothing. The circuit still runs all of its gates, because nobody building it is supposed to know r in advance.`
  }
  if (name.startsWith('×') && b.controls?.length) {
    return `Multiply the work register by ${a} mod ${N}, but only in the branches where this counting qubit is 1. Counting qubit k controls multiplication by a^(2^k), so together they compute a^j mod N for every j at once. Open it to see the arithmetic.`
  }
  if (name.startsWith('CMULT') && name.includes('†')) {
    return `Undo a multiply-accumulate by the inverse ${a} (mod ${N}). After the swap the accumulator holds the old work value, and this clears it back to 0 so it can be reused.`
  }
  if (name.startsWith('CMULT')) {
    return `Add ${a}·x mod ${N} into the accumulator, one bit of x at a time: bit i of the work register controls adding ${a}·2^i mod ${N}.`
  }
  if (name === 'CSWAP') {
    return 'Swap the work register with the accumulator, controlled by the counting qubit. The product moves into the work register.'
  }
  if (name.startsWith('φADD(') && name.includes('mod')) {
    return `Add ${a} modulo ${N} in the Fourier basis (Beauregard). Add, subtract N, check the sign bit into the ancilla, add N back if it went negative, then uncompute the ancilla.`
  }
  if (name.startsWith('φADD')) {
    return `Draper's adder: in the Fourier basis, adding the constant ${a} is a phase rotation on each qubit. No carries and no extra qubits.`
  }
  if (name.startsWith('φSUB')) {
    return `Subtract the constant ${a}: the same phase rotations as φADD, run backwards.`
  }
  return name
}
