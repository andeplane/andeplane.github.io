/**
 * The load: a spherical charge, and a modified Friedlander pulse on every exposed face.
 *
 * The pressure is prescribed rather than solved for. A coupled fluid would be a whole
 * second solver, and every blast study that matters — and LS-DYNA's CONWEP — applies
 * p(t) to the loaded face instead, because the wall's response is what is being asked
 * about, not the air's.
 *
 * Overpressure and duration come from the Kinney & Graham fits, which are closed form
 * and run a little below the Kingery–Bulmash polynomials at moderate scaled distance;
 * for a demo whose point is "what does the wall do", being within ~20% of the standard
 * curves matters far less than the shape of the pulse and the sweep across the wall.
 * Both fits are only meaningful for Z > ~0.4 m/kg^(1/3); closer in, the expanding
 * detonation products give a multi-peaked history no single pulse describes, so the UI
 * refuses to go there rather than quietly drawing a curve that means nothing.
 */

export const P0 = 101325; // ambient pressure, Pa
export const A0 = 340; // ambient sound speed, m/s
export const MIN_SCALED_DISTANCE = 0.4;

export interface Charge {
  /** Charge centre, metres, in world coordinates. */
  x: number;
  y: number;
  z: number;
  /** TNT equivalent mass, kg. */
  mass: number;
  /** Friedlander decay coefficient; 0 means "use the fit". */
  decay: number;
}

export function defaultCharge(): Charge {
  return { x: 1.8, y: 1.0, z: -6, mass: 20, decay: 0 };
}

/** Scaled distance Z = R / W^(1/3), m/kg^(1/3). */
export function scaledDistance(r: number, mass: number): number {
  return r / Math.cbrt(Math.max(mass, 1e-6));
}

/** Peak side-on (incident) overpressure, Pa. Kinney & Graham. */
export function incidentOverpressure(z: number): number {
  const zz = Math.max(z, 0.05);
  const num = 808 * (1 + (zz / 4.5) ** 2);
  const den =
    Math.sqrt(1 + (zz / 0.048) ** 2) *
    Math.sqrt(1 + (zz / 0.32) ** 2) *
    Math.sqrt(1 + (zz / 1.35) ** 2);
  return (P0 * num) / den;
}

/** Peak normally-reflected overpressure, Pa. Rankine–Hugoniot for a strong shock in air. */
export function reflectedOverpressure(pso: number): number {
  return (2 * pso * (7 * P0 + 4 * pso)) / (7 * P0 + pso);
}

/** Positive phase duration, seconds. Kinney & Graham. */
export function positiveDuration(z: number, mass: number): number {
  const zz = Math.max(z, 0.05);
  const num = 980 * (1 + (zz / 0.54) ** 10);
  const den = (1 + (zz / 0.02) ** 3) * (1 + (zz / 0.74) ** 6) * Math.sqrt(1 + (zz / 6.9) ** 2);
  return (num / den) * Math.cbrt(Math.max(mass, 1e-6)) * 1e-3;
}

/**
 * Friedlander decay coefficient.
 *
 * Solving b so that peak, duration and impulse agree needs the Kingery–Bulmash impulse
 * polynomial and an iteration per point. This is a fit to the published b(Z) trend —
 * b ≈ 5 at Z = 1, ≈ 1.7 at Z = 3, ≈ 0.5 at Z = 10 — and the UI exposes it as a slider
 * so the shape can be set by hand when the default looks wrong.
 */
export function decayCoefficient(z: number): number {
  return Math.min(20, Math.max(0.2, 5 / Math.max(z, 0.25)));
}

/** Shock front speed at a given incident overpressure, m/s. */
export function shockSpeed(pso: number): number {
  return A0 * Math.sqrt(1 + (6 * pso) / (7 * P0));
}

/**
 * Arrival time as a function of distance, by integrating dR/U(R).
 *
 * The front leaves the charge at many times the speed of sound and decays toward it, so
 * a constant-speed arrival time is wrong by a lot close in. Integrating it once at setup
 * costs nothing, makes the wave visibly sweep across the wall, and — because the drawn
 * shock sphere reads the same table — guarantees the picture and the load agree.
 */
export class ArrivalTable {
  readonly r: Float64Array;
  readonly t: Float64Array;

  constructor(mass: number, rMax: number, samples = 512) {
    const w13 = Math.cbrt(Math.max(mass, 1e-6));
    const r0 = 0.05 * w13;
    this.r = new Float64Array(samples);
    this.t = new Float64Array(samples);
    let acc = 0;
    let prev = r0;
    this.r[0] = r0;
    this.t[0] = 0;
    for (let i = 1; i < samples; i++) {
      const rr = r0 + ((rMax - r0) * i) / (samples - 1);
      const mid = (prev + rr) / 2;
      acc += (rr - prev) / shockSpeed(incidentOverpressure(scaledDistance(mid, mass)));
      this.r[i] = rr;
      this.t[i] = acc;
      prev = rr;
    }
  }

  /** Time at which the front reaches distance r. */
  timeAt(r: number): number {
    return interp(this.r, this.t, r);
  }

  /** Front radius at time t — what the rendered shock sphere draws. */
  radiusAt(t: number): number {
    return interp(this.t, this.r, t);
  }
}

function interp(xs: Float64Array, ys: Float64Array, x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * ((ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

/** Modified Friedlander shape, normalised to a unit peak. Negative past t_d. */
export function friedlander(tau: number, b: number): number {
  if (tau < 0 || tau > 6) return 0;
  return (1 - tau) * Math.exp(-b * tau);
}

/**
 * Pressure on a face at incidence angle θ, blending reflected and side-on.
 *
 * The CONWEP blend: full reflected pressure head-on, plain side-on pressure at grazing
 * incidence, and nothing on a face pointing away. Without it the whole wall would feel
 * the same head-on pressure regardless of which way its surface points, which is what
 * makes a naive blast model push the returns and reveals as hard as the façade.
 */
export function facePressure(pr: number, pso: number, cosTheta: number): number {
  if (cosTheta <= 0) return 0;
  const c2 = cosTheta * cosTheta;
  return pr * c2 + pso * (1 + cosTheta - 2 * c2);
}

export interface FacePulse {
  /** Peak pressure on this face, Pa. */
  peak: number;
  /** Arrival time, s. */
  arrival: number;
  /** Positive phase duration, s. */
  duration: number;
  /** Decay coefficient. */
  b: number;
}

/** Everything the solver needs to know about the load on one exposed quad. */
export function pulseFor(
  charge: Charge,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
  table: ArrivalTable,
): FacePulse {
  let dx = cx - charge.x;
  let dy = cy - charge.y;
  let dz = cz - charge.z;
  const r = Math.max(Math.hypot(dx, dy, dz), 1e-4);
  dx /= r;
  dy /= r;
  dz /= r;
  const z = scaledDistance(r, charge.mass);
  const pso = incidentOverpressure(z);
  const pr = reflectedOverpressure(pso);
  // The face's outward normal points away from the wall; the wave travels along d.
  const cosTheta = -(dx * nx + dy * ny + dz * nz);
  return {
    peak: facePressure(pr, pso, cosTheta),
    arrival: table.timeAt(r),
    duration: positiveDuration(z, charge.mass),
    b: charge.decay > 0 ? charge.decay : decayCoefficient(z),
  };
}
