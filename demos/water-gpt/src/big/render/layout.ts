import { TILE } from '../crossbar.ts'
import type { GridSpec } from '../model.ts'

/**
 * Where every crossbar sits in the "machine hall". One world unit = one valve pair.
 * Each transformer layer is a bay with its crossbars in data-flow order (QKV → attention
 * out → MLP up → MLP down), bays are tiled in a grid, and the 50 257-column vocabulary
 * crossbar is folded into long banks along the bottom.
 */

export const ATLAS_DOWNSAMPLE = 8

export interface LayoutRect {
  grid: number
  /** World position of the rect's top-left valve. */
  x0: number
  y0: number
  /** Size in valves (cols across, rows down). */
  w: number
  h: number
  /** First grid column shown in this rect (LM-head banks). */
  colStart: number
  label: string
  layer: number
  bank: number
  /** weights, or the activation-programmed key / value valve banks (the KV cache). */
  kind: 'weights' | 'keys' | 'values'
  /** Free space below the rect (room for its outflow streams), in valves. */
  below: number
}

export interface Layout {
  rects: LayoutRect[]
  width: number
  height: number
  /** Bay frames per layer, for labels. */
  bays: { layer: number; x0: number; y0: number; w: number; h: number }[]
  vocabBay: { x0: number; y0: number; w: number; h: number }
}

const GAP = 256
const BAY_GAP = 1024

export function buildLayout(specs: GridSpec[], nLayer: number, d: number, ctx: number): Layout {
  const rects: LayoutRect[] = []
  const bays: Layout['bays'] = []
  const layerSpecs = (l: number) => specs.map((s, i) => ({ s, i })).filter((e) => e.s.layer === l)
  const first = layerSpecs(0)
  const bayW = first.reduce((a, e) => a + e.s.cols, 0) + GAP * (first.length - 1)
  const bayH = Math.max(...first.map((e) => e.s.rows))
  const bayCols = nLayer >= 9 ? 3 : nLayer >= 2 ? 2 : 1
  const bayRows = Math.ceil(nLayer / bayCols)
  for (let l = 0; l < nLayer; l++) {
    const bx = (l % bayCols) * (bayW + BAY_GAP)
    const by = Math.floor(l / bayCols) * (bayH + BAY_GAP)
    bays.push({ layer: l, x0: bx, y0: by, w: bayW, h: bayH })
    let x = bx
    for (const { s, i } of layerSpecs(l)) {
      rects.push({ grid: i, x0: x, y0: by, w: s.cols, h: s.rows, colStart: 0, label: s.label, layer: l, bank: 0, kind: 'weights', below: 0 })
      x += s.cols + GAP
    }
    // the KV cache: valves programmed by each token, under the QKV crossbar that feeds them
    const qkv = layerSpecs(l)[0].i
    const ky = by + d + GAP
    rects.push({ grid: qkv, x0: bx, y0: ky, w: ctx, h: d, colStart: 0, label: 'key valves · one column per token', layer: l, bank: 0, kind: 'keys', below: 0 })
    rects.push({ grid: qkv, x0: bx + ctx + GAP, y0: ky, w: d, h: ctx, colStart: 0, label: 'value valves · one row per token', layer: l, bank: 0, kind: 'values', below: 0 })
  }
  const width = bayCols * bayW + (bayCols - 1) * BAY_GAP
  let y = bayRows * bayH + (bayRows - 1) * BAY_GAP + BAY_GAP
  const lmIndex = specs.findIndex((s) => s.layer === -1)
  const lm = specs[lmIndex]
  const tiles = Math.ceil(lm.cols / TILE)
  const banks = Math.ceil((tiles * TILE) / width)
  const bankCols = Math.ceil(tiles / banks) * TILE
  const vy0 = y
  for (let b = 0; b < banks; b++) {
    const colStart = b * bankCols
    const w = Math.min(bankCols, lm.cols - colStart)
    rects.push({ grid: lmIndex, x0: 0, y0: y, w, h: lm.rows, colStart, label: lm.label, layer: -1, bank: b, kind: 'weights', below: 0 })
    y += lm.rows + GAP
  }
  const height = y - GAP
  // room under each crossbar for its falling outflow streams
  for (const r of rects) {
    let free = height + BAY_GAP - (r.y0 + r.h)
    for (const o of rects) {
      if (o === r || o.y0 < r.y0 + r.h) continue
      if (o.x0 < r.x0 + r.w && o.x0 + o.w > r.x0) free = Math.min(free, o.y0 - (r.y0 + r.h))
    }
    r.below = Math.max(0, free - 48)
  }
  return { rects, width, height, bays, vocabBay: { x0: 0, y0: vy0, w: width, h: height - vy0 } }
}

/** World rect of a single valve (grid, row, col), or null if not laid out. */
export function valveWorld(layout: Layout, grid: number, row: number, col: number): { x: number; y: number } | null {
  for (const r of layout.rects) {
    if (r.grid !== grid || r.kind !== 'weights') continue
    if (col < r.colStart || col >= r.colStart + r.w || row >= r.h) continue
    return { x: r.x0 + (col - r.colStart), y: r.y0 + row }
  }
  return null
}

/** Inverse: which valve is at world (x, y)? */
export function pickValve(layout: Layout, x: number, y: number): { rect: LayoutRect; row: number; col: number } | null {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  for (const r of layout.rects) {
    if (xi >= r.x0 && xi < r.x0 + r.w && yi >= r.y0 && yi < r.y0 + r.h) {
      return { rect: r, row: yi - r.y0, col: r.colStart + (xi - r.x0) }
    }
  }
  return null
}
