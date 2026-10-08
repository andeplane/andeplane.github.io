// The circuit model: a tree of named blocks whose leaves are primitive ops.
//
// Simulators only ever see the flattened leaves. The tree exists for people:
// a drawing can show "controlled-U" as one box and let you open it up into
// the multiplier, the modular adders inside that, and finally the individual
// phase gates, all from the same object the simulator runs.

import { dagger, phase, H, X, Y, Z, SGate, SDG, T, TDG, type Mat2 } from './gates.ts'

/** A 2×2 unitary on `target`, applied only where every control qubit is 1. */
export interface GateOp {
  readonly kind: 'gate'
  readonly name: string
  readonly target: number
  readonly controls: readonly number[]
  readonly matrix: Mat2
  /** Angles etc., kept for display only; `matrix` is the source of truth. */
  readonly params?: readonly number[]
}

/** Exchange qubits a and b, applied only where every control qubit is 1. */
export interface SwapOp {
  readonly kind: 'swap'
  readonly a: number
  readonly b: number
  readonly controls: readonly number[]
}

/**
 * A reversible classical function on a register: basis state |x⟩ on `qubits`
 * (qubits[0] is the least significant bit) goes to |table[x]⟩. `table` must be
 * a permutation of 0…2^k−1. This is how oracles are written when the point
 * of a demo is not the gates inside them.
 */
export interface PermuteOp {
  readonly kind: 'permute'
  readonly name: string
  readonly qubits: readonly number[]
  readonly controls: readonly number[]
  readonly table: Uint32Array
}

/** Measure `target` in the computational basis, collapse, store in `cbit`. */
export interface MeasureOp {
  readonly kind: 'measure'
  readonly target: number
  readonly cbit: number
}

/** Return `target` to |0⟩ (measure, then flip if it read 1). */
export interface ResetOp {
  readonly kind: 'reset'
  readonly target: number
}

export type Op = GateOp | SwapOp | PermuteOp | MeasureOp | ResetOp
export type UnitaryOp = GateOp | SwapOp | PermuteOp

export interface Block {
  readonly kind: 'block'
  readonly name: string
  readonly children: Node[]
  /** Qubits to draw as control dots on the collapsed box. */
  readonly controls?: readonly number[]
  /** Free-form annotations (e.g. the classical constant a block adds). */
  readonly meta?: Readonly<Record<string, number | string>>
}

export type Node = Op | Block

export interface Register {
  readonly name: string
  readonly qubits: readonly number[]
}

export function isUnitary(op: Op): op is UnitaryOp {
  return op.kind === 'gate' || op.kind === 'swap' || op.kind === 'permute'
}

export class Circuit {
  readonly root: Block
  readonly registers: Register[] = []
  private readonly stack: Block[]
  private nextQubit = 0
  nClbits = 0

  constructor(name = 'circuit') {
    this.root = { kind: 'block', name, children: [] }
    this.stack = [this.root]
  }

  get nQubits(): number {
    return this.nextQubit
  }

  /** Allocate `size` fresh qubits under a name, least significant first. */
  addRegister(name: string, size: number): number[] {
    const qubits = Array.from({ length: size }, (_, i) => this.nextQubit + i)
    this.nextQubit += size
    this.registers.push({ name, qubits })
    return qubits
  }

  addClbits(size: number): number[] {
    const bits = Array.from({ length: size }, (_, i) => this.nClbits + i)
    this.nClbits += size
    return bits
  }

  push(node: Node): this {
    this.stack[this.stack.length - 1].children.push(node)
    return this
  }

  /** Everything `build` adds goes inside a new named block. */
  block(
    name: string,
    build: () => void,
    opts: { controls?: readonly number[]; meta?: Record<string, number | string> } = {},
  ): Block {
    const b: Block = { kind: 'block', name, children: [], ...opts }
    this.push(b)
    this.stack.push(b)
    try {
      build()
    } finally {
      this.stack.pop()
    }
    return b
  }

  /** Build a block, then append its inverse instead of it. */
  inverse(
    name: string,
    build: () => void,
    opts: { controls?: readonly number[]; meta?: Record<string, number | string> } = {},
  ): Block {
    const scratch: Block = { kind: 'block', name, children: [], ...opts }
    this.stack.push(scratch)
    try {
      build()
    } finally {
      this.stack.pop()
    }
    const inv = invert(scratch, name) as Block
    this.push(inv)
    return inv
  }

  gate(name: string, matrix: Mat2, target: number, controls: readonly number[] = [], params?: number[]): this {
    checkDistinct([target, ...controls])
    return this.push({ kind: 'gate', name, target, controls: [...controls], matrix, params })
  }

  h(q: number) { return this.gate('H', H, q) }
  x(q: number) { return this.gate('X', X, q) }
  y(q: number) { return this.gate('Y', Y, q) }
  z(q: number) { return this.gate('Z', Z, q) }
  s(q: number) { return this.gate('S', SGate, q) }
  sdg(q: number) { return this.gate('S†', SDG, q) }
  t(q: number) { return this.gate('T', T, q) }
  tdg(q: number) { return this.gate('T†', TDG, q) }
  p(theta: number, q: number, controls: readonly number[] = []) {
    return this.gate('P', phase(theta), q, controls, [theta])
  }
  cx(control: number, target: number) { return this.gate('X', X, target, [control]) }
  ccx(c1: number, c2: number, target: number) { return this.gate('X', X, target, [c1, c2]) }
  mcx(controls: readonly number[], target: number) { return this.gate('X', X, target, controls) }
  cz(control: number, target: number) { return this.gate('Z', Z, target, [control]) }
  cp(theta: number, control: number, target: number) { return this.p(theta, target, [control]) }

  swap(a: number, b: number, controls: readonly number[] = []): this {
    checkDistinct([a, b, ...controls])
    return this.push({ kind: 'swap', a, b, controls: [...controls] })
  }

  permute(name: string, qubits: readonly number[], table: Uint32Array, controls: readonly number[] = []): this {
    checkDistinct([...qubits, ...controls])
    if (table.length !== 1 << qubits.length) {
      throw new Error(`permute ${name}: table has ${table.length} entries for ${qubits.length} qubits`)
    }
    checkPermutation(table, name)
    return this.push({ kind: 'permute', name, qubits: [...qubits], controls: [...controls], table })
  }

  measure(target: number, cbit: number): this {
    return this.push({ kind: 'measure', target, cbit })
  }

  reset(target: number): this {
    return this.push({ kind: 'reset', target })
  }
}

function checkDistinct(qubits: readonly number[]): void {
  if (new Set(qubits).size !== qubits.length) {
    throw new Error(`a gate cannot use the same qubit twice: [${qubits.join(', ')}]`)
  }
}

function checkPermutation(table: Uint32Array, name: string): void {
  const seen = new Uint8Array(table.length)
  for (const v of table) {
    if (v >= table.length || seen[v]) throw new Error(`permute ${name}: table is not a permutation`)
    seen[v] = 1
  }
}

/** The inverse of a node: reversed order, each op inverted. */
export function invert(node: Node, name?: string): Node {
  switch (node.kind) {
    case 'block':
      return {
        ...node,
        name: name ?? `${node.name}†`,
        children: node.children.map((c) => invert(c)).reverse(),
      }
    case 'gate':
      return {
        ...node,
        name: inverseName(node.name),
        matrix: dagger(node.matrix),
        params: node.params?.map((p) => -p),
      }
    case 'swap':
      return node
    case 'permute': {
      const inv = new Uint32Array(node.table.length)
      node.table.forEach((v, i) => (inv[v] = i))
      return { ...node, name: inverseName(node.name), table: inv }
    }
    case 'measure':
    case 'reset':
      throw new Error(`${node.kind} is not reversible`)
  }
}

const SELF_INVERSE = new Set(['H', 'X', 'Y', 'Z'])

function inverseName(name: string): string {
  if (SELF_INVERSE.has(name) || name === 'P') return name
  return name.endsWith('†') ? name.slice(0, -1) : `${name}†`
}

/** Depth-first leaves of a node, in execution order. */
export function flatten(node: Node, out: Op[] = []): Op[] {
  if (node.kind === 'block') for (const c of node.children) flatten(c, out)
  else out.push(node)
  return out
}

const countCache = new WeakMap<Block, number>()

/** Number of primitive ops under a node. */
export function opCount(node: Node): number {
  if (node.kind !== 'block') return 1
  let n = countCache.get(node)
  if (n === undefined) {
    n = 0
    for (const c of node.children) n += opCount(c)
    countCache.set(node, n)
  }
  return n
}

const spanCache = new WeakMap<Block, readonly number[]>()

/** Every qubit a node touches, sorted. */
export function qubitsOf(node: Node): readonly number[] {
  switch (node.kind) {
    case 'gate':
      return [node.target, ...node.controls].sort((a, b) => a - b)
    case 'swap':
      return [node.a, node.b, ...node.controls].sort((a, b) => a - b)
    case 'permute':
      return [...node.qubits, ...node.controls].sort((a, b) => a - b)
    case 'measure':
    case 'reset':
      return [node.target]
    case 'block': {
      let s = spanCache.get(node)
      if (!s) {
        const set = new Set<number>()
        for (const c of node.children) for (const q of qubitsOf(c)) set.add(q)
        s = [...set].sort((a, b) => a - b)
        spanCache.set(node, s)
      }
      return s
    }
  }
}
