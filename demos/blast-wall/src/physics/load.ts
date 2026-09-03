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

  for (let q = 0; q < mesh.quadCount; q++) {
    const c = centre(mesh, q, X);
    const nr = normal(mesh, q, X);
    const p = pulseFor(charge, c[0], c[1], c[2], nr[0], nr[1], nr[2], table);
    if (p.peak <= 0) continue;
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
