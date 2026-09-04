/**
 * The blast load, resolved onto nodes once and then read every step.
 *
 * The pressure is defined on faces, but the solver integrates nodes, so the face pulses
 * are summed onto their corner nodes at setup. A node on an edge belongs to faces
 * pointing different ways and reached at slightly different times; its direction vector
 * is the true sum of those faces, and its arrival time is their pressure-weighted mean —
 * the spread across one element is microseconds, far below anything the wall can feel.
 *
 * Both solvers read this, so the CPU reference and the WGSL kernels are loaded by
 * exactly the same numbers rather than by two implementations that ought to agree.
 */

import type { Mesh } from '../model/mesh.ts';
import type { F32 } from '../model/types.ts';
import { ArrivalTable, pulseFor, type Charge } from './blast.ts';

export interface NodeLoad {
  /** Force per unit of the Friedlander shape, 3 per node: newtons at peak pressure. */
  dir: F32;
  /** Arrival s, duration s, decay b — 3 per node. */
  pulse: F32;
}

export function buildNodeLoads(mesh: Mesh, charge: Charge): NodeLoad {
  const n = mesh.nodeCount;
  const dir = new Float32Array(n * 3);
  const pulse = new Float32Array(n * 3);
  if (charge.mass <= 0) return { dir, pulse };

  const weight = new Float32Array(n);
  const X = mesh.x0;

  let rMax = 1;
  for (let q = 0; q < mesh.quadCount; q++) {
    const c = centre(mesh, q, X);
    rMax = Math.max(rMax, Math.hypot(c[0] - charge.x, c[1] - charge.y, c[2] - charge.z));
  }
  const table = new ArrivalTable(charge.mass, rMax * 1.2);

  const occ = buildOccupancy(mesh);

  for (let q = 0; q < mesh.quadCount; q++) {
    const c = centre(mesh, q, X);
    const nr = normal(mesh, q, X);
    const p = pulseFor(charge, c[0], c[1], c[2], nr[0], nr[1], nr[2], table);
    if (p.peak <= 0) continue;
    // A face that cannot see the charge does not get loaded. Without this the pressure
    // goes straight through the façade and lands on the inside of the back wall — which
    // it did, at 30 % of the façade's own load, pushing the room apart from within.
    if (shadowed(occ, mesh, charge, c, nr)) continue;
    // The pressure pushes into the surface, so the load is along −n.
    const fx = -nr[0] * (nr[3] / 4) * p.peak;
    const fy = -nr[1] * (nr[3] / 4) * p.peak;
    const fz = -nr[2] * (nr[3] / 4) * p.peak;
    for (let i = 0; i < 4; i++) {
      const node = mesh.quads[q * 4 + i];
      dir[node * 3] += fx;
      dir[node * 3 + 1] += fy;
      dir[node * 3 + 2] += fz;
      pulse[node * 3] += p.arrival * p.peak;
      pulse[node * 3 + 1] += p.duration * p.peak;
      pulse[node * 3 + 2] += p.b * p.peak;
      weight[node] += p.peak;
    }
  }

  for (let i = 0; i < n; i++) {
    if (weight[i] <= 0) {
      pulse[i * 3 + 1] = 1; // a duration of zero would divide by zero downstream
      continue;
    }
    pulse[i * 3] /= weight[i];
    pulse[i * 3 + 1] /= weight[i];
    pulse[i * 3 + 2] /= weight[i];
  }
  return { dir, pulse };
}

/**
 * Which lattice cells are solid.
 *
 * Units are boxes on the lattice, so occupancy is exact rather than a bounding-volume
 * approximation, and building it costs one pass over the cells the bricks actually fill.
 */
function buildOccupancy(mesh: Mesh): Uint8Array {
  const { nx, ny, nz } = mesh.lattice;
  const occ = new Uint8Array(nx * ny * nz);
  for (const u of mesh.units) {
    for (let i = u.ix0; i < u.ix1; i++) {
      for (let j = u.iy0; j < u.iy1; j++) {
        for (let k = u.iz0; k < u.iz1; k++) occ[(i * ny + j) * nz + k] = 1;
      }
    }
  }
  return occ;
}

/**
 * Is the straight line from this face to the charge blocked by masonry?
 *
 * A 3D DDA over the same lattice the bricks are laid on: step cell to cell along the ray
 * and stop at the first solid one. Exact for axis-aligned boxes, and it costs a few dozen
 * steps per face — only for faces that passed the incidence test, so most of the model is
 * never marched at all.
 *
 * This is line-of-sight only. Real blast diffracts around edges and wraps into shadowed
 * regions at reduced pressure; treating shadow as zero understates that, which is the
 * same simplification as ignoring clearing.
 */
function shadowed(
  occ: Uint8Array,
  mesh: Mesh,
  charge: Charge,
  c: [number, number, number],
  nr: [number, number, number, number],
): boolean {
  const lat = mesh.lattice;
  const cell = [lat.dx, lat.dy, lat.dz];
  const dim = [lat.nx, lat.ny, lat.nz];

  // Start one cell outside the face, so its own brick does not count as a blocker.
  const axis = Math.abs(nr[0]) > 0.5 ? 0 : Math.abs(nr[1]) > 0.5 ? 1 : 2;
  const o = [c[0], c[1], c[2]];
  o[axis] += nr[axis] * cell[axis] * 0.51;

  const d = [charge.x - o[0], charge.y - o[1], charge.z - o[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-9) return false;
  for (let a = 0; a < 3; a++) d[a] /= len;

  const idx = [0, 0, 0];
  const step = [0, 0, 0];
  const tMax = [0, 0, 0];
  const tDelta = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    idx[a] = Math.floor(o[a] / cell[a]);
    if (d[a] > 1e-12) {
      step[a] = 1;
      tMax[a] = ((idx[a] + 1) * cell[a] - o[a]) / d[a];
      tDelta[a] = cell[a] / d[a];
    } else if (d[a] < -1e-12) {
      step[a] = -1;
      tMax[a] = (idx[a] * cell[a] - o[a]) / d[a];
      tDelta[a] = -cell[a] / d[a];
    } else {
      tMax[a] = Infinity;
      tDelta[a] = Infinity;
    }
  }

  for (let guard = 0; guard < 8192; guard++) {
    if (
      idx[0] >= 0 && idx[0] < dim[0] &&
      idx[1] >= 0 && idx[1] < dim[1] &&
      idx[2] >= 0 && idx[2] < dim[2] &&
      occ[(idx[0] * dim[1] + idx[1]) * dim[2] + idx[2]]
    ) {
      return true;
    }
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    if (tMax[a] >= len) return false;
    idx[a] += step[a];
    tMax[a] += tDelta[a];
    // Each axis is monotone along the ray, so once it leaves the grid it cannot return.
    if ((step[a] > 0 && idx[a] >= dim[a]) || (step[a] < 0 && idx[a] < 0)) return false;
  }
  return false;
}

function centre(mesh: Mesh, q: number, X: F32): [number, number, number] {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < 4; i++) {
    const n = mesh.quads[q * 4 + i];
    cx += X[n * 3];
    cy += X[n * 3 + 1];
    cz += X[n * 3 + 2];
  }
  return [cx / 4, cy / 4, cz / 4];
}

/** Outward unit normal and area of a reference quad. */
function normal(mesh: Mesh, q: number, X: F32): [number, number, number, number] {
  const g = (i: number, c: number) => X[mesh.quads[q * 4 + i] * 3 + c];
  const ax = g(1, 0) - g(0, 0);
  const ay = g(1, 1) - g(0, 1);
  const az = g(1, 2) - g(0, 2);
  const bx = g(3, 0) - g(0, 0);
  const by = g(3, 1) - g(0, 1);
  const bz = g(3, 2) - g(0, 2);
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.max(Math.hypot(nx, ny, nz), 1e-20);
  return [nx / len, ny / len, nz / len, len];
}
