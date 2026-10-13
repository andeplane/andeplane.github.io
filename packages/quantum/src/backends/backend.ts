import type { UnitaryOp } from '../circuit.ts'

/**
 * A statevector store that can apply primitive ops and answer questions about
 * the state. Ops are queued; only reads wait for the device.
 */
export interface Backend {
  /** Human-readable, e.g. "WebGPU (Apple M2)" or "CPU". */
  readonly name: string
  readonly nQubits: number
  /** Back to |00…0⟩. */
  reset(): void
  /** Queue unitary ops. */
  apply(ops: readonly UnitaryOp[]): void
  /** Resolves once everything queued so far has run. */
  flush(): Promise<void>
  /**
   * Marginal distribution over `qubits` (qubits[0] is the least significant
   * bit of the returned index), summed over every other qubit.
   */
  probabilities(qubits: readonly number[]): Promise<Float64Array>
  /**
   * The amplitudes on `qubits` with every other qubit pinned to the matching
   * bit of `fixed`. For a register that is entangled only with qubits known to
   * be |0⟩ (ancillas between blocks) this is the register's full state.
   */
  amplitudes(qubits: readonly number[], fixed?: number): Promise<{ re: Float64Array; im: Float64Array }>
  /** Project `qubit` onto `outcome` and renormalize; `prob` is P(outcome). */
  collapse(qubit: number, outcome: 0 | 1, prob: number): void
  dispose(): void
}

/** Largest qubit count a backend should be asked for, given memory per amplitude. */
export function maxQubitsFor(bytesAvailable: number, bytesPerAmplitude: number): number {
  return Math.floor(Math.log2(bytesAvailable / bytesPerAmplitude))
}
