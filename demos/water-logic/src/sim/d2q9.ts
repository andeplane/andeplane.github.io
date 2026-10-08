// Single source of truth for the lattice Boltzmann math. Imported by the CPU
// reference solver (cpuLbm.ts) AND interpolated into the GLSL kernel source
// (gl/shaders.ts), so a weight or a relaxation time can never drift between
// the solver the tests check and the solver the page runs.
//
// Lattice: D2Q9. Direction i has velocity (EX[i], EY[i]); +y is DOWN the
// screen (row 0 is the top of the board), which is the direction jets flow.

export const Q = 9
export const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1] as const
export const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1] as const
export const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36] as const
export const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6] as const

/** Cell classes stored in the geometry map. */
export const CELL = {
  FLUID: 0,
  SOLID: 1,
  /** Nozzle: velocity inlet when its valve is open, a wall when shut. */
  NOZZLE: 2,
  /** Drain to ambient: ρ pinned to 1, outflow velocity extrapolated. */
  DRAIN: 3,
} as const

/** Physical parameters, in lattice units. */
export const PHYS = {
  /** BGK relaxation time; kinematic viscosity ν = (τ − ½)/3. */
  tau: 0.51,
  /** Smagorinsky constant: sub-grid eddy viscosity keeps τ≈0.5 stable. */
  smagorinsky: 0.14,
  /** Nozzle exit speed (lattice units / step). Mach = u·√3 ≈ 0.26. */
  jetSpeed: 0.15,
  /** Hard velocity clamp, a guard rail against a transient blowing up. */
  uClamp: 0.3,
  /** Valve opening rate per lattice step (a valve takes 1/rate steps to open). */
  valveRate: 1 / 240,
  /** A valve below this opening is treated as shut (a wall). */
  valveShut: 0.02,
  /**
   * Fraction of a re-entering velocity a drain lets back in. A fully open
   * boundary lets a through-current between two outlets run away on its own.
   */
  drainInflow: 0.3,
} as const

/** Equilibrium population i for density r and velocity (ux, uy). */
export function feq(i: number, r: number, ux: number, uy: number): number {
  const eu = EX[i] * ux + EY[i] * uy
  const usq = ux * ux + uy * uy
  return W[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq)
}
