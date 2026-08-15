// Widget-facing driver. The UI never mutates a statevector directly; it
// asks for a replay of the whole run as a list of immutable snapshots,
// including the half-steps (after the oracle, before the diffusion) that
// the bar and disc animations reflect through. A full replay at N ≤ 2^14
// is well under 10 ms, so settings changes just rebuild the schedule.

import { zeroState, hadamardAll, norm } from './statevector'
import { oraclePhaseFlip, diffusionDirect } from './grover'

export type Phase = 'initial' | 'post-oracle' | 'post-diffusion'

export type OracleBehavior = 'correct' | 'wrong-item' | 'no-op'

export interface GroverSnapshot {
  /** Real parts of the amplitudes (Grover keeps im ≡ 0 throughout). */
  amps: Float64Array
  /** Probabilities |amp|², same length. */
  probs: Float64Array
  /** Mean amplitude at this snapshot — the diffusion mirror line. */
  mean: number
  /** Completed full iterations. */
  t: number
  phase: Phase
  /** Total probability, for the honesty readout. */
  norm: number
}

export interface RunOptions {
  /** Which item the oracle actually flips, when behavior demands mischief. */
  behavior?: OracleBehavior
}

function snapshot(re: Float64Array, t: number, phase: Phase): GroverSnapshot {
  const amps = re.slice()
  const probs = new Float64Array(amps.length)
  let mean = 0
  let normSq = 0
  for (let i = 0; i < amps.length; i++) {
    probs[i] = amps[i] * amps[i]
    mean += amps[i]
    normSq += probs[i]
  }
  mean /= amps.length
  return { amps, probs, mean, t, phase, norm: Math.sqrt(normSq) }
}

/**
 * Run `steps` full Grover iterations on n qubits with the given marked
 * set, recording a snapshot at the start and after each half-step.
 * Snapshot order: initial, then for t = 1..steps: post-oracle(t),
 * post-diffusion(t).
 */
export function runSchedule(
  n: number,
  marked: ReadonlySet<number>,
  steps: number,
  opts: RunOptions = {},
): GroverSnapshot[] {
  const behavior = opts.behavior ?? 'correct'
  const s = zeroState(n)
  hadamardAll(s)

  // What the oracle actually flips. 'wrong-item' flips a fixed unmarked
  // index instead; 'no-op' flips nothing.
  let flipped: ReadonlySet<number> = marked
  if (behavior === 'no-op') {
    flipped = new Set()
  } else if (behavior === 'wrong-item') {
    const dim = 1 << n
    for (let i = 0; i < dim; i++) {
      if (!marked.has(i)) {
        flipped = new Set([i])
        break
      }
    }
  }

  const out: GroverSnapshot[] = [snapshot(s.re, 0, 'initial')]
  for (let t = 1; t <= steps; t++) {
    oraclePhaseFlip(s, flipped)
    out.push(snapshot(s.re, t, 'post-oracle'))
    diffusionDirect(s)
    out.push(snapshot(s.re, t, 'post-diffusion'))
  }
  // Grover is real-valued; assert the invariant cheaply in dev builds.
  if (import.meta.env?.DEV && Math.abs(norm(s) - 1) > 1e-9) {
    console.warn('grover: norm drifted from 1', norm(s))
  }
  return out
}

/** Index into a runSchedule() result for a given (t, phase). */
export function snapshotIndex(t: number, phase: Phase): number {
  if (phase === 'initial') return 0
  return (t - 1) * 2 + (phase === 'post-oracle' ? 1 : 2)
}

/** Sum of marked-item probabilities in a snapshot. */
export function successProbability(snap: GroverSnapshot, marked: ReadonlySet<number>): number {
  let p = 0
  for (const m of marked) p += snap.probs[m]
  return p
}
