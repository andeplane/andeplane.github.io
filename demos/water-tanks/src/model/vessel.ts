/**
 * A vessel is a 2D glass outline, symmetric about its centre line, whose width at height h
 * above its floor is a polynomial w(h) = a + b·h + c·h². Everything in this demo is 2D, so
 * "volume" is the area of water in the cross-section (world units²).
 *
 * The profile is the whole trick of the shaped-vessel function generator: the volume held up
 * to height h is V(h) = ∫₀ʰ w, so a straight-sided tank has V ∝ h, a V-shaped wedge (w ∝ h)
 * has V ∝ h², and a horn with w ∝ h² has V ∝ h³.
 */
export type Profile = readonly [a: number, b: number, c: number];

export const widthAt = (p: Profile, h: number): number => p[0] + p[1] * h + p[2] * h * h;

export const volumeAt = (p: Profile, h: number): number =>
  p[0] * h + (p[1] * h * h) / 2 + (p[2] * h * h * h) / 3;

/** Inverse of volumeAt: the height a volume V fills the vessel to. Exact for rect and wedge. */
export function heightOf(p: Profile, V: number): number {
  if (V <= 0) return 0;
  const [a, b, c] = p;
  if (c === 0) {
    if (b === 0) return V / a;
    // a·h + b·h²/2 = V  →  h = (−a + √(a² + 2bV)) / b, written to avoid cancellation.
    return (2 * V) / (a + Math.sqrt(a * a + 2 * b * V));
  }
  // General monotone profile: Newton from a safe bracket.
  let lo = 0;
  let hi = 1;
  while (volumeAt(p, hi) < V) hi *= 2;
  let h = (lo + hi) / 2;
  for (let i = 0; i < 80; i++) {
    const f = volumeAt(p, h) - V;
    if (f > 0) hi = h;
    else lo = h;
    const w = widthAt(p, h);
    let next = w > 0 ? h - f / w : (lo + hi) / 2;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - h) < 1e-15) return next;
    h = next;
  }
  return h;
}

export interface ScaleSpec {
  /** 'volume' ticks read V / unit; 'level' ticks read h / unit. */
  mode: 'volume' | 'level';
  unit: number;
  max: number;
  /** Minor tick spacing in reading units. */
  step: number;
  /** Label every n-th minor tick. */
  labelEvery: number;
  side: 'left' | 'right';
}

export interface VesselSpec {
  id: string;
  label: string;
  /** Centre line x and floor y, world units. */
  x: number;
  y0: number;
  height: number;
  profile: Profile;
  scale?: ScaleSpec;
  /** The sump is an endless reservoir: it accepts water and its level never moves. */
  infinite?: boolean;
  /** Fixed displayed volume for an infinite vessel. */
  restVolume?: number;
  /** Where the engraved label goes: above the rim (default) or beside it. */
  labelPos?: 'top' | 'left' | 'right';
  /** Optional caption drawn under the label. */
  caption?: string;
}

/** Height (above the floor) at which a given scale reading sits. */
export function heightForReading(v: VesselSpec, reading: number): number {
  const s = v.scale;
  if (!s) return 0;
  return s.mode === 'level' ? reading * s.unit : heightOf(v.profile, reading * s.unit);
}

export function readingOf(v: VesselSpec, volume: number): number {
  const s = v.scale;
  if (!s) return volume;
  return s.mode === 'level' ? heightOf(v.profile, volume) / s.unit : volume / s.unit;
}
