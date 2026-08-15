// Q8 fixed-point helpers. Everything in sim/ is integer math — no floats,
// no transcendentals (Math.sin at startup would not be bit-identical across
// engines, so the heading table is baked literals).

import { Q } from './constants'

// Floor division (toward negative infinity). (a/b)|0 truncates toward zero
// and disagrees on negatives, which bites on velocities.
export function fdiv(a: number, b: number): number {
  return Math.floor(a / b)
}

// Multiply a Q8 value by a Q8 multiplier (floor semantics, deterministic).
export function mulQ(a: number, m: number): number {
  return Math.floor((a * m) / Q)
}

export function cellOf(q: number): number {
  return fdiv(q, Q)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// 16 quantized headings, Q8 unit vectors (cos, sin at 22.5° steps), baked.
export const HEADING_X: readonly number[] = [
  256, 237, 181, 98, 0, -98, -181, -237, -256, -237, -181, -98, 0, 98, 181, 237,
]
export const HEADING_Y: readonly number[] = [
  0, 98, 181, 237, 256, 237, 181, 98, 0, -98, -181, -237, -256, -237, -181, -98,
]

// Pick the heading maximizing the dot product with (dx, dy).
// Ties break by lowest index (deterministic).
export function bestHeading(dx: number, dy: number): number {
  let best = 0
  let bestDot = -Infinity
  for (let k = 0; k < 16; k++) {
    const dot = HEADING_X[k] * dx + HEADING_Y[k] * dy
    if (dot > bestDot) {
      bestDot = dot
      best = k
    }
  }
  return best
}
