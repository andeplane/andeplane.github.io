import { describe, expect, it } from 'vitest'
import { shorCircuit } from '@andeplane/quantum'
import { bases, formatAngle, rejectN, shorTargets } from './numbers.ts'
import { layout, rowsFor } from './layout.ts'

describe('numbers', () => {
  it('only offers N that Shor is needed for', () => {
    expect(shorTargets(40)).toEqual([15, 21, 33, 35, 39])
    expect(rejectN(25)).toMatch(/prime power/)
    expect(rejectN(22)).toMatch(/even/)
  })

  it('knows which bases factor 15', () => {
    const b = bases(15)
    expect(b.map((x) => x.a)).toEqual([2, 4, 7, 8, 11, 13, 14])
    expect(b.find((x) => x.a === 14)!.good).toBe(false) // r = 2, 14 ≡ −1
    expect(b.find((x) => x.a === 7)!.r).toBe(4)
  })

  it('formats angles as fractions of π', () => {
    expect(formatAngle(Math.PI / 4)).toBe('π/4')
    expect(formatAngle((-3 * Math.PI) / 8)).toBe('−3π/8')
    expect(formatAngle(Math.PI)).toBe('π')
  })
})

describe('circuit layout', () => {
  it('puts each controlled multiplication in its own column at the top level', () => {
    const s = shorCircuit({ N: 15, a: 7, countingQubits: 8 })
    const lay = layout(s.circuit.root, rowsFor(s.circuit.registers), (b) => b.name === 'Prepare')
    const boxes = lay.items.filter((p) => p.glyph.type === 'box')
    expect(boxes).toHaveLength(9) // 8 multiplications + QFT†
    expect(new Set(boxes.map((b) => b.col)).size).toBe(9)
    // Prepare is drawn inline: 8 H gates and one X share the first column.
    expect(lay.items.filter((p) => p.child === 0).every((p) => p.col === 0)).toBe(true)
  })

  it('never lets two glyphs in one column overlap', () => {
    const s = shorCircuit({ N: 21, a: 2, countingQubits: 4 })
    const mult = s.steps[1]
    const inner = mult.children[0]
    if (inner.kind !== 'block') throw new Error('expected a block')
    const lay = layout(inner, rowsFor(s.circuit.registers))
    const byCol = new Map<number, [number, number][]>()
    for (const p of lay.items) {
      const spans = byCol.get(p.col) ?? []
      for (const [lo, hi] of spans) expect(p.hi < lo || p.lo > hi).toBe(true)
      spans.push([p.lo, p.hi])
      byCol.set(p.col, spans)
    }
  })
})
