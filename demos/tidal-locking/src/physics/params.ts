/**
 * Simulation units: G = 1, Earth mass = 1, moon radius = 1.
 *
 * Nothing here is to scale with the real Earth-Moon system, and that is deliberate.
 * Tidal torque falls off as a^-6, so the real Moon took ~10^7 years to lock. To watch
 * it happen in a few seconds we put the moon on a very tight orbit, make it soft, and
 * make it extremely lossy. The *mechanism* is untouched: gravity, springs, friction.
 */
export interface SimParams {
  /** Gravitational constant. */
  G: number;
  /** Mass of the central body (a point mass, gravitationally). */
  earthMass: number;
  /** Total mass of the moon, split evenly across its particles. */
  moonMass: number;
  /** Undeformed radius of the moon. */
  moonRadius: number;
  /** Number of soft-body particles. */
  particleCount: number;
  /** Spring cutoff as a multiple of the mean particle spacing. */
  neighborRadius: number;
  /** Hookean spring stiffness k. Lower = softer moon = bigger bulge = faster locking. */
  stiffness: number;
  /**
   * Dashpot coefficient c, applied to the along-spring relative velocity only.
   * This is the entire dissipation mechanism. Set it to 0 and the moon never locks.
   */
  damping: number;
  /** Semi-major axis of the initial orbit. */
  orbitRadius: number;
  /** Initial orbital eccentricity (0 = circular). */
  eccentricity: number;
  /** Initial spin rate as a multiple of the orbital rate. >1 means super-synchronous. */
  spinRatio: number;
  /** Include gravity between the moon's own particles (O(N^2), off by default). */
  selfGravity: boolean;
  /** Integration timestep. */
  dt: number;
  /**
   * Simulated time spent settling the moon into equilibrium before the clock starts.
   * Without it the first few orbits are a ring-down artefact of the initial condition.
   */
  relaxTime: number;
  /** RNG seed for particle placement. */
  seed: number;
}

export const DEFAULT_PARAMS: SimParams = {
  G: 1,
  earthMass: 1,
  moonMass: 0.02,
  moonRadius: 1,
  particleCount: 200,
  neighborRadius: 1.6,
  stiffness: 1.5e-3,
  damping: 5.2e-5,
  orbitRadius: 7.5,
  eccentricity: 0,
  spinRatio: 1.4,
  selfGravity: false,
  dt: 0.04,
  relaxTime: 30,
  seed: 1337,
};

/**
 * Roughly how many orbits the default settings take to lock, used to size the charts
 * and the progress readout. Measured, not derived.
 */
export const EXPECTED_LOCK_ORBITS = 1000;


/** Mean-motion (orbital angular speed) of a circular orbit at the given radius. */
export function meanMotion(p: SimParams, radius = p.orbitRadius): number {
  return Math.sqrt((p.G * (p.earthMass + p.moonMass)) / (radius * radius * radius));
}

/** Orbital period of a circular orbit at the given radius. */
export function orbitalPeriod(p: SimParams, radius = p.orbitRadius): number {
  return (2 * Math.PI) / meanMotion(p, radius);
}
