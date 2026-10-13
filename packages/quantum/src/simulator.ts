// Runs circuits on a backend: batches unitary ops, and handles the two ops
// that need the host in the loop (measure and reset draw random numbers).

import { flatten, isUnitary, type Node, type Op, type UnitaryOp } from './circuit.ts'
import { X } from './gates.ts'
import type { Backend } from './backends/backend.ts'

export interface RunOptions {
  /** Called after each submitted batch with (ops done, ops total). */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /** Ops per submitted batch; smaller means smoother progress. */
  batch?: number
}

export class Simulator {
  readonly clbits: number[] = []

  constructor(
    readonly backend: Backend,
    private readonly rng: () => number = Math.random,
  ) {}

  get nQubits(): number {
    return this.backend.nQubits
  }

  reset(): void {
    this.backend.reset()
    this.clbits.length = 0
  }

  async run(node: Node | readonly Op[], opts: RunOptions = {}): Promise<void> {
    const ops = Array.isArray(node) ? (node as readonly Op[]) : flatten(node as Node)
    const batch = opts.batch ?? 4096
    let pending: UnitaryOp[] = []
    let done = 0
    const submit = async () => {
      if (pending.length === 0) return
      this.backend.apply(pending)
      done += pending.length
      pending = []
      await this.backend.flush()
      opts.onProgress?.(done, ops.length)
    }
    for (const op of ops) {
      if (opts.signal?.aborted) throw new DOMException('Run aborted', 'AbortError')
      if (isUnitary(op)) {
        pending.push(op)
        if (pending.length >= batch) await submit()
        continue
      }
      await submit()
      const outcome = await this.measure(op.target)
      if (op.kind === 'measure') this.clbits[op.cbit] = outcome
      else if (outcome === 1) this.backend.apply([{ kind: 'gate', name: 'X', target: op.target, controls: [], matrix: X }])
      done++
    }
    await submit()
  }

  /** Measure one qubit now: sample, collapse, return the outcome. */
  async measure(qubit: number): Promise<0 | 1> {
    const [p0, p1] = await this.backend.probabilities([qubit])
    const total = p0 + p1
    const outcome = this.rng() * total < p1 ? 1 : 0
    this.backend.collapse(qubit, outcome, (outcome ? p1 : p0) / total)
    return outcome
  }

  /** Draw `shots` outcomes on `qubits` without disturbing the state. */
  async sample(qubits: readonly number[], shots: number): Promise<number[]> {
    return sampleFrom(await this.backend.probabilities(qubits), shots, this.rng)
  }
}

/** Inverse-CDF sampling from an (unnormalized) distribution. */
export function sampleFrom(probs: ArrayLike<number>, shots: number, rng: () => number = Math.random): number[] {
  const cdf = new Float64Array(probs.length)
  let acc = 0
  for (let i = 0; i < probs.length; i++) cdf[i] = acc += probs[i]
  const out: number[] = []
  for (let s = 0; s < shots; s++) {
    const u = rng() * acc
    let lo = 0, hi = cdf.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (cdf[mid] > u) hi = mid
      else lo = mid + 1
    }
    out.push(lo)
  }
  return out
}
