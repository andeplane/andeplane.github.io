/** The same smooth bank profile is used by the mesh, loose coins and walking floor. */
export function hoardHeight(
  distance: number,
  radius: number,
  peak: number,
): number {
  return peak * Math.pow(Math.max(0, 1 - (distance / radius) ** 2), 1.7);
}
export function hoardGrowth(levels: number): number {
  return Math.min(1.4, 0.17 + Math.sqrt(Math.max(0, levels) / 10) * 0.7);
}
