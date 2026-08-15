// Single source of truth for all solver math, imported by BOTH the CPU
// reference solver (lbmRef.ts) and the WGSL kernels (template literals in
// sim/gpu/shaders). Values must never be duplicated in shader source.

/** D2Q9 lattice: direction vectors, weights, and opposite-direction table. */
export const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1] as const
export const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1] as const
export const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36] as const
export const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6] as const
export const Q = 9

/** Speed of sound squared in lattice units (c_s² = 1/3). */
export const CS2 = 1 / 3

/** Cell classes, shared by CPU mirror grid, ref solver, and WGSL. */
export const CELL = {
  OPEN: 0,
  BEDROCK: 1, // indestructible solid (domain border, map features)
  WALL: 2, // player-built, erodible (carries solidity 0..1)
  INLET: 3, // attacker edge; distributions forced to equilibrium from inletProfile
  OUTLET: 4, // defender edge; zero-gradient outflow
} as const
export type CellClass = (typeof CELL)[keyof typeof CELL]

/** Default sim parameters (game-tuned; tests override). */
export const SIM_DEFAULTS = {
  /** BGK relaxation time floor; ν = (τ − ½)/3. */
  tau0: 0.58,
  /** Smagorinsky constant (0 disables the LES term). */
  smagorinsky: 0.12,
  /** Hard velocity clamp in lattice units (stability under player-built walls). */
  uClamp: 0.25,
} as const

export interface SimParams {
  tau0: number
  smagorinsky: number
  uClamp: number
  /** Body force (gravity-like), applied everywhere; per-cell forces add on top. */
  gx: number
  gy: number
}

export const defaultParams = (): SimParams => ({
  ...SIM_DEFAULTS,
  gx: 0,
  gy: 0,
})
