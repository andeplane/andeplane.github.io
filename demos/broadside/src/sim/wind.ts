import { piecewise, wrapAngle } from "./math";

export interface Wind {
  /** Direction the wind blows TOWARD, using the ship heading convention. */
  direction: number;
  /** 0..1 multiplier on sailing speed. */
  strength: number;
  /** Optional storm forces, absent in ordinary sailing. */
  drift?: number;
  turbulence?: number;
}

/**
 * Points of sail, indexed by the angle between the ship's heading and the
 * direction the wind blows toward:
 *   0      running (wind straight behind)  - fast
 *   PI/2   beam reach (wind from the side) - fastest
 *   PI     in irons (sailing into the wind) - slow, but never zero so
 *          a young captain can never get stuck.
 */
const POINTS_OF_SAIL: ReadonlyArray<readonly [number, number]> = [
  [0, 0.85],
  [Math.PI / 4, 0.95],
  [Math.PI / 2, 1.0],
  [(3 * Math.PI) / 4, 0.6],
  [Math.PI, 0.25],
];

export const sailEfficiency = (heading: number, wind: Wind): number => {
  const off = Math.abs(wrapAngle(heading - wind.direction));
  return piecewise(POINTS_OF_SAIL, off) * (0.5 + 0.5 * wind.strength);
};

/** Slowly shift the wind so long fights feel alive. */
export const shiftWind = (wind: Wind, time: number, baseDirection: number): Wind => ({
  direction: wrapAngle(baseDirection + Math.sin(time * 0.013) * 0.35 + Math.sin(time * 0.041) * 0.12),
  strength: wind.strength,
});
