import type { World } from './world.ts';

export interface Diagnostics {
  time: number;
  /** Centre-of-mass separation between planet and moon. */
  distance: number;
  /** Angular speed of the moon's centre of mass around the planet. */
  omegaOrbit: number;
  /** Angular speed of the moon about its own axis, from I^-1 L in its own COM frame. */
  omegaSpin: number;
  /** omegaSpin / omegaOrbit. Locking means this settles on 1. */
  spinRatio: number;
  /**
   * Angle by which the moon's long axis leads the planet direction, in the sense of the
   * moon's own rotation. Super-synchronous spin drags the bulge ahead (positive), and
   * gravity pulling back on that lead is exactly the braking torque.
   */
  bulgeLead: number;
  /** Long-axis / short-axis ratio of the tidal ellipsoid, minus one. */
  tidalStrain: number;
  /** Orientation of the moon's body frame about +y, wrapped to (-pi, pi]. */
  spinAngle: number;
  /** Offset between the moon's body frame and the planet direction. Flat once locked. */
  libration: number;
  /**
   * Row-major 3x3 deformation gradient mapping the moon's rest shape onto its current
   * shape. The tidal potential is quadratic in position, so the l=2 response really is
   * affine to good accuracy -- which means this one matrix, handed to a vertex shader,
   * reproduces the whole deformation of the surface exactly and for free.
   */
  deformation: Float64Array;
  /** Centre of mass of the moon. */
  moonCentre: Float64Array;
  kinetic: number;
  elastic: number;
  potential: number;
  /** Cumulative energy converted to heat by the dashpots. */
  heat: number;
  /** kinetic + elastic + potential + heat. Should be flat: the conservation check. */
  totalEnergy: number;
  /** Total angular momentum about the barycentre (y component). Should be flat. */
  angularMomentum: number;
  /** Spin part of the angular momentum budget. */
  spinAngularMomentum: number;
  /** Orbital part of the angular momentum budget. */
  orbitAngularMomentum: number;
}

const com = new Float64Array(3);
const comVel = new Float64Array(3);

/** Everything the UI and the graphs need, recomputed from the raw particle state. */
export function measure(world: World): Diagnostics {
  const { pos, vel, n, particleMass: mp, earthPos, earthVel, params } = world;
  const M = params.earthMass;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let kinetic = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    cx += pos[k];
    cy += pos[k + 1];
    cz += pos[k + 2];
    vx += vel[k];
    vy += vel[k + 1];
    vz += vel[k + 2];
    kinetic += vel[k] * vel[k] + vel[k + 1] * vel[k + 1] + vel[k + 2] * vel[k + 2];
  }
  kinetic *= 0.5 * mp;
  kinetic +=
    0.5 * M * (earthVel[0] * earthVel[0] + earthVel[1] * earthVel[1] + earthVel[2] * earthVel[2]);
  com[0] = cx / n;
  com[1] = cy / n;
  com[2] = cz / n;
  comVel[0] = vx / n;
  comVel[1] = vy / n;
  comVel[2] = vz / n;

  // --- Orbit ------------------------------------------------------------------
  const rx = com[0] - earthPos[0];
  const ry = com[1] - earthPos[1];
  const rz = com[2] - earthPos[2];
  const distance = Math.hypot(rx, ry, rz);
  const dvx = comVel[0] - earthVel[0];
  const dvy = comVel[1] - earthVel[1];
  const dvz = comVel[2] - earthVel[2];
  // |r x v| / r^2, signed by the y component since the orbit lies in the xz plane.
  const lx = ry * dvz - rz * dvy;
  const ly = rz * dvx - rx * dvz;
  const lz = rx * dvy - ry * dvx;
  const omegaOrbit = Math.hypot(lx, ly, lz) / (distance * distance) * Math.sign(ly || 1);

  // --- Spin, from the full inertia tensor in the moon's own frame ---------------
  // For a body that is actively deforming there is no rigid rotation matrix to
  // differentiate, so the honest definition of "how fast is it spinning" is the
  // angular velocity that carries its angular momentum: omega = I^-1 L.
  let ixx = 0;
  let iyy = 0;
  let izz = 0;
  let ixy = 0;
  let ixz = 0;
  let iyz = 0;
  let lsx = 0;
  let lsy = 0;
  let lsz = 0;
  // Least-squares deformation gradient F, defined by current = F * rest.
  //
  // Measuring the bulge from the absolute shape does not work: 260 randomly placed
  // particles have an intrinsic lumpiness of order 1/sqrt(N) ~ 6%, which completely
  // swamps a 2% tidal bulge. Comparing against the body's own rest shape cancels that
  // out exactly and leaves only the deformation.
  const q = world.restShape;
  const f = new Float64Array(9);

  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const x = pos[k] - com[0];
    const y = pos[k + 1] - com[1];
    const z = pos[k + 2] - com[2];
    const vxi = vel[k] - comVel[0];
    const vyi = vel[k + 1] - comVel[1];
    const vzi = vel[k + 2] - comVel[2];

    const r2 = x * x + y * y + z * z;
    ixx += r2 - x * x;
    iyy += r2 - y * y;
    izz += r2 - z * z;
    ixy -= x * y;
    ixz -= x * z;
    iyz -= y * z;

    lsx += y * vzi - z * vyi;
    lsy += z * vxi - x * vzi;
    lsz += x * vyi - y * vxi;

    const qx = q[k];
    const qy = q[k + 1];
    const qz = q[k + 2];
    f[0] += x * qx;
    f[1] += x * qy;
    f[2] += x * qz;
    f[3] += y * qx;
    f[4] += y * qy;
    f[5] += y * qz;
    f[6] += z * qx;
    f[7] += z * qy;
    f[8] += z * qz;
  }

  ixx *= mp;
  iyy *= mp;
  izz *= mp;
  ixy *= mp;
  ixz *= mp;
  iyz *= mp;
  lsx *= mp;
  lsy *= mp;
  lsz *= mp;

  const omegaSpin = solveOmegaY(ixx, iyy, izz, ixy, ixz, iyz, lsx, lsy, lsz);

  // F = (sum p x q) * (sum q x q)^-1, the least-squares deformation gradient.
  const qi = world.restMomentInv;
  const fm = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      fm[r * 3 + c] = f[r * 3] * qi[c] + f[r * 3 + 1] * qi[3 + c] + f[r * 3 + 2] * qi[6 + c];
    }
  }

  // Shape, free of rotation: the left Cauchy-Green tensor B = F F^T. Taking B rather
  // than polar-decomposing F matters -- B is positive semi-definite by construction, so
  // its principal stretches can never come out negative or degenerate, which a 2x2
  // polar decomposition does as soon as the spin axis tips even slightly off +y.
  const bxx = fm[0] * fm[0] + fm[1] * fm[1] + fm[2] * fm[2];
  const bxz = fm[0] * fm[6] + fm[1] * fm[7] + fm[2] * fm[8];
  const bzz = fm[6] * fm[6] + fm[7] * fm[7] + fm[8] * fm[8];

  const bMean = 0.5 * (bxx + bzz);
  const bRad = Math.hypot(0.5 * (bxx - bzz), bxz);
  // Eigenvalues of B are squared stretches, so the axis ratio is the square root.
  const tidalStrain = bMean > bRad ? Math.sqrt((bMean + bRad) / (bMean - bRad)) - 1 : 0;

  // Rigid rotation of the body, from the 2D polar decomposition of the in-plane block.
  // Only its angle is used, which stays well defined even when the stretch does not.
  const theta = Math.atan2(fm[6] - fm[2], fm[0] + fm[8]);

  const bulgeAngle = 0.5 * Math.atan2(2 * bxz, bxx - bzz);
  const planetAngle = Math.atan2(-rz, -rx);
  // A rotation about +y carries +x toward -z, so "ahead of the planet direction, in the
  // sense the moon is turning" means a *smaller* atan2(z, x): hence the minus sign.
  const bulgeLead = -foldToRightAngle(bulgeAngle - planetAngle);
  // Orientation of the moon's body frame, and how far it has drifted from pointing at
  // the planet. Once locked, the libration angle stops winding and merely wobbles.
  const spinAngle = -theta;
  const libration = wrapPi(spinAngle + planetAngle);

  // --- Energies ----------------------------------------------------------------
  const { springs, params: p } = world;
  let elastic = 0;
  for (let s = 0; s < springs.count; s++) {
    const i3 = springs.a[s] * 3;
    const j3 = springs.b[s] * 3;
    const dx = pos[j3] - pos[i3];
    const dy = pos[j3 + 1] - pos[i3 + 1];
    const dz = pos[j3 + 2] - pos[i3 + 2];
    const stretch = Math.hypot(dx, dy, dz) - springs.rest[s];
    elastic += stretch * stretch;
  }
  elastic *= 0.5 * p.stiffness;

  let potential = 0;
  const gMm = p.G * M * mp;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const dx = pos[k] - earthPos[0];
    const dy = pos[k + 1] - earthPos[1];
    const dz = pos[k + 2] - earthPos[2];
    potential -= gMm / Math.hypot(dx, dy, dz);
  }
  if (p.selfGravity) {
    const gmm = p.G * mp * mp;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
        const j3 = j * 3;
        const dx = pos[j3] - pos[i3];
        const dy = pos[j3 + 1] - pos[i3 + 1];
        const dz = pos[j3 + 2] - pos[i3 + 2];
        potential -= gmm / Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-3);
      }
    }
  }

  // --- Angular momentum budget --------------------------------------------------
  const moonMass = mp * n;
  const orbitAngularMomentum =
    moonMass * (com[2] * comVel[0] - com[0] * comVel[2]) +
    M * (earthPos[2] * earthVel[0] - earthPos[0] * earthVel[2]);
  const spinAngularMomentum = lsy;

  return {
    time: world.time,
    distance,
    omegaOrbit,
    omegaSpin,
    spinRatio: omegaSpin / omegaOrbit,
    bulgeLead,
    tidalStrain,
    spinAngle,
    libration,
    deformation: fm,
    moonCentre: com,
    kinetic,
    elastic,
    potential,
    heat: world.heat,
    totalEnergy: kinetic + elastic + potential + world.heat,
    angularMomentum: orbitAngularMomentum + spinAngularMomentum,
    spinAngularMomentum,
    orbitAngularMomentum,
  };
}

/** y component of I^-1 L for a symmetric 3x3 inertia tensor, via Cramer's rule. */
function solveOmegaY(
  ixx: number,
  iyy: number,
  izz: number,
  ixy: number,
  ixz: number,
  iyz: number,
  lx: number,
  ly: number,
  lz: number,
): number {
  const det =
    ixx * (iyy * izz - iyz * iyz) - ixy * (ixy * izz - iyz * ixz) + ixz * (ixy * iyz - iyy * ixz);
  if (Math.abs(det) < 1e-30) return 0;
  const detY =
    ixx * (ly * izz - lz * iyz) - lx * (ixy * izz - iyz * ixz) + ixz * (ixy * lz - ly * ixz);
  return detY / det;
}

/** Wrap an angle into (-pi, pi]. */
function wrapPi(a: number): number {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
}

/** Fold an angle into (-pi/2, pi/2]: a bulge axis has no head or tail. */
function foldToRightAngle(a: number): number {
  let x = a % Math.PI;
  if (x > Math.PI / 2) x -= Math.PI;
  if (x <= -Math.PI / 2) x += Math.PI;
  return x;
}
