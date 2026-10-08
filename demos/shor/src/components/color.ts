/** Phase → hue, magnitude → brightness: the usual domain-colouring map. */
export function phaseColor(re: number, im: number, scale: number): [number, number, number] {
  const mag = Math.hypot(re, im) * scale
  if (mag < 1e-4) return [0, 0, 0]
  const hue = ((Math.atan2(im, re) / (2 * Math.PI) + 1) % 1) * 6
  const v = Math.min(1, Math.sqrt(mag))
  const s = 0.72
  const i = Math.floor(hue)
  const f = hue - i
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]
  return [r * 255, g * 255, b * 255]
}
