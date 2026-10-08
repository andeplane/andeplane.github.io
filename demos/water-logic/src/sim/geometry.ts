// Channel geometry for the fluidic gates, described as signed distance fields
// (negative = open water) and rasterised onto the lattice. The same SDF is
// uploaded to the GPU so walls render as smooth glass instead of stair steps.
//
// Coordinates: x right, y DOWN, one unit = one lattice cell. Jets flow down.

import { CELL } from './d2q9.ts'

type Vec = readonly [number, number]

// ---------- SDF primitives ----------

/** Axis-aligned rectangle [x0,x1]×[y0,y1]. */
export function sdRect(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const dx = Math.abs(px - cx) - (x1 - x0) / 2
  const dy = Math.abs(py - cy) - (y1 - y0) / 2
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0)
}

/** Flat-ended duct from a to b with half-width hw. */
export function sdDuct(px: number, py: number, a: Vec, b: Vec, hw: number): number {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const dx = (b[0] - a[0]) / L
  const dy = (b[1] - a[1]) / L
  const rx = px - a[0]
  const ry = py - a[1]
  const t = rx * dx + ry * dy
  const s = -rx * dy + ry * dx
  // box in local coordinates: t ∈ [0, L], s ∈ [-hw, hw]
  const qx = Math.abs(t - L / 2) - L / 2
  const qy = Math.abs(s) - hw
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/** Exact SDF of a simple polygon (Inigo Quilez). */
export function sdPolygon(px: number, py: number, v: readonly Vec[]): number {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2
  let s = 1
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0]
    const ey = v[j][1] - v[i][1]
    const wx = px - v[i][0]
    const wy = py - v[i][1]
    const h = Math.min(Math.max((wx * ex + wy * ey) / (ex * ex + ey * ey), 0), 1)
    const bx = wx - ex * h
    const by = wy - ey * h
    d = Math.min(d, bx * bx + by * by)
    const c1 = py >= v[i][1]
    const c2 = py < v[j][1]
    const c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
  }
  return s * Math.sqrt(d)
}
// ---------- Gate descriptions ----------

export type Shape = (x: number, y: number) => number

export interface NozzleSpec {
  /** Local name inside the gate ('L', 'R', 'P', 'C1', 'C2'). */
  name: string
  /** Duct start (closed end) and exit. */
  a: Vec
  b: Vec
  hw: number
  /** Dye channel (0..3) this nozzle's water is tagged with. */
  dye: number
}

export interface DrainSpec {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Outward normal: the drain copies the velocity of the cell at −normal. */
  nx: number
  ny: number
}

export interface ProbeSpec {
  name: 'left' | 'centre' | 'right'
  /** Horizontal line of cells x0..x1 (inclusive) on row y; flux = Σ ρ·u_y. */
  x0: number
  x1: number
  y: number
}

export type GateKind = 'impact' | 'wall'

export interface GateSpec {
  kind: GateKind
  w: number
  h: number
  open: Shape[]
  nozzles: NozzleSpec[]
  drains: DrainSpec[]
  probes: ProbeSpec[]
  /** Output channel centre lines (x) at the tile bottom, for drawing pipes. */
  outX: { left: number; centre: number; right: number }
}

export const TILE_W = 96
export const TILE_H = 120

/** Nozzle half-width (a 9-cell-wide jet) and the jet's volume flux. */
export const NOZZLE_HW = 4.5
export const NOZZLE_CELLS = 9

/**
 * The impact element, a passive jet-collision half adder, drawn as a diamond
 * chamber standing on its corner. Each nozzle sits flush against one roof and
 * fires along the OTHER roof, so a lone jet clings to that wall (Coandă) and
 * rides it round into the far side channel. Two jets meet head-on under the
 * apex, their sideways momenta cancel, and the merged jet drops straight down
 * the centre channel.
 *   SUM   = water in a side channel   (A XOR B)
 *   CARRY = water in the centre       (A AND B)
 *
 * With `power` set it becomes the wall-attachment OR/NOR element: the left
 * nozzle is an always-on power jet clinging to the right-hand roof (NOR
 * output), and two control nozzles fire at it from the other roof. Either
 * control knocks it off the wall and into the centre/left (OR output).
 */
function diamondGate(power: boolean): GateSpec {
  const w = TILE_W
  const h = TILE_H
  const cx = w / 2
  const r2 = Math.SQRT1_2
  const S = 52 // chamber side
  const apexY = 20
  const hw = NOZZLE_HW
  const L = 22 // nozzle duct length
  const hwo = 10 // output channel half-width
  // "roof frame": u runs down the right roof, v down the left roof
  const toW = (u: number, v: number): Vec => [cx + (u - v) * r2, apexY + (u + v) * r2]
  const nA = [toW(hw, -L), toW(hw, 2)] as const // fires down the LEFT roof
  const nB = [toW(-L, hw), toW(2, hw)] as const // fires down the RIGHT roof
  const hwc2 = 3.5
  const u2 = 2 * hw + 1 + hwc2
  const nC2 = [toW(u2, -L), toW(u2, 2)] as const
  const diamond: Vec[] = [toW(0, 0), toW(S, 0), toW(S, S), toW(0, S)]
  const [lx, ly] = toW(0, S)
  const [rx, ry] = toW(S, 0)
  const [, by] = toW(S, S)
  const lc = lx + hwo + 2
  const rc = rx - hwo - 2
  const open: Shape[] = [
    (x, y) => sdDuct(x, y, nA[0], nA[1], hw),
    (x, y) => sdDuct(x, y, nB[0], nB[1], hw),
    (x, y) => sdPolygon(x, y, diamond),
    (x, y) => sdRect(x, y, lc - hwo, ly - 4, lc + hwo, h - 2),
    (x, y) => sdRect(x, y, rc - hwo, ry - 4, rc + hwo, h - 2),
    (x, y) => sdRect(x, y, cx - hwo, by - 12, cx + hwo, h - 2),
  ]
  if (power) open.push((x, y) => sdDuct(x, y, nC2[0], nC2[1], hwc2))
  const probeY = h - 10
  return {
    kind: power ? 'wall' : 'impact',
    w,
    h,
    open,
    nozzles: power
      ? [
          { name: 'P', a: nB[0], b: nB[1], hw, dye: 2 },
          { name: 'C1', a: nA[0], b: nA[1], hw, dye: 3 },
          { name: 'C2', a: nC2[0], b: nC2[1], hw: hwc2, dye: 3 },
        ]
      : [
          { name: 'L', a: nB[0], b: nB[1], hw, dye: 0 },
          { name: 'R', a: nA[0], b: nA[1], hw, dye: 1 },
        ],
    drains: [{ x0: 0, y0: h - 4, x1: w, y1: h - 2, nx: 0, ny: 1 }],
    probes: [
      { name: 'left', x0: Math.floor(lc - hwo), x1: Math.ceil(lc + hwo), y: probeY },
      { name: 'centre', x0: cx - hwo, x1: cx + hwo, y: probeY },
      { name: 'right', x0: Math.floor(rc - hwo), x1: Math.ceil(rc + hwo), y: probeY },
    ],
    outX: { left: lc, centre: cx, right: rc },
  }
}

export const impactGate = (): GateSpec => diamondGate(false)
export const wallGate = (): GateSpec => diamondGate(true)

// ---------- Rasterisation ----------

export interface Raster {
  w: number
  h: number
  /** CELL.* per cell. */
  type: Uint8Array
  /** Global nozzle index per NOZZLE cell, else 255. */
  nozzle: Uint8Array
  /** Drain outward normal per DRAIN cell, encoded (nx+1) + 3·(ny+1). */
  drainDir: Uint8Array
  /** Signed distance to the nearest wall at cell centres (negative = water). */
  sdf: Float32Array
}

export function gateSdf(g: GateSpec, x: number, y: number): number {
  let d = 1e9
  for (const s of g.open) d = Math.min(d, s(x, y))
  // one-cell solid border round the tile
  return Math.max(d, sdRect(x, y, 1, 1, g.w - 1, g.h - 1))
}

/**
 * Rasterise a gate into (part of) a raster at offset (ox, oy). Nozzle indices
 * are `nozzleBase + k` for the gate's k-th nozzle.
 */
export function rasterizeGate(r: Raster, g: GateSpec, ox: number, oy: number, nozzleBase: number): void {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const d = gateSdf(g, px, py)
      const idx = (oy + y) * r.w + (ox + x)
      r.sdf[idx] = d
      r.type[idx] = d < 0 ? CELL.FLUID : CELL.SOLID
      if (d >= 0) continue
      g.nozzles.forEach((n, k) => {
        const [dx, dy] = nozzleDir(n)
        const t = (px - n.a[0]) * dx + (py - n.a[1]) * dy
        const s = -(px - n.a[0]) * dy + (py - n.a[1]) * dx
        if (t >= 0 && t < 2.5 && Math.abs(s) <= n.hw) {
          r.type[idx] = CELL.NOZZLE
          r.nozzle[idx] = nozzleBase + k
        }
      })
      for (const dr of g.drains) {
        if (px >= dr.x0 && px <= dr.x1 && py >= dr.y0 && py <= dr.y1) {
          r.type[idx] = CELL.DRAIN
          r.drainDir[idx] = dr.nx + 1 + 3 * (dr.ny + 1)
        }
      }
    }
  }
}

export function emptyRaster(w: number, h: number): Raster {
  const n = w * h
  return {
    w,
    h,
    type: new Uint8Array(n).fill(CELL.SOLID),
    nozzle: new Uint8Array(n).fill(255),
    drainDir: new Uint8Array(n),
    sdf: new Float32Array(n).fill(12),
  }
}

/** Unit jet direction of a nozzle. */
export function nozzleDir(n: NozzleSpec): Vec {
  const L = Math.hypot(n.b[0] - n.a[0], n.b[1] - n.a[1])
  return [(n.b[0] - n.a[0]) / L, (n.b[1] - n.a[1]) / L]
}

/** Number of nozzle cells across a nozzle (its jet flux is cells × speed). */
export function nozzleCells(n: NozzleSpec): number {
  return 2 * Math.floor(n.hw) + 1
}
