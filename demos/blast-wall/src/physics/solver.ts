/**
 * The reference solver: explicit central difference, corotational hex elements, and a
 * cohesive-frictional law on every joint node pair.
 *
 * This runs on the CPU and is not the one that draws the demo — the WGSL kernels in
 * `src/gpu/shaders` are a line-for-line port of the maths below. It exists because the
 * self-tests need something they can run in plain Node, and because when a shader
 * disagrees with it, the shader is wrong. Keep the two in step.
 */

import type { Mesh } from '../model/mesh.ts';
import type { Materials } from './materials.ts';
import { dynamicIncrease } from './materials.ts';
import { boxStiffness, centreGradients, maxElementFrequency } from './element.ts';
import { friedlander, type Charge } from './blast.ts';
import { buildNodeLoads } from './load.ts';

export interface WorldOptions {
  gravity: number;
  /**
   * Ground contact frequency, rad/s. Expressing the penalty as a frequency rather than
   * a stiffness makes every node's contact spring cost the same critical time step
   * regardless of its mass, so adding a floor cannot silently destabilise the solver.
   */
  groundOmega: number;
  groundFriction: number;
  /** Multiplier on the CFL-critical time step. */
  safety: number;
}

export function defaultWorld(): WorldOptions {
  return { gravity: 9.81, groundOmega: 2e4, groundFriction: 0.6, safety: 0.7 };
}

export class Solver {
  readonly mesh: Mesh;
  materials: Materials;
  world: WorldOptions;
  charge: Charge;

  readonly x: Float32Array;
  readonly v: Float32Array;
  readonly f: Float32Array;
  /** Element rotation quaternions, warm-started between steps. */
  readonly q: Float32Array;
  /** Peak historical joint opening, m — the mode I damage driver. */
  readonly kappa: Float32Array;
  /** Accumulated plastic slip per pair, 3 components. */
  readonly slip: Float32Array;
  /** Permanent closure from crushing, m (≤ 0). */
  readonly crush: Float32Array;
  /** Per-node scalars the renderer reads: 0 = joint damage, 1 = speed. */
  readonly damage: Float32Array;

  /** Nodal force at peak pressure, 3 per node. */
  loadDir: Float32Array;
  /** Arrival, duration, decay — 3 per node. */
  loadPulse: Float32Array;

  readonly K: Float32Array;
  readonly grad: Float32Array;
  readonly nodeMass: number;
  dt: number;
  time = 0;

  constructor(mesh: Mesh, materials: Materials, charge: Charge, world = defaultWorld()) {
    this.mesh = mesh;
    this.materials = materials;
    this.world = world;
    this.charge = charge;

    const n = mesh.nodeCount;
    this.x = Float32Array.from(mesh.x0);
    this.v = new Float32Array(n * 3);
    this.f = new Float32Array(n * 3);
    this.q = new Float32Array(mesh.elementCount * 4);
    for (let e = 0; e < mesh.elementCount; e++) this.q[e * 4 + 3] = 1;
    this.kappa = new Float32Array(mesh.pairCount);
    this.slip = new Float32Array(mesh.pairCount * 3);
    this.crush = new Float32Array(mesh.pairCount);
    this.damage = new Float32Array(n);

    this.K = boxStiffness(mesh.dx, mesh.dy, mesh.dz, materials.E, materials.nu);
    this.grad = centreGradients(mesh.dx, mesh.dy, mesh.dz);
    this.nodeMass = (materials.density * mesh.dx * mesh.dy * mesh.dz) / 8;

    this.loadDir = new Float32Array(mesh.nodeCount * 3);
    this.loadPulse = new Float32Array(mesh.nodeCount * 3);
    this.updateLoad();
    this.dt = this.criticalStep() * world.safety;
  }

  /**
   * Critical time step, from the element and from the joint springs.
   *
   * Which of the two governs depends on the mesh and the joint stiffness, and it is not
   * always the element — a stiff joint on a fine mesh flips it. Measuring both and
   * taking the smaller costs microseconds at setup and removes the guesswork.
   */
  criticalStep(): number {
    const wElem = maxElementFrequency(this.K, this.nodeMass);
    const m = this.mesh;
    let kMax = 0;
    for (let p = 0; p < m.pairCount; p++) {
      kMax = Math.max(kMax, Math.max(this.materials.kn, this.materials.ks) * m.pairArea[p]);
    }
    // Two lumped masses on one spring: ω = √(k (1/m₁ + 1/m₂)). Corner nodes carry the
    // least mass, so use the lightest node that takes part in a joint.
    let invMassMax = 0;
    for (let p = 0; p < m.pairCount * 2; p++) {
      invMassMax = Math.max(invMassMax, m.invMass[m.pairs[p]]);
    }
    const wJoint = Math.sqrt(kMax * 2 * invMassMax);
    const w = Math.max(wElem, wJoint, this.world.groundOmega, 1e-6);
    return 2 / w;
  }

  /** Recompute the blast pulse. Call after the charge or the geometry changes. */
  updateLoad(): void {
    const load = buildNodeLoads(this.mesh, this.charge);
    this.loadDir = load.dir;
    this.loadPulse = load.pulse;
  }

  step(dt = this.dt): void {
    this.computeForces();
    this.externalForces();
    this.integrate(dt);
    this.time += dt;
  }

  /**
   * Internal forces only, with no time integration.
   *
   * The self-tests drive this directly: put the nodes where you want them, ask for the
   * forces, and read the joint's traction–separation curve straight off. A constitutive
   * law you can only observe through an integrator is a law you cannot test.
   */
  computeForces(): void {
    this.f.fill(0);
    this.elementForces();
    this.jointForces();
  }

  // --- internal forces ----------------------------------------------------------

  private elementForces(): void {
    const m = this.mesh;
    const X = m.x0;
    const x = this.x;
    const g = this.grad;
    const K = this.K;
    const px = new Float64Array(24);
    const u = new Float64Array(24);
    const F = new Float64Array(9);
    const R = new Float64Array(9);

    for (let e = 0; e < m.elementCount; e++) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let Cx = 0;
      let Cy = 0;
      let Cz = 0;
      for (let l = 0; l < 8; l++) {
        const n = m.elements[e * 8 + l];
        cx += x[n * 3];
        cy += x[n * 3 + 1];
        cz += x[n * 3 + 2];
        Cx += X[n * 3];
        Cy += X[n * 3 + 1];
        Cz += X[n * 3 + 2];
      }
      cx /= 8;
      cy /= 8;
      cz /= 8;
      Cx /= 8;
      Cy /= 8;
      Cz /= 8;

      F.fill(0);
      for (let l = 0; l < 8; l++) {
        const n = m.elements[e * 8 + l];
        const ax = x[n * 3] - cx;
        const ay = x[n * 3 + 1] - cy;
        const az = x[n * 3 + 2] - cz;
        px[l * 3] = ax;
        px[l * 3 + 1] = ay;
        px[l * 3 + 2] = az;
        for (let c = 0; c < 3; c++) {
          const gc = g[l * 3 + c];
          F[c * 3] += ax * gc;
          F[c * 3 + 1] += ay * gc;
          F[c * 3 + 2] += az * gc;
        }
      }

      extractRotation(F, this.q, e, R);

      for (let l = 0; l < 8; l++) {
        const n = m.elements[e * 8 + l];
        const ax = px[l * 3];
        const ay = px[l * 3 + 1];
        const az = px[l * 3 + 2];
        // Rᵀ p, so the strain is measured in the element's own rotated frame.
        u[l * 3] = R[0] * ax + R[1] * ay + R[2] * az - (X[n * 3] - Cx);
        u[l * 3 + 1] = R[3] * ax + R[4] * ay + R[5] * az - (X[n * 3 + 1] - Cy);
        u[l * 3 + 2] = R[6] * ax + R[7] * ay + R[8] * az - (X[n * 3 + 2] - Cz);
      }

      for (let l = 0; l < 8; l++) {
        let f0 = 0;
        let f1 = 0;
        let f2 = 0;
        for (let j = 0; j < 24; j++) {
          const uj = u[j];
          f0 += K[(l * 3) * 24 + j] * uj;
          f1 += K[(l * 3 + 1) * 24 + j] * uj;
          f2 += K[(l * 3 + 2) * 24 + j] * uj;
        }
        const n = m.elements[e * 8 + l];
        // f = −R K uᵣ, rotated back to the world frame.
        this.f[n * 3] -= R[0] * f0 + R[3] * f1 + R[6] * f2;
        this.f[n * 3 + 1] -= R[1] * f0 + R[4] * f1 + R[7] * f2;
        this.f[n * 3 + 2] -= R[2] * f0 + R[5] * f1 + R[8] * f2;
      }
    }
  }

  // --- joints -------------------------------------------------------------------

  private jointForces(): void {
    const m = this.mesh;
    const mat = this.materials;
    const jointThickness = Math.max(m.spec.joint, 1e-4);
    const delta0 = mat.ft / mat.kn;

    this.damage.fill(0);

    for (let p = 0; p < m.pairCount; p++) {
      const a = m.pairs[p * 2];
      const b = m.pairs[p * 2 + 1];
      const axis = m.pairAxis[p];
      const area = m.pairArea[p];

      const dx = this.x[b * 3] - this.x[a * 3];
      const dy = this.x[b * 3 + 1] - this.x[a * 3 + 1];
      const dz = this.x[b * 3 + 2] - this.x[a * 3 + 2];
      const d = [dx, dy, dz];
      // Measured from the crushed state, so a joint that has already been squashed does
      // not spring back to its original thickness.
      const dn = d[axis] - this.crush[p];
      const vn = this.v[b * 3 + axis] - this.v[a * 3 + axis];

      // Rate hardening, gauged over the real mortar thickness rather than the
      // zero-thickness idealisation — the joint is 12 mm of mortar, not a surface.
      const dif = dynamicIncrease(Math.abs(vn) / jointThickness, mat.dif);
      const ft = mat.ft * dif;
      const coh = mat.cohesion * dif;

      if (dn > this.kappa[p]) this.kappa[p] = dn;
      const deltaF = Math.max((2 * mat.gf) / Math.max(ft, 1), 1.01 * delta0);

      // Bilinear cohesive law: elastic up to ft at δ₀, then a straight line down to zero
      // at δf = 2Gf/ft, so the area under the curve is exactly the fracture energy. The
      // damage variable is the drop in secant stiffness, which is what makes unloading
      // return to the origin instead of retracing the envelope.
      const k = Math.max(this.kappa[p], delta0);
      const envelope =
        k <= delta0 ? mat.kn * k : Math.max(0, (ft * (deltaF - k)) / (deltaF - delta0));
      const kSecant = envelope / k;
      const dmg = Math.min(1, Math.max(0, 1 - kSecant / mat.kn));

      // Normal: damaged in tension, undamaged in compression — a cracked joint still
      // has to bear, or the wall falls through itself — but capped at fc, where the
      // mortar crushes and takes a permanent set.
      // ponytail: perfectly plastic cap, no hardening and no cap softening. Give it a
      // curve if a case ever hinges on post-crushing behaviour.
      let sigma: number;
      if (dn > 0) {
        sigma = kSecant * dn;
      } else {
        sigma = mat.kn * dn;
        if (sigma < -mat.fc) {
          this.crush[p] += dn + mat.fc / mat.kn;
          sigma = -mat.fc;
        }
      }

      // Tangential: Coulomb, with the cohesion carried away by the same damage.
      // ponytail: one scalar couples mode I and mode II. Give mode II its own fracture
      // energy if a case ever turns on the difference.
      let t0 = 0;
      let t1 = 0;
      let t2 = 0;
      const s0 = dx - (axis === 0 ? dn : 0) - this.slip[p * 3];
      const s1 = dy - (axis === 1 ? dn : 0) - this.slip[p * 3 + 1];
      const s2 = dz - (axis === 2 ? dn : 0) - this.slip[p * 3 + 2];
      t0 = mat.ks * s0;
      t1 = mat.ks * s1;
      t2 = mat.ks * s2;
      const tMag = Math.hypot(t0, t1, t2);
      const tMax = coh * (1 - dmg) + Math.max(0, -sigma) * mat.tanPhi;
      if (tMag > tMax && tMag > 0) {
        const k = tMax / tMag;
        // Whatever the elastic spring could not hold becomes slip.
        this.slip[p * 3] += s0 * (1 - k);
        this.slip[p * 3 + 1] += s1 * (1 - k);
        this.slip[p * 3 + 2] += s2 * (1 - k);
        t0 *= k;
        t1 *= k;
        t2 *= k;
      }

      const fx = (t0 + (axis === 0 ? sigma : 0)) * area;
      const fy = (t1 + (axis === 1 ? sigma : 0)) * area;
      const fz = (t2 + (axis === 2 ? sigma : 0)) * area;
      this.f[a * 3] += fx;
      this.f[a * 3 + 1] += fy;
      this.f[a * 3 + 2] += fz;
      this.f[b * 3] -= fx;
      this.f[b * 3 + 1] -= fy;
      this.f[b * 3 + 2] -= fz;

      if (dmg > this.damage[a]) this.damage[a] = dmg;
      if (dmg > this.damage[b]) this.damage[b] = dmg;
    }
  }

  // --- external -----------------------------------------------------------------

  private externalForces(): void {
    for (let n = 0; n < this.mesh.nodeCount; n++) {
      const td = this.loadPulse[n * 3 + 1];
      const s = friedlander((this.time - this.loadPulse[n * 3]) / Math.max(td, 1e-9), this.loadPulse[n * 3 + 2]);
      if (s === 0) continue;
      this.f[n * 3] += this.loadDir[n * 3] * s;
      this.f[n * 3 + 1] += this.loadDir[n * 3 + 1] * s;
      this.f[n * 3 + 2] += this.loadDir[n * 3 + 2] * s;
    }
  }

  private integrate(dt: number): void {
    const m = this.mesh;
    const g = this.world.gravity;
    const damp = this.materials.damping;
    const og = this.world.groundOmega;
    const mu = this.world.groundFriction;

    for (let n = 0; n < m.nodeCount; n++) {
      const inv = m.invMass[n];
      if (inv === 0) {
        this.v[n * 3] = 0;
        this.v[n * 3 + 1] = 0;
        this.v[n * 3 + 2] = 0;
        continue;
      }
      const mass = 1 / inv;
      let fx = this.f[n * 3];
      let fy = this.f[n * 3 + 1] - mass * g;
      let fz = this.f[n * 3 + 2];

      fx -= damp * mass * this.v[n * 3];
      fy -= damp * mass * this.v[n * 3 + 1];
      fz -= damp * mass * this.v[n * 3 + 2];

      const y = this.x[n * 3 + 1];
      if (y < 0) {
        const pen = -y;
        // Damped on the way in, so debris lands instead of trampolining off the floor.
        const vy = this.v[n * 3 + 1];
        const nrm = mass * og * (og * pen - (vy < 0 ? 1.4 * vy : 0));
        fy += nrm;
        const vx = this.v[n * 3];
        const vz = this.v[n * 3 + 2];
        const vt = Math.hypot(vx, vz);
        if (vt > 1e-6) {
          const fric = Math.min(mu * nrm, (mass * vt) / Math.max(dt, 1e-9));
          fx -= (vx / vt) * fric;
          fz -= (vz / vt) * fric;
        }
      }

      this.v[n * 3] += fx * inv * dt;
      this.v[n * 3 + 1] += fy * inv * dt;
      this.v[n * 3 + 2] += fz * inv * dt;
      this.x[n * 3] += this.v[n * 3] * dt;
      this.x[n * 3 + 1] += this.v[n * 3 + 1] * dt;
      this.x[n * 3 + 2] += this.v[n * 3 + 2] * dt;
    }
  }

  /** Total kinetic + elastic energy, for the conservation test. */
  kineticEnergy(): number {
    let e = 0;
    for (let n = 0; n < this.mesh.nodeCount; n++) {
      const inv = this.mesh.invMass[n];
      if (inv === 0) continue;
      const s =
        this.v[n * 3] ** 2 + this.v[n * 3 + 1] ** 2 + this.v[n * 3 + 2] ** 2;
      e += 0.5 * s / inv;
    }
    return e;
  }
}

/**
 * Müller's iterative polar decomposition: pull the rotation out of a deformation
 * gradient by nudging a quaternion until its axes line up with the columns of F.
 *
 * Warm-started from the previous step's rotation, so in practice it converges in one or
 * two iterations — which is the reason it is worth doing this way rather than with a
 * full SVD, on the CPU and on the GPU alike.
 */
export function extractRotation(
  F: Float64Array,
  quats: Float32Array,
  e: number,
  outR: Float64Array,
  iterations = 12,
): void {
  let qx = quats[e * 4];
  let qy = quats[e * 4 + 1];
  let qz = quats[e * 4 + 2];
  let qw = quats[e * 4 + 3];

  for (let it = 0; it < iterations; it++) {
    quatToMat3(qx, qy, qz, qw, outR);
    let ox = 0;
    let oy = 0;
    let oz = 0;
    let den = 1e-9;
    for (let c = 0; c < 3; c++) {
      const r0 = outR[c * 3];
      const r1 = outR[c * 3 + 1];
      const r2 = outR[c * 3 + 2];
      const a0 = F[c * 3];
      const a1 = F[c * 3 + 1];
      const a2 = F[c * 3 + 2];
      ox += r1 * a2 - r2 * a1;
      oy += r2 * a0 - r0 * a2;
      oz += r0 * a1 - r1 * a0;
      den += r0 * a0 + r1 * a1 + r2 * a2;
    }
    const inv = 1 / Math.abs(den);
    ox *= inv;
    oy *= inv;
    oz *= inv;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-9) break;
    const half = w * 0.5;
    const s = Math.sin(half) / w;
    const dw = Math.cos(half);
    const dx = ox * s;
    const dy = oy * s;
    const dz = oz * s;
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy - dx * qz + dy * qw + dz * qx;
    const nz = dw * qz + dx * qy - dy * qx + dz * qw;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const len = Math.max(Math.hypot(nx, ny, nz, nw), 1e-20);
    qx = nx / len;
    qy = ny / len;
    qz = nz / len;
    qw = nw / len;
  }

  quats[e * 4] = qx;
  quats[e * 4 + 1] = qy;
  quats[e * 4 + 2] = qz;
  quats[e * 4 + 3] = qw;
  quatToMat3(qx, qy, qz, qw, outR);
}

/** Column-major: outR[c*3+r] is row r, column c. */
export function quatToMat3(
  x: number,
  y: number,
  z: number,
  w: number,
  out: Float64Array,
): void {
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = xy - wz;
  out[4] = 1 - (xx + zz);
  out[5] = yz + wx;
  out[6] = xz + wy;
  out[7] = yz - wx;
  out[8] = 1 - (xx + yy);
}
