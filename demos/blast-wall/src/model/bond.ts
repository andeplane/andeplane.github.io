/**
 * Parametric bond generator: WallSpec → a list of expanded units on a global lattice.
 *
 * "Expanded unit" is the simplified micro-modelling trick: each brick is grown by half
 * a fuge on every side that faces a joint, so the units tile the wall with no gaps and
 * every mortar joint collapses to a surface of zero thickness. The wall's real outer
 * faces are not expanded, so total dimensions stay honest.
 *
 * Everything lands on one global lattice with spacing (dx, dy, dz). That is the single
 * decision that makes the rest of the code easy: because a half-brick offset is a whole
 * number of lattice steps, the two sides of every bed joint match node for node, so the
 * mesher never needs a contact search — a joint is just a list of node pairs.
 */

import type { WallSpec } from './types.ts';

export interface Unit {
  /** Stable id across re-generation, "course:latticeX:wythe". */
  key: string;
  course: number;
  wythe: number;
  /** Inclusive-exclusive lattice extents. */
  ix0: number;
  ix1: number;
  iy0: number;
  iy1: number;
  iz0: number;
  iz1: number;
  pinned: boolean;
}

export interface Lattice {
  dx: number;
  dy: number;
  dz: number;
  /** Lattice extents of the whole wall. */
  nx: number;
  ny: number;
  nz: number;
  /** Expanded unit size in lattice steps. */
  ux: number;
  uy: number;
  uz: number;
  length: number;
  height: number;
  thickness: number;
}

/** Deterministic 32-bit hash → [0,1). Same wall from the same seed, every time. */
function rand(seed: number, i: number): number {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function latticeFor(spec: WallSpec): Lattice {
  const { nx, ny, nz } = spec.divisions;
  // Expanded unit: brick + one joint in length and height, and half a collar joint per
  // wythe in thickness (a single-wythe wall has no collar joint, so no expansion).
  const ux = spec.brick.length + spec.joint;
  const uy = spec.brick.height + spec.joint;
  const uz = spec.brick.thickness + (spec.wythes > 1 ? spec.joint / 2 : 0);

  const cols = Math.max(1, Math.round(spec.length / ux));
  const courses = Math.max(1, Math.round(spec.height / uy));

  return {
    dx: ux / nx,
    dy: uy / ny,
    dz: uz / nz,
    nx: cols * nx,
    ny: courses * ny,
    nz: spec.wythes * nz,
    ux: nx,
    uy: ny,
    uz: nz,
    length: cols * ux,
    height: courses * uy,
    thickness: spec.wythes * uz,
  };
}

/** Offset of a course's left edge, in lattice steps, for each bond pattern. */
function courseOffset(spec: WallSpec, lat: Lattice, course: number): number {
  const n = lat.ux;
  switch (spec.bond) {
    case 'stack':
      return 0;
    case 'third':
      return Math.round(((course % 3) / 3) * n) % n;
    case 'wild':
      return Math.round(rand(spec.seed, course) * n) % n;
    case 'running':
    default:
      return Math.round((course % 2) * 0.5 * n) % n;
  }
}

export function generateUnits(spec: WallSpec): { units: Unit[]; lattice: Lattice } {
  const lat = latticeFor(spec);
  const removed = new Set(spec.removed);
  const pinned = new Set(spec.pinned);
  const units: Unit[] = [];
  const courses = lat.ny / lat.uy;

  for (let c = 0; c < courses; c++) {
    const off = courseOffset(spec, lat, c);
    const iy0 = c * lat.uy;
    for (let wy = 0; wy < spec.wythes; wy++) {
      // Walk from the (possibly negative) course start so the first unit at an offset
      // course is a real half brick — a "kopp" — rather than a gap.
      for (let ix = -off; ix < lat.nx; ix += lat.ux) {
        const ix0 = Math.max(0, ix);
        const ix1 = Math.min(lat.nx, ix + lat.ux);
        if (ix1 - ix0 < 1) continue;
        const key = `${c}:${ix0}:${wy}`;
        if (removed.has(key)) continue;
        if (insideOpening(spec, lat, ix0, ix1, iy0, iy0 + lat.uy)) continue;
        units.push({
          key,
          course: c,
          wythe: wy,
          ix0,
          ix1,
          iy0,
          iy1: iy0 + lat.uy,
          iz0: wy * lat.uz,
          iz1: (wy + 1) * lat.uz,
          pinned: pinned.has(key),
        });
      }
    }
  }
  return { units, lattice: lat };
}

/** A unit is cut away by an opening when its centre falls inside one. */
function insideOpening(
  spec: WallSpec,
  lat: Lattice,
  ix0: number,
  ix1: number,
  iy0: number,
  iy1: number,
): boolean {
  const cx = ((ix0 + ix1) / 2) * lat.dx;
  const cy = ((iy0 + iy1) / 2) * lat.dy;
  return spec.openings.some((o) => cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h);
}
