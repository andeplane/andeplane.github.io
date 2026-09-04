// The erosion law — pure, shared by the WGSL kernel (via interpolation) and
// the CPU sim/tests. This rule IS the anti-lock mechanism: walls are legal to
// dam with, but shear wears channel walls and pressure head pipes through
// dams, with porosity feedback making breaches cascade.

import { CONFIG } from '../../config'

export interface ErosionInputs {
  /** Current wall integrity 0..1. */
  integrity: number
  /** Max |u| among open neighbours (shear proxy). */
  shear: number
  /** Max open-neighbour density minus ambient (1.0) — the local pressure head. */
  head: number
}

/**
 * Porosity of a damaged wall: intact walls keep a seed leak (piping needs a
 * path); construction armor (integrity > 1) stays sealed at the seed value.
 */
export function porosity(integrity: number): number {
  const { porosityEps } = CONFIG.erosion
  return porosityEps + (1 - porosityEps) * (1 - Math.min(integrity, 1))
}

/** Integrity lost this tick. */
export function erosionStress({ integrity, shear, head }: ErosionInputs): number {
  const { kShear, shearThreshold, kPipe, pipeThreshold } = CONFIG.erosion
  const shearTerm = kShear * Math.max(shear - shearThreshold, 0)
  const pipeTerm = kPipe * Math.max(head - pipeThreshold, 0) * porosity(integrity)
  return shearTerm + pipeTerm
}
