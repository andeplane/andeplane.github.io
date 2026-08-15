/** Exact results used as chart overlays and validation targets. J = k_B = 1. */

import { GEOMETRIES } from './lattice.ts';

export const TC_SQUARE = GEOMETRIES.square.Tc;

/**
 * Onsager–Yang spontaneous magnetization of the square lattice:
 * m(T) = (1 − sinh(2/T)^−4)^(1/8) for T < T_c, 0 above.
 */
export function onsagerMagnetization(T: number): number {
  if (T <= 0) return 1;
  if (T >= TC_SQUARE) return 0;
  const s = Math.sinh(2 / T);
  const inner = 1 - 1 / (s * s * s * s);
  return inner <= 0 ? 0 : Math.pow(inner, 1 / 8);
}

/** Exact internal energy per spin of the square lattice at T_c: −√2. */
export const E_SQUARE_AT_TC = -Math.SQRT2;
