/**
 * The one element stiffness matrix.
 *
 * Every element in the model is the same box, so this 24×24 matrix is built once and
 * shared by all of them. Trilinear hex, 2×2×2 Gauss, isotropic elasticity, exact for a
 * rectangular element — no reduced integration, so no hourglass control to get wrong.
 *
 * Node l carries the sign bits (a,b,c) = ((l>>2)&1, (l>>1)&1, l&1), so its natural
 * coordinates are ξ_l = 2a−1, η_l = 2b−1, ζ_l = 2c−1. `mesh.ts` writes element
 * connectivity in exactly that order.
 */

import type { F32 } from '../model/types.ts';

export const XI = [-1, -1, -1, -1, 1, 1, 1, 1];
export const ETA = [-1, -1, 1, 1, -1, -1, 1, 1];
export const ZETA = [-1, 1, -1, 1, -1, 1, -1, 1];

/** Build the 24×24 stiffness matrix of a box element, row-major. */
export function boxStiffness(
  dx: number,
  dy: number,
  dz: number,
  E: number,
  nu: number,
): F32 {
  const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = E / (2 * (1 + nu));
  const K = new Float64Array(24 * 24);
  const g = 1 / Math.sqrt(3);
  const gp = [-g, g];
  const detJ = (dx * dy * dz) / 8;
  const B = new Float64Array(6 * 24);

  for (const xi of gp) {
    for (const eta of gp) {
      for (const zeta of gp) {
        B.fill(0);
        for (let l = 0; l < 8; l++) {
          // dN/dξ etc., then mapped to physical derivatives by 2/edge length.
          const nx = ((XI[l] * (1 + ETA[l] * eta) * (1 + ZETA[l] * zeta)) / 8) * (2 / dx);
          const ny = ((ETA[l] * (1 + XI[l] * xi) * (1 + ZETA[l] * zeta)) / 8) * (2 / dy);
          const nz = ((ZETA[l] * (1 + XI[l] * xi) * (1 + ETA[l] * eta)) / 8) * (2 / dz);
          const c = l * 3;
          B[0 * 24 + c] = nx;
          B[1 * 24 + c + 1] = ny;
          B[2 * 24 + c + 2] = nz;
          B[3 * 24 + c] = ny;
          B[3 * 24 + c + 1] = nx;
          B[4 * 24 + c + 1] = nz;
          B[4 * 24 + c + 2] = ny;
          B[5 * 24 + c] = nz;
          B[5 * 24 + c + 2] = nx;
        }
        // CB = C · B, with C the isotropic 6×6 (engineering shear strains).
        const CB = new Float64Array(6 * 24);
        for (let j = 0; j < 24; j++) {
          const e0 = B[0 * 24 + j];
          const e1 = B[1 * 24 + j];
          const e2 = B[2 * 24 + j];
          const tr = lam * (e0 + e1 + e2);
          CB[0 * 24 + j] = tr + 2 * mu * e0;
          CB[1 * 24 + j] = tr + 2 * mu * e1;
          CB[2 * 24 + j] = tr + 2 * mu * e2;
          CB[3 * 24 + j] = mu * B[3 * 24 + j];
          CB[4 * 24 + j] = mu * B[4 * 24 + j];
          CB[5 * 24 + j] = mu * B[5 * 24 + j];
        }
        for (let i = 0; i < 24; i++) {
          for (let j = i; j < 24; j++) {
            let s = 0;
            for (let r = 0; r < 6; r++) s += B[r * 24 + i] * CB[r * 24 + j];
            const v = s * detJ;
            K[i * 24 + j] += v;
            if (i !== j) K[j * 24 + i] += v;
          }
        }
      }
    }
  }
  return Float32Array.from(K);
}

/** Shape function gradients at the element centre, used for the deformation gradient. */
export function centreGradients(dx: number, dy: number, dz: number): F32 {
  const g = new Float32Array(24);
  for (let l = 0; l < 8; l++) {
    g[l * 3] = XI[l] / (4 * dx);
    g[l * 3 + 1] = ETA[l] / (4 * dy);
    g[l * 3 + 2] = ZETA[l] / (4 * dz);
  }
  return g;
}

/**
 * Highest natural frequency of one element on its lumped mass, by power iteration.
 *
 * The critical time step of an explicit scheme is 2/ω_max, and for a hex the textbook
 * L/c_d estimate is only approximate. Measuring it is twenty lines and removes a whole
 * class of "why did it explode at this aspect ratio" bug.
 */
export function maxElementFrequency(K: Float32Array, nodeMass: number): number {
  let v = new Float64Array(24);
  for (let i = 0; i < 24; i++) v[i] = Math.sin(i * 1.7) + 0.3;
  let lambda = 0;
  for (let it = 0; it < 200; it++) {
    const w = new Float64Array(24);
    for (let i = 0; i < 24; i++) {
      let s = 0;
      for (let j = 0; j < 24; j++) s += K[i * 24 + j] * v[j];
      w[i] = s / nodeMass;
    }
    let n = 0;
    for (let i = 0; i < 24; i++) n += w[i] * w[i];
    n = Math.sqrt(n);
    if (n < 1e-30) break;
    for (let i = 0; i < 24; i++) w[i] /= n;
    lambda = n;
    v = w;
  }
  return Math.sqrt(lambda);
}
