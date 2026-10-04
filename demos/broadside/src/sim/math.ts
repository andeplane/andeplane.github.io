/** Small, allocation-light math helpers for the XZ sea plane. */

export interface Vec2 {
  x: number;
  z: number;
}

export const TAU = Math.PI * 2;

export const vec2 = (x = 0, z = 0): Vec2 => ({ x, z });

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
};

/** Wrap an angle to the range (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
};

/** Signed shortest difference from angle `a` to angle `b`. */
export const angleDiff = (a: number, b: number): number => wrapAngle(b - a);

/**
 * Heading convention: 0 points to +Z ("north" on screen), PI/2 to +X ("east").
 * Increasing heading turns the ship clockwise when seen from above (starboard).
 */
export const forward = (heading: number): Vec2 => ({ x: Math.sin(heading), z: Math.cos(heading) });

/** Unit vector pointing out of the starboard (right) side. */
export const starboard = (heading: number): Vec2 => ({ x: Math.cos(heading), z: -Math.sin(heading) });

export const length = (v: Vec2): number => Math.hypot(v.x, v.z);

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Square periodic sea: east joins west and north joins south. */
export const wrapCoordinate = (value: number, bounds: number): number =>
  ((value + bounds) % (bounds * 2) + bounds * 2) % (bounds * 2) - bounds;

export const seaDistance = (a: Vec2, b: Vec2, bounds?: number): number => bounds
  ? Math.hypot(wrapCoordinate(a.x - b.x, bounds), wrapCoordinate(a.z - b.z, bounds))
  : distance(a, b);

/** Heading that points from `from` toward `to`. */
export const headingTo = (from: Vec2, to: Vec2): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Transform a world point into a ship's local frame (x = starboard, z = forward). */
export const toLocal = (p: Vec2, origin: Vec2, heading: number): Vec2 => {
  const dx = p.x - origin.x;
  const dz = p.z - origin.z;
  const f = forward(heading);
  const r = starboard(heading);
  return { x: dx * r.x + dz * r.z, z: dx * f.x + dz * f.z };
};

/** Piecewise-linear interpolation through sorted [x, y] points. */
export const piecewise = (points: ReadonlyArray<readonly [number, number]>, x: number): number => {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error("piecewise needs at least one point");
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i]!;
    if (x <= p1[0]) {
      const p0 = points[i - 1]!;
      return lerp(p0[1], p1[1], (x - p0[0]) / (p1[0] - p0[0]));
    }
  }
  return last[1];
};
