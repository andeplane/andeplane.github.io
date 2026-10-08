// The reference backend: the whole statevector in two Float64Arrays.
//
// It is the fallback for browsers without WebGPU and the ground truth the
// GPU kernels are tested against, so it favours being obviously correct over
// being fast. Every unitary is a loop over pairs (gates), index pairs (swaps)
// or a gather into a scratch buffer (permutations).

import type { UnitaryOp, GateOp, SwapOp, PermuteOp } from '../circuit.ts'
import { isDiagonal } from '../gates.ts'
import { complement, deposit, extract, maskOf } from '../bits.ts'
import type { Backend } from './backend.ts'

export class CpuBackend implements Backend {
  readonly name = 'CPU'
  re: Float64Array
  im: Float64Array
  private scratchRe?: Float64Array
  private scratchIm?: Float64Array

  constructor(readonly nQubits: number) {
    if (nQubits < 1 || nQubits > 30) throw new Error(`CPU backend supports 1–30 qubits, not ${nQubits}`)
    const dim = 2 ** nQubits
    this.re = new Float64Array(dim)
    this.im = new Float64Array(dim)
    this.re[0] = 1
  }

  reset(): void {
    this.re.fill(0)
    this.im.fill(0)
    this.re[0] = 1
  }

  apply(ops: readonly UnitaryOp[]): void {
    for (const op of ops) {
      if (op.kind === 'gate') this.gate(op)
      else if (op.kind === 'swap') this.swap(op)
      else this.permute(op)
    }
  }

  async flush(): Promise<void> {}

  private gate(op: GateOp): void {
    const { re, im } = this
    const t = op.target
    const bit = 1 << t
    const low = bit - 1
    const cmask = maskOf(op.controls)
    const [m00r, m00i, m01r, m01i, m10r, m10i, m11r, m11i] = op.matrix
    const half = re.length >>> 1
    const diag = isDiagonal(op.matrix)
    for (let k = 0; k < half; k++) {
      // Insert a 0 at bit t: i0 has the target bit clear, i1 has it set.
      const i0 = ((k & ~low) << 1) | (k & low)
      if ((i0 & cmask) !== cmask) continue
      const i1 = i0 | bit
      const ar = re[i0], ai = im[i0], br = re[i1], bi = im[i1]
      if (diag) {
        re[i0] = m00r * ar - m00i * ai
        im[i0] = m00r * ai + m00i * ar
        re[i1] = m11r * br - m11i * bi
        im[i1] = m11r * bi + m11i * br
      } else {
        re[i0] = m00r * ar - m00i * ai + m01r * br - m01i * bi
        im[i0] = m00r * ai + m00i * ar + m01r * bi + m01i * br
        re[i1] = m10r * ar - m10i * ai + m11r * br - m11i * bi
        im[i1] = m10r * ai + m10i * ar + m11r * bi + m11i * br
      }
    }
  }

  private swap(op: SwapOp): void {
    const { re, im } = this
    const ba = 1 << op.a, bb = 1 << op.b
    const cmask = maskOf(op.controls)
    for (let i = 0; i < re.length; i++) {
      // Visit each exchanged pair once, from the member with a=1, b=0.
      if (!(i & ba) || i & bb || (i & cmask) !== cmask) continue
      const j = (i ^ ba) | bb
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp
      tmp = im[i]; im[i] = im[j]; im[j] = tmp
    }
  }

  private permute(op: PermuteOp): void {
    const { re, im } = this
    const sRe = (this.scratchRe ??= new Float64Array(re.length))
    const sIm = (this.scratchIm ??= new Float64Array(re.length))
    const regMask = maskOf(op.qubits)
    const cmask = maskOf(op.controls)
    for (let i = 0; i < re.length; i++) {
      let j = i
      if ((i & cmask) === cmask) {
        j = ((i & ~regMask) | deposit(op.table[extract(i, op.qubits)], op.qubits)) >>> 0
      }
      sRe[j] = re[i]
      sIm[j] = im[i]
    }
    this.re = sRe
    this.im = sIm
    this.scratchRe = re
    this.scratchIm = im
  }

  async probabilities(qubits: readonly number[]): Promise<Float64Array> {
    const out = new Float64Array(2 ** qubits.length)
    const { re, im } = this
    for (let i = 0; i < re.length; i++) out[extract(i, qubits)] += re[i] * re[i] + im[i] * im[i]
    return out
  }

  async amplitudes(qubits: readonly number[], fixed = 0): Promise<{ re: Float64Array; im: Float64Array }> {
    const base = deposit(extract(fixed, complement(this.nQubits, qubits)), complement(this.nQubits, qubits))
    const size = 2 ** qubits.length
    const outRe = new Float64Array(size)
    const outIm = new Float64Array(size)
    for (let o = 0; o < size; o++) {
      const i = base | deposit(o, qubits)
      outRe[o] = this.re[i]
      outIm[o] = this.im[i]
    }
    return { re: outRe, im: outIm }
  }

  collapse(qubit: number, outcome: 0 | 1, prob: number): void {
    const scale = 1 / Math.sqrt(prob)
    const bit = 1 << qubit
    for (let i = 0; i < this.re.length; i++) {
      const keep = ((i & bit) !== 0) === (outcome === 1)
      this.re[i] = keep ? this.re[i] * scale : 0
      this.im[i] = keep ? this.im[i] * scale : 0
    }
  }

  dispose(): void {}
}
