export interface HoleParams {
  /** Fraction 0..1 along the tube's interior length (0 = at the closed/struck end). */
  position: number;
  /** Physical diameter in meters. 0 means effectively closed. */
  diameter: number;
}

export interface TubeParams {
  /** Interior length in meters. */
  length: number;
  /** Interior diameter (the 2D cross-section's height) in meters. */
  diameter: number;
  holes: HoleParams[];
}

export interface ExcitationParams {
  /** 0..1 knob, mapped to a peak source pressure in Pa. */
  strength: number;
  /** 0..1 knob, mapped to a pulse duration in seconds. */
  pulseWidth: number;
}

/** Cell-center layout of the simulation grid, in meters and cells. */
export interface GridLayout {
  h: number; // cell size, meters
  nx: number;
  ny: number;
  dt: number; // seconds
  spongeWidth: number; // cells

  // Tube interior box, in cell-index space (inclusive ranges).
  tubeX0: number;
  tubeX1: number;
  tubeY0: number;
  tubeY1: number;
  wallThicknessCells: number;

  // Source location (cell indices), just inside the closed left cap.
  sourceX: number;
  sourceY0: number;
  sourceY1: number;

  holeGaps: { x0: number; x1: number; wall: 'top' | 'bottom'; holeIndex: number }[];
}

export interface Probe {
  id: number;
  /** Position as a fraction (0..1) of the current grid, so it survives grid rebuilds. */
  fx: number;
  fy: number;
  /** Most recent pressure samples, in Pa, oldest first. */
  history: number[];
}
