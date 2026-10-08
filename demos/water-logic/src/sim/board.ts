// The 4-bit ripple-carry adder board: twelve gate tiles on one lattice.
//
//   column = bit (bit 3 on the left, bit 0 on the right, like a written number)
//   row 0  = HA1  impact element, inputs A_i, B_i      → s1_i, c1_i
//   row 1  = HA2  impact element, inputs s1_i, carry_in → SUM_i, c2_i
//   row 2  = OR   wall-attachment element, controls c1_i, c2_i → carry_out
//
// Tiles are separated by solid gutters, so each gate is its own independent
// fluid domain inside the one big texture. Gates are wired together by
// reading which channel their water leaves through and opening (or shutting)
// the matching valve on the next gate — the "pipes" drawn in the gutters.

import { CELL, PHYS } from './d2q9.ts'
import {
  type GateSpec,
  type Raster,
  TILE_H,
  TILE_W,
  emptyRaster,
  impactGate,
  nozzleCells,
  nozzleDir,
  rasterizeGate,
  wallGate,
} from './geometry.ts'

export const BITS = 4
export const GUTTER_X = 30
export const GUTTER_Y = 30
export const MARGIN_TOP = 44
export const MARGIN_BOTTOM = 40

export type Role = 'ha1' | 'ha2' | 'or'
export const ROLES: Role[] = ['ha1', 'ha2', 'or']

export interface PlacedGate {
  role: Role
  bit: number
  spec: GateSpec
  ox: number
  oy: number
  /** Global index of this gate's first nozzle. */
  nozzleBase: number
  /** Global index of this gate's first probe. */
  probeBase: number
}

export interface GlobalNozzle {
  gate: number
  name: string
  dx: number
  dy: number
  dye: number
  /** Volume flux of a fully open jet (cells × speed). */
  flux: number
  /** Exit centre, board coordinates. */
  x: number
  y: number
  /** Duct start (where the supply pipe connects), board coordinates. */
  ax: number
  ay: number
}

export interface GlobalProbe {
  gate: number
  name: string
  x0: number
  x1: number
  y: number
}

export interface Board {
  w: number
  h: number
  gates: PlacedGate[]
  nozzles: GlobalNozzle[]
  probes: GlobalProbe[]
  raster: Raster
}

export function tileOrigin(bit: number, row: number): [number, number] {
  const col = BITS - 1 - bit
  return [GUTTER_X + col * (TILE_W + GUTTER_X), MARGIN_TOP + row * (TILE_H + GUTTER_Y)]
}

export function buildBoard(): Board {
  const w = GUTTER_X + BITS * (TILE_W + GUTTER_X)
  const h = MARGIN_TOP + 3 * TILE_H + 2 * GUTTER_Y + MARGIN_BOTTOM
  const raster = emptyRaster(w, h)
  const gates: PlacedGate[] = []
  const nozzles: GlobalNozzle[] = []
  const probes: GlobalProbe[] = []
  for (let bit = 0; bit < BITS; bit++) {
    ROLES.forEach((role, row) => {
      const spec = role === 'or' ? wallGate() : impactGate()
      const [ox, oy] = tileOrigin(bit, row)
      const gi = gates.length
      const g: PlacedGate = { role, bit, spec, ox, oy, nozzleBase: nozzles.length, probeBase: probes.length }
      gates.push(g)
      rasterizeGate(raster, spec, ox, oy, g.nozzleBase)
      for (const n of spec.nozzles) {
        const [dx, dy] = nozzleDir(n)
        nozzles.push({
          gate: gi,
          name: n.name,
          dx,
          dy,
          dye: n.dye,
          flux: nozzleCells(n) * PHYS.jetSpeed,
          x: ox + n.b[0],
          y: oy + n.b[1],
          ax: ox + n.a[0],
          ay: oy + n.a[1],
        })
      }
      for (const p of spec.probes) probes.push({ gate: gi, name: p.name, x0: ox + p.x0, x1: ox + p.x1, y: oy + p.y })
    })
  }
  return { w, h, gates, nozzles, probes, raster }
}

export function gateAt(board: Board, role: Role, bit: number): PlacedGate {
  const g = board.gates.find((q) => q.role === role && q.bit === bit)
  if (!g) throw new Error(`no gate ${role}${bit}`)
  return g
}

/** Count fluid cells (for stats). */
export function fluidCells(r: Raster): number {
  let n = 0
  for (let i = 0; i < r.type.length; i++) if (r.type[i] !== CELL.SOLID) n++
  return n
}
