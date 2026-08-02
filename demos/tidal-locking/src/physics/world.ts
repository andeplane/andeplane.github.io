import { sampleBall } from './sampling.ts';
import { meanMotion, type SimParams } from './params.ts';

export interface SpringNetwork {
  a: Int32Array;
  b: Int32Array;
  rest: Float64Array;
  count: number;
}

/**
 * The whole simulated universe: one point-mass planet and one soft-body moon.
 *
 * There is no tidal-force term anywhere in this file. Every particle of the moon feels
 * plain inverse-square gravity toward the planet, and the planet feels the reaction.
 * Because the near side is slightly closer than the far side, the moon stretches; because
 * the springs are lossy, the stretch lags the planet; because the lagging bulge is
 * off-axis, gravity exerts a net torque on it. Tidal locking falls out of that alone.
 */
export class World {
  readonly params: SimParams;
  readonly n: number;
  readonly particleMass: number;
  readonly springs: SpringNetwork;
  /** Particle positions relative to the moon's centroid at t=0. Used for mesh skinning. */
  readonly restShape: Float64Array;
  /**
   * Inverse of sum(q x q) over the rest shape, where q is a rest position. Constant, so
   * it is precomputed once: it turns the per-frame least-squares fit of the moon's
   * deformation gradient into a single 3x3 multiply.
   */
  readonly restMomentInv: Float64Array;

  /** Particle state, flat xyz triples. */
  readonly pos: Float64Array;
  readonly vel: Float64Array;
  readonly acc: Float64Array;

  readonly earthPos = new Float64Array(3);
  readonly earthVel = new Float64Array(3);
  readonly earthAcc = new Float64Array(3);

  /** Simulated time elapsed. */
  time = 0;
  /** Cumulative energy removed by the dashpots — "heat inside the moon". */
  heat = 0;
  /** Energy dissipated during the most recent step, for the instantaneous readout. */
  lastHeatRate = 0;
  private prevHeatRate = 0;

  private readonly vHalf: Float64Array;
  private readonly earthVHalf = new Float64Array(3);

  constructor(params: SimParams) {
    this.params = { ...params };
    this.n = params.particleCount;
    this.particleMass = params.moonMass / this.n;

    const sample = sampleBall(this.n, params.moonRadius, params.seed);
    recentre(sample, this.n);
    this.restShape = sample.slice();
    this.restMomentInv = invert3(secondMoment(this.restShape, this.n));
    this.springs = buildSprings(sample, this.n, params.moonRadius, params.neighborRadius);

    this.pos = new Float64Array(this.n * 3);
    this.vel = new Float64Array(this.n * 3);
    this.acc = new Float64Array(this.n * 3);
    this.vHalf = new Float64Array(this.n * 3);

    this.reset();
  }

  /** Place the two bodies on a Keplerian orbit and spin the moon up. */
  reset(): void {
    const p = this.params;
    const { G, earthMass: M, moonMass: m } = p;
    const total = M + m;

    // Start at periapsis, separation along +X, relative velocity along -Z so that the
    // orbital angular momentum points along +Y (the "up" axis of the render).
    const rp = p.orbitRadius * (1 - p.eccentricity);
    const vp = Math.sqrt(((G * total) / p.orbitRadius) * ((1 + p.eccentricity) / (1 - p.eccentricity)));

    const fE = -m / total;
    const fM = M / total;
    this.earthPos.set([fE * rp, 0, 0]);
    this.earthVel.set([0, 0, -fE * vp]);
    const comX = fM * rp;
    const comVz = -fM * vp;

    // Spin rate is specified relative to the orbital rate at the *starting* separation.
    const spin = p.spinRatio * meanMotion(p, rp);

    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const rx = this.restShape[k];
      const ry = this.restShape[k + 1];
      const rz = this.restShape[k + 2];
      this.pos[k] = comX + rx;
      this.pos[k + 1] = ry;
      this.pos[k + 2] = rz;
      // v = V_com + omega x r, with omega = (0, spin, 0)
      this.vel[k] = spin * rz;
      this.vel[k + 1] = 0;
      this.vel[k + 2] = comVz - spin * rx;
    }

    this.time = 0;
    this.heat = 0;
    this.lastHeatRate = 0;
    this.acc.fill(0);
    this.earthAcc.fill(0);
    this.computeAccelerations(this.vel);
    if (p.relaxTime > 0) this.relax(p.relaxTime);
  }

  /**
   * Settle the moon into its equilibrium shape before the clock starts.
   *
   * Released as an unstressed sphere, the moon has to grow both a tidal bulge and a
   * centrifugal bulge at once, and it overshoots: the first few orbits are dominated by
   * a violent ring-down that has nothing to do with tidal locking but looks like it
   * does. So we run the body hard-damped for a moment, then project every velocity onto
   * the rigid-body motion it is closest to -- which removes all vibrational kinetic
   * energy while conserving linear and angular momentum exactly -- and start from there.
   */
  relax(duration: number): void {
    // The running damping is deliberately tiny -- a moon that loses energy quickly locks
    // in a handful of orbits, which is neither true nor interesting to watch. That
    // leaves the elastic modes barely damped, so settling needs a much heavier hand than
    // the simulation itself uses. Pick it just under critical for a single bond rather
    // than as a blind multiple of the real value, which lands wherever it lands.
    const trueDamping = this.params.damping;
    const settleDamping = 1.4 * Math.sqrt(this.params.stiffness * this.particleMass);
    // An explicit dashpot needs dt < 2m/(c z): every bond on a particle damps it, so the
    // coordination number belongs in the bound. Leaving it out overshoots and detonates.
    const bondsPerParticle = (2 * this.springs.count) / this.n;
    const dt = Math.min(
      this.params.dt,
      (0.3 * this.particleMass) / (settleDamping * bondsPerParticle),
    );
    this.params.damping = settleDamping;
    this.computeAccelerations(this.vel);
    for (let t = 0; t < duration; t += dt) this.step(dt);
    this.params.damping = trueDamping;
    this.projectToRigidBody();
    this.time = 0;
    this.heat = 0;
    this.lastHeatRate = 0;
    this.computeAccelerations(this.vel);
  }

  /** Replace the velocity field with the rigid-body motion carrying the same momenta. */
  private projectToRigidBody(): void {
    const n = this.n;
    const { pos, vel } = this;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      cx += pos[k];
      cy += pos[k + 1];
      cz += pos[k + 2];
      vx += vel[k];
      vy += vel[k + 1];
      vz += vel[k + 2];
    }
    cx /= n;
    cy /= n;
    cz /= n;
    vx /= n;
    vy /= n;
    vz /= n;

    // Angular momentum and inertia tensor about the centre of mass.
    const I = new Float64Array(9);
    let lx = 0;
    let ly = 0;
    let lz = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const x = pos[k] - cx;
      const y = pos[k + 1] - cy;
      const z = pos[k + 2] - cz;
      const ux = vel[k] - vx;
      const uy = vel[k + 1] - vy;
      const uz = vel[k + 2] - vz;
      const r2 = x * x + y * y + z * z;
      I[0] += r2 - x * x;
      I[4] += r2 - y * y;
      I[8] += r2 - z * z;
      I[1] -= x * y;
      I[2] -= x * z;
      I[5] -= y * z;
      lx += y * uz - z * uy;
      ly += z * ux - x * uz;
      lz += x * uy - y * ux;
    }
    I[3] = I[1];
    I[6] = I[2];
    I[7] = I[5];
    const Iinv = invert3(I);
    const wx = Iinv[0] * lx + Iinv[1] * ly + Iinv[2] * lz;
    const wy = Iinv[3] * lx + Iinv[4] * ly + Iinv[5] * lz;
    const wz = Iinv[6] * lx + Iinv[7] * ly + Iinv[8] * lz;

    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const x = pos[k] - cx;
      const y = pos[k + 1] - cy;
      const z = pos[k + 2] - cz;
      vel[k] = vx + wy * z - wz * y;
      vel[k + 1] = vy + wz * x - wx * z;
      vel[k + 2] = vz + wx * y - wy * x;
    }
  }

  /**
   * One velocity-Verlet step.
   *
   * The dashpot force depends on velocity, which plain velocity-Verlet does not handle.
   * Evaluating the forces at the half-step velocity keeps the scheme second-order and
   * stable, and is the standard fix (it is what LAMMPS does for dissipative pair styles).
   */
  step(dt: number): void {
    const n3 = this.n * 3;
    const half = 0.5 * dt;

    for (let i = 0; i < n3; i++) {
      const vh = this.vel[i] + half * this.acc[i];
      this.vHalf[i] = vh;
      this.pos[i] += vh * dt;
    }
    for (let i = 0; i < 3; i++) {
      const vh = this.earthVel[i] + half * this.earthAcc[i];
      this.earthVHalf[i] = vh;
      this.earthPos[i] += vh * dt;
    }

    this.computeAccelerations(this.vHalf);

    for (let i = 0; i < n3; i++) this.vel[i] = this.vHalf[i] + half * this.acc[i];
    for (let i = 0; i < 3; i++) this.earthVel[i] = this.earthVHalf[i] + half * this.earthAcc[i];

    // Trapezoidal, not rectangular. Over the tens of millions of steps it takes to lock,
    // a first-order heat integral accumulates an error several times larger than the
    // total heat -- which would make the energy budget look broken when it is not.
    this.heat += 0.5 * (this.prevHeatRate + this.lastHeatRate) * dt;
    this.prevHeatRate = this.lastHeatRate;
    this.time += dt;
  }

  /** Sum of gravity, spring and dashpot forces, divided by mass. */
  private computeAccelerations(vRef: Float64Array): void {
    const { G, earthMass: M, stiffness: k, damping: c, selfGravity } = this.params;
    const { pos, acc, springs } = this;
    const mp = this.particleMass;
    const n = this.n;

    acc.fill(0);
    let eax = 0;
    let eay = 0;
    let eaz = 0;
    const ex = this.earthPos[0];
    const ey = this.earthPos[1];
    const ez = this.earthPos[2];
    const gm = G * M;
    const gmp = G * mp;

    // --- Planet <-> each moon particle, with the reaction back onto the planet.
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const dx = ex - pos[i3];
      const dy = ey - pos[i3 + 1];
      const dz = ez - pos[i3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR / r2;
      const s = gm * invR3;
      acc[i3] += dx * s;
      acc[i3 + 1] += dy * s;
      acc[i3 + 2] += dz * s;
      // Reaction on the planet: force G*M*m_p/r^2 toward the particle, so the planet's
      // acceleration is G*m_p*(-d)/r^3 -- the planet's own mass cancels out.
      const t = gmp * invR3;
      eax -= dx * t;
      eay -= dy * t;
      eaz -= dz * t;
    }
    this.earthAcc[0] = eax;
    this.earthAcc[1] = eay;
    this.earthAcc[2] = eaz;

    // --- Springs with dashpots. Both forces act along the bond axis, so each is a
    // central force: they conserve linear and angular momentum exactly. That matters --
    // if damping had any component perpendicular to the bond it would act like friction
    // against an absolute frame and despin the moon for the wrong reason.
    let heatRate = 0;
    const { a: sa, b: sb, rest, count } = springs;
    const invMp = 1 / mp;
    for (let s = 0; s < count; s++) {
      const i3 = sa[s] * 3;
      const j3 = sb[s] * 3;
      const dx = pos[j3] - pos[i3];
      const dy = pos[j3 + 1] - pos[i3 + 1];
      const dz = pos[j3 + 2] - pos[i3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const inv = 1 / len;
      const ux = dx * inv;
      const uy = dy * inv;
      const uz = dz * inv;

      const rvx = vRef[j3] - vRef[i3];
      const rvy = vRef[j3 + 1] - vRef[i3 + 1];
      const rvz = vRef[j3 + 2] - vRef[i3 + 2];
      const closing = rvx * ux + rvy * uy + rvz * uz;

      const fElastic = k * (len - rest[s]);
      const fDamp = c * closing;
      const f = (fElastic + fDamp) * invMp;

      acc[i3] += ux * f;
      acc[i3 + 1] += uy * f;
      acc[i3 + 2] += uz * f;
      acc[j3] -= ux * f;
      acc[j3 + 1] -= uy * f;
      acc[j3 + 2] -= uz * f;

      heatRate += c * closing * closing;
    }
    this.lastHeatRate = heatRate;

    if (selfGravity) {
      const g2 = G * mp;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const xi = pos[i3];
        const yi = pos[i3 + 1];
        const zi = pos[i3 + 2];
        for (let j = i + 1; j < n; j++) {
          const j3 = j * 3;
          const dx = pos[j3] - xi;
          const dy = pos[j3 + 1] - yi;
          const dz = pos[j3 + 2] - zi;
          // Plummer softening at a fraction of the particle spacing keeps close
          // encounters from blowing up.
          const r2 = dx * dx + dy * dy + dz * dz + 1e-3;
          const invR3 = 1 / (r2 * Math.sqrt(r2));
          const t = g2 * invR3;
          acc[i3] += dx * t;
          acc[i3 + 1] += dy * t;
          acc[i3 + 2] += dz * t;
          acc[j3] -= dx * t;
          acc[j3 + 1] -= dy * t;
          acc[j3 + 2] -= dz * t;
        }
      }
    }
  }

  /** Live-update stiffness/damping without rebuilding the network. */
  setMaterial(stiffness: number, damping: number): void {
    this.params.stiffness = stiffness;
    this.params.damping = damping;
    this.computeAccelerations(this.vel);
  }
}

/** Row-major sum of the outer products q x q over all particles. */
function secondMoment(q: Float64Array, n: number): Float64Array {
  const m = new Float64Array(9);
  for (let i = 0; i < n; i++) {
    const x = q[i * 3];
    const y = q[i * 3 + 1];
    const z = q[i * 3 + 2];
    m[0] += x * x;
    m[1] += x * y;
    m[2] += x * z;
    m[4] += y * y;
    m[5] += y * z;
    m[8] += z * z;
  }
  m[3] = m[1];
  m[6] = m[2];
  m[7] = m[5];
  return m;
}

/** Row-major 3x3 inverse. */
function invert3(m: Float64Array): Float64Array {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = new Float64Array(9);
  if (Math.abs(det) < 1e-30) return inv;
  const s = 1 / det;
  inv[0] = A * s;
  inv[1] = -(b * i - c * h) * s;
  inv[2] = (b * f - c * e) * s;
  inv[3] = B * s;
  inv[4] = (a * i - c * g) * s;
  inv[5] = -(a * f - c * d) * s;
  inv[6] = C * s;
  inv[7] = -(a * h - b * g) * s;
  inv[8] = (a * e - b * d) * s;
  return inv;
}

function recentre(p: Float64Array, n: number): void {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += p[i * 3];
    cy += p[i * 3 + 1];
    cz += p[i * 3 + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  for (let i = 0; i < n; i++) {
    p[i * 3] -= cx;
    p[i * 3 + 1] -= cy;
    p[i * 3 + 2] -= cz;
  }
}

/**
 * Connect every particle to the neighbours inside a cutoff. Rest lengths are the initial
 * separations, so the moon starts completely unstressed. A cutoff of ~1.45x the mean
 * spacing yields roughly 12-16 bonds per particle -- well above the 6 needed for a
 * central-force network to resist shear, so the moon behaves like a solid, not a fluid.
 */
export function buildSprings(
  p: Float64Array,
  n: number,
  radius: number,
  cutoffFactor: number,
): SpringNetwork {
  const spacing = radius * Math.cbrt((4 * Math.PI) / (3 * n));
  const cutoff = spacing * cutoffFactor;
  const cutoff2 = cutoff * cutoff;

  const a: number[] = [];
  const b: number[] = [];
  const rest: number[] = [];

  for (let i = 0; i < n; i++) {
    const xi = p[i * 3];
    const yi = p[i * 3 + 1];
    const zi = p[i * 3 + 2];
    for (let j = i + 1; j < n; j++) {
      const dx = p[j * 3] - xi;
      const dy = p[j * 3 + 1] - yi;
      const dz = p[j * 3 + 2] - zi;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > cutoff2) continue;
      a.push(i);
      b.push(j);
      rest.push(Math.sqrt(d2));
    }
  }

  return {
    a: Int32Array.from(a),
    b: Int32Array.from(b),
    rest: Float64Array.from(rest),
    count: rest.length,
  };
}
