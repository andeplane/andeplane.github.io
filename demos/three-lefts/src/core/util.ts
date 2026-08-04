export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Exponential smoothing that is correct for a variable timestep. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target
  return target + (current - target) * Math.pow(2, -dt / halfLife)
}
