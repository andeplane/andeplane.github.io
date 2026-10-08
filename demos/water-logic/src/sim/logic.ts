// The "wiring" of the adder: reads which channel each gate's water leaves by
// and turns that into valve settings for the next gate. Nothing here decides a
// bit — it only classifies measured flux, as a pressure-sensing receiver
// would, and refuses to answer while the reading is ambiguous.

import { BITS, type Board, type Role } from './board.ts'
import { PHYS } from './d2q9.ts'
import { type GateKind, NOZZLE_CELLS } from './geometry.ts'

/** Lattice steps a collision cell is purged (both jets on) before a new input. */
export const FLUSH_STEPS = 2000
/** Steps after the inputs are applied before the outputs are even looked at. */
export const MIN_SETTLE = 1800
/** Steps a clear reading must hold unchanged before it is latched. */
export const STABLE_STEPS = 600
/** Time constant of the flux smoothing, in steps. */
const SMOOTH = 150
/** Volume flux of one full jet; probe fluxes are normalised by it. */
export const Q_JET = NOZZLE_CELLS * PHYS.jetSpeed

export type Phase = 'flush' | 'settle' | 'valid'

export interface GateOut {
  /** impact: SUM; wall: OR */
  s: boolean
  /** impact: CARRY; wall: unused (false) */
  c: boolean
}

export interface GateRun {
  applied: [boolean, boolean]
  phase: Phase
  timer: number
  stableFor: number
  candidate: GateOut | null
  out: GateOut
  /** Smoothed normalised flux: left, centre, right (1 = one full jet). */
  flux: [number, number, number]
  /** Steps spent computing since the last input change. */
  busyFor: number
  /** Increments every time the latched output changes (for UI pulses). */
  version: number
}

/** Classify one impact (collision) element's output fluxes. */
export function classifyImpact(l: number, c: number, r: number): GateOut | null {
  const side = Math.max(l, r)
  const carry = c > 1.25 ? true : c < 0.95 ? false : null
  const sum = side > 0.6 ? true : side < 0.3 ? false : null
  if (carry === null || sum === null || (carry && sum)) return null
  return { s: sum, c: carry }
}

/** Classify one wall-attachment OR/NOR element's output fluxes. */
export function classifyWall(l: number, c: number, r: number): GateOut | null {
  const or = l + c
  if (or > 1.0 && r < 0.4) return { s: true, c: false }
  if (r > 0.6 && or < 0.5) return { s: false, c: false }
  return null
}

const sameOut = (a: GateOut, b: GateOut) => a.s === b.s && a.c === b.c

export function newGateRun(): GateRun {
  return {
    applied: [false, false],
    // every gate starts by confirming its idle state from the fluid itself
    phase: 'settle',
    timer: 0,
    stableFor: 0,
    candidate: null,
    out: { s: false, c: false },
    flux: [0, 0, 0],
    busyFor: 0,
    version: 0,
  }
}

/** Valve targets for one gate's nozzles (impact: L, R; wall: P, C1, C2). */
export function gateValves(run: GateRun, kind: GateKind): number[] {
  const on = (b: boolean) => (b ? 1 : 0)
  if (kind === 'wall') return [1, on(run.applied[0]), on(run.applied[1])]
  // A collision cell is purged before it computes: both jets fire together,
  // which sweeps away the eddy the previous answer left in the chamber.
  if (run.phase === 'flush') return [1, 1]
  return [on(run.applied[0]), on(run.applied[1])]
}

/**
 * One controller tick for one gate: `want` is the inputs it should see now,
 * `flux` the latest normalised probe fluxes (left, centre, right).
 */
export function gateUpdate(run: GateRun, kind: GateKind, want: readonly boolean[], steps: number, flux: ArrayLike<number>): void {
  const alpha = 1 - Math.exp(-steps / SMOOTH)
  for (let k = 0; k < 3; k++) run.flux[k] += alpha * (flux[k] - run.flux[k])
  if (want[0] !== run.applied[0] || want[1] !== run.applied[1]) {
    run.applied = [want[0], want[1]]
    const single = want[0] !== want[1]
    run.phase = kind === 'impact' && single ? 'flush' : 'settle'
    run.timer = 0
    run.stableFor = 0
    run.candidate = null
    run.busyFor = 0
    return
  }
  run.timer += steps
  if (run.phase !== 'valid') run.busyFor += steps
  if (run.phase === 'flush') {
    if (run.timer >= FLUSH_STEPS) {
      run.phase = 'settle'
      run.timer = 0
    }
    return
  }
  if (run.phase === 'settle' && run.timer < MIN_SETTLE) return
  const [l, c, r] = run.flux
  const cls = kind === 'wall' ? classifyWall(l, c, r) : classifyImpact(l, c, r)
  if (!cls) {
    run.stableFor = 0
    run.candidate = null
    return
  }
  if (run.candidate && sameOut(cls, run.candidate)) run.stableFor += steps
  else {
    run.candidate = cls
    run.stableFor = 0
  }
  if (run.stableFor >= STABLE_STEPS) {
    if (!sameOut(cls, run.out)) {
      run.version++
      run.out = cls
    }
    run.phase = 'valid'
  }
}

/** Move valve openings towards their targets at the valve rate. */
export function rampValves(valves: Float32Array, targets: readonly number[], steps: number): void {
  const dv = PHYS.valveRate * steps
  for (let k = 0; k < targets.length; k++) {
    const d = targets[k] - valves[k]
    valves[k] += Math.sign(d) * Math.min(Math.abs(d), dv)
  }
}

export class Adder {
  readonly board: Board
  a = 0
  b = 0
  carryIn = false
  readonly runs: GateRun[]
  /** Current valve openings (0..1), one per global nozzle. */
  readonly valves: Float32Array
  totalSteps = 0
  /** Steps since the user last changed an input. */
  sinceInput = 0
  private readonly index = new Map<string, number>()

  constructor(board: Board) {
    this.board = board
    this.runs = board.gates.map(() => newGateRun())
    this.valves = new Float32Array(board.nozzles.length)
    board.gates.forEach((g, gi) => this.index.set(`${g.role}${g.bit}`, gi))
  }

  setInputs(a: number, b: number, carryIn = false): void {
    a &= 15
    b &= 15
    if (a === this.a && b === this.b && carryIn === this.carryIn) return
    this.a = a
    this.b = b
    this.carryIn = carryIn
    this.sinceInput = 0
  }

  run(role: Role, bit: number): GateRun {
    return this.runs[this.index.get(`${role}${bit}`)!]
  }

  out(role: Role, bit: number): GateOut {
    return this.run(role, bit).out
  }

  /** The inputs a gate should currently see: user bits and latched upstream outputs. */
  desired(gi: number): [boolean, boolean] {
    const g = this.board.gates[gi]
    const i = g.bit
    if (g.role === 'ha1') return [((this.a >> i) & 1) === 1, ((this.b >> i) & 1) === 1]
    if (g.role === 'ha2') return [this.out('ha1', i).s, i === 0 ? this.carryIn : this.out('or', i - 1).s]
    return [this.out('ha1', i).c, this.out('ha2', i).c]
  }

  /** Valve targets for every global nozzle. */
  targets(): number[] {
    return this.board.gates.flatMap((g, gi) => gateValves(this.runs[gi], g.spec.kind))
  }

  /**
   * Advance the controller after the fluid has run `steps` lattice steps.
   * `probeFlux` holds Σρu_y for every probe line (board.probes order).
   */
  advance(steps: number, probeFlux: ArrayLike<number>): void {
    this.totalSteps += steps
    this.sinceInput += steps
    const f = [0, 0, 0]
    this.board.gates.forEach((g, gi) => {
      for (let k = 0; k < 3; k++) f[k] = probeFlux[g.probeBase + k] / Q_JET
      gateUpdate(this.runs[gi], g.spec.kind, this.desired(gi), steps, f)
    })
    rampValves(this.valves, this.targets(), steps)
  }

  /** True when every gate has latched a reading for its current inputs. */
  get settled(): boolean {
    return this.board.gates.every((_, gi) => {
      const want = this.desired(gi)
      const run = this.runs[gi]
      return run.phase === 'valid' && want[0] === run.applied[0] && want[1] === run.applied[1]
    })
  }

  /** The sum as read off the water: SUM bits from HA2, carry out of the top OR. */
  get result(): number {
    let v = 0
    for (let i = 0; i < BITS; i++) if (this.out('ha2', i).s) v |= 1 << i
    if (this.out('or', BITS - 1).s) v |= 1 << BITS
    return v
  }
}
