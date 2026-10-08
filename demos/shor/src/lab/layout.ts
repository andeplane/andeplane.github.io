// Turns one level of the circuit tree into positioned glyphs for the SVG.
//
// Each child of the block being viewed becomes one glyph: a primitive gate is
// drawn as itself, a sub-block as a box you can open. Glyphs are packed into
// columns greedily: a glyph goes in the first column after the last one that
// uses any wire between its top and bottom, so vertical lines never cross
// another gate.

import { qubitsOf, type Block, type Node, type Op, type Register } from '@andeplane/quantum'
import { formatAngle } from './numbers.ts'

export interface Row {
  readonly qubit: number
  readonly label: string
  readonly register: string
}

export type Glyph =
  | { readonly type: 'gate'; readonly label: string; readonly sub?: string; readonly target: number; readonly controls: number[]; readonly cnot: boolean }
  | { readonly type: 'swap'; readonly a: number; readonly b: number; readonly controls: number[] }
  | { readonly type: 'box'; readonly label: string; readonly lo: number; readonly hi: number; readonly controls: number[]; readonly block?: Block }
  | { readonly type: 'measure'; readonly row: number }

export interface Placed {
  readonly glyph: Glyph
  readonly node: Node
  /** Index of the child of the viewed block this glyph came from. */
  readonly child: number
  readonly col: number
  /** Centre x of the glyph. */
  readonly x: number
  readonly w: number
  /** Rows the glyph spans, top to bottom. */
  readonly lo: number
  readonly hi: number
}

export interface Layout {
  readonly rows: readonly Row[]
  readonly items: readonly Placed[]
  readonly width: number
}

const SHORT: Record<string, string> = { counting: 'c', work: 'w', accumulator: 'b', ancilla: 'anc' }

export function rowsFor(registers: readonly Register[], only?: readonly number[]): Row[] {
  const keep = only ? new Set(only) : null
  const rows: Row[] = []
  for (const r of registers) {
    r.qubits.forEach((q, k) => {
      if (keep && !keep.has(q)) return
      const short = SHORT[r.name] ?? r.name
      rows.push({ qubit: q, label: r.qubits.length === 1 ? short : `${short}${k}`, register: r.name })
    })
  }
  return rows
}

export const LEFT = 52
const GAP = 10

export function layout(view: Block, rows: readonly Row[], inline: (b: Block) => boolean = () => false): Layout {
  const rowOf = new Map(rows.map((r, i) => [r.qubit, i]))
  const row = (q: number) => {
    const r = rowOf.get(q)
    if (r === undefined) throw new Error(`qubit ${q} is not drawn in this view`)
    return r
  }

  // Expand inline blocks into their children, remembering which child of
  // the view each glyph belongs to.
  const entries: { node: Node; child: number }[] = []
  view.children.forEach((c, child) => {
    if (c.kind === 'block' && inline(c)) for (const g of c.children) entries.push({ node: g, child })
    else entries.push({ node: c, child })
  })

  const lastCol = new Array<number>(rows.length).fill(-1)
  const colWidth: number[] = []
  const pending: Omit<Placed, 'x'>[] = []
  for (const { node, child } of entries) {
    const glyph = glyphFor(node, row)
    const span = rowsOf(glyph)
    const lo = Math.min(...span), hi = Math.max(...span)
    let col = 0
    for (let r = lo; r <= hi; r++) col = Math.max(col, lastCol[r] + 1)
    for (let r = lo; r <= hi; r++) lastCol[r] = col
    const w = widthOf(glyph)
    colWidth[col] = Math.max(colWidth[col] ?? 0, w)
    pending.push({ glyph, node, child, col, w, lo, hi })
  }

  const colX: number[] = []
  let x = LEFT + GAP
  for (let c = 0; c < colWidth.length; c++) {
    colX[c] = x + colWidth[c] / 2
    x += colWidth[c] + GAP
  }
  return { rows, items: pending.map((p) => ({ ...p, x: colX[p.col] })), width: x + GAP }
}

function glyphFor(node: Node, row: (q: number) => number): Glyph {
  if (node.kind === 'block') {
    const controls = node.controls ?? []
    const body = qubitsOf(node).filter((q) => !controls.includes(q)).map(row)
    return { type: 'box', label: node.name, lo: Math.min(...body), hi: Math.max(...body), controls: controls.map(row), block: node }
  }
  return opGlyph(node, row)
}

function opGlyph(op: Op, row: (q: number) => number): Glyph {
  switch (op.kind) {
    case 'gate': {
      const sub = op.name === 'P' && op.params ? formatAngle(op.params[0]) : undefined
      return { type: 'gate', label: op.name, sub, target: row(op.target), controls: op.controls.map(row), cnot: op.name === 'X' && op.controls.length > 0 }
    }
    case 'swap':
      return { type: 'swap', a: row(op.a), b: row(op.b), controls: op.controls.map(row) }
    case 'permute': {
      const body = op.qubits.map(row)
      return { type: 'box', label: op.name, lo: Math.min(...body), hi: Math.max(...body), controls: op.controls.map(row) }
    }
    case 'measure':
    case 'reset':
      return { type: 'measure', row: row(op.target) }
  }
}

function rowsOf(g: Glyph): number[] {
  switch (g.type) {
    case 'gate': return [g.target, ...g.controls]
    case 'swap': return [g.a, g.b, ...g.controls]
    case 'box': return [g.lo, g.hi, ...g.controls]
    case 'measure': return [g.row]
  }
}

function widthOf(g: Glyph): number {
  switch (g.type) {
    case 'gate': return g.sub ? Math.max(30, g.sub.length * 6.5 + 12) : 26
    case 'swap': return 18
    case 'box': return Math.max(48, g.label.length * 7.2 + 22)
    case 'measure': return 26
  }
}
