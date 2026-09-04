/**
 * Parametric bond generator: WallSpec → a list of expanded units on a global lattice.
 *
 * "Expanded unit" is the simplified micro-modelling trick: each brick is grown by half
 * a fuge on every side that faces a joint, so the units tile the wall with no gaps and
 * every mortar joint collapses to a surface of zero thickness.
 *
 * Everything lands on one global lattice. That is the single decision that makes the
 * rest of the code easy: because a half-brick offset is a whole number of lattice steps,
 * the two sides of every bed joint match node for node, so the mesher never needs a
 * contact search — a joint is just a list of node pairs.
 *
 * The lattice is deliberately SQUARE in plan (dx = dz), which is what lets four walls
 * bond at their corners. See `latticeFor`.
 */

import type { WallSpec } from './types.ts';

export interface Unit {
  /** Stable id across re-generation, "course:latticeX:latticeZ". */
  key: string;
  course: number;
  /** Which layer through the wall's thickness, for a multi-wythe wall. */
  wythe: number;
  /**
   * Which world axis this unit's wall is thin along: 2 for a wall running along x,
   * 0 for a return wall running along z. The renderer needs it to set the mortar back
   * from the faces that are actually exposed.
   */
  thicknessAxis: 0 | 2;
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
  /** Lattice extents of the whole model. */
  nx: number;
  ny: number;
  nz: number;
  /** Expanded unit size in lattice steps: stretcher, course, header. */
  ux: number;
  uy: number;
  uz: number;
  length: number;
  height: number;
  /** Overall depth in z: one wall's thickness, or the room's outside dimension. */
  thickness: number;
  /** Thickness of a single wall in lattice steps. */
  wall: number;
}

/** Deterministic 32-bit hash → [0,1). Same wall from the same seed, every time. */
function rand(seed: number, i: number): number {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The lattice, and the one arithmetic fact the whole corner bond rests on.
 *
 * Masonry is modular: two brick widths plus a joint make one brick length, so the
 * EXPANDED header (108 + 12 = 120) is exactly half the EXPANDED stretcher (228 + 12 =
 * 240). Divide the stretcher into nx steps and the header into nx/2, and the lattice
 * spacing comes out the same in x and in z.
 *
 * That squareness is what makes a room possible without touching the mesher. A wall
 * running along z is then just a unit elongated in z instead of x: same lattice, same
 * element box (so still exactly one stiffness matrix), and the joint where a return wall
 * meets a façade matches node for node like every other joint in the model. Let dx and
 * dz differ and the corner would need a real contact search.
 */
export function latticeFor(spec: WallSpec): Lattice {
  // An odd division count would put dz = dx/2 · (nx/⌊nx/2⌋) ≠ dx, so round to even.
  const nx = Math.max(2, Math.round(spec.divisions.nx / 2) * 2);
  const ny = Math.max(1, spec.divisions.ny);
  const nz = nx / 2;

  const ux = spec.brick.length + spec.joint;
  const uy = spec.brick.height + spec.joint;
  const uz = ux / 2;

  const cols = Math.max(1, Math.round(spec.length / ux));
  const courses = Math.max(1, Math.round(spec.height / uy));
  const wall = spec.wythes * nz;

  // A room needs enough depth for a front wall, a back wall and a gap between them.
  const rows = Math.max(2 * spec.wythes, Math.round(spec.width / ux));
  const depth = spec.plan === 'room' ? rows * nx : wall;

  return {
    dx: ux / nx,
    dy: uy / ny,
    dz: uz / nz,
    nx: cols * nx,
    ny: courses * ny,
    nz: depth,
    ux: nx,
    uy: ny,
    uz: nz,
    length: cols * ux,
    height: courses * uy,
    thickness: depth * (uz / nz),
    wall,
  };
}

/** Offset of a course's start, in lattice steps, for each bond pattern. */
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
  const ctx: Ctx = {
    spec,
    lat,
    removed: new Set(spec.removed),
    pinned: new Set(spec.pinned),
    units: [],
  };
  const courses = lat.ny / lat.uy;

  for (let c = 0; c < courses; c++) {
    const off = courseOffset(spec, lat, c);
    if (spec.plan === 'room') roomCourse(ctx, c, off);
    else layRun(ctx, c, off, 0, 0, lat.nx, 0);
  }
  return { units: ctx.units, lattice: lat };
}

interface Ctx {
  spec: WallSpec;
  lat: Lattice;
  removed: Set<string>;
  pinned: Set<string>;
  units: Unit[];
}

/**
 * One course of a four-walled room.
 *
 * The corner is the whole point. On even courses the walls running along x carry
 * straight through the corner squares and the return walls stop short of them; on odd
 * courses they swap. That is how a mason turns a corner, and it is what ties the four
 * walls into one structure instead of four things leaning on each other.
 *
 * It also does the return walls' bond for free: a wall that starts at 0 on one course
 * and half a stretcher in on the next is already in running bond, with no extra offset.
 */
function roomCourse(ctx: Ctx, course: number, off: number): void {
  const { nx: NX, nz: NZ, wall } = ctx.lat;
  const xThrough = course % 2 === 0;

  // Façade and back wall, running along x.
  const xs = xThrough ? 0 : wall;
  const xe = xThrough ? NX : NX - wall;
  layRun(ctx, course, off, 0, xs, xe, 0);
  layRun(ctx, course, off, 0, xs, xe, NZ - wall);

  // The two return walls, running along z.
  const zs = xThrough ? wall : 0;
  const ze = xThrough ? NZ - wall : NZ;
  layRun(ctx, course, off, 1, zs, ze, 0);
  layRun(ctx, course, off, 1, zs, ze, NX - wall);
}

/**
 * Lay one course of one wall: stretchers along `axis` from `runStart` to `runEnd`, with
 * the wall's thickness starting at `crossBase`.
 *
 * Stretchers come off a global grid rather than being counted from the wall's own start,
 * so clipping a course short at a corner shifts nothing — the bond pattern stays the
 * pattern, and an end brick simply comes out as the half a mason would cut.
 */
function layRun(
  ctx: Ctx,
  course: number,
  off: number,
  axis: 0 | 1,
  runStart: number,
  runEnd: number,
  crossBase: number,
): void {
  const { lat, spec } = ctx;
  const iy0 = course * lat.uy;
  if (runEnd - runStart < 1) return;

  for (let r = -off; r < runEnd; r += lat.ux) {
    const r0 = Math.max(r, runStart);
    const r1 = Math.min(r + lat.ux, runEnd);
    if (r1 - r0 < 1) continue;

    for (let w = 0; w < spec.wythes; w++) {
      const c0 = crossBase + w * lat.uz;
      const c1 = c0 + lat.uz;
      const ix0 = axis === 0 ? r0 : c0;
      const ix1 = axis === 0 ? r1 : c1;
      const iz0 = axis === 0 ? c0 : r0;
      const iz1 = axis === 0 ? c1 : r1;

      const key = `${course}:${ix0}:${iz0}`;
      if (ctx.removed.has(key)) continue;
      if (insideOpening(spec, lat, ix0, ix1, iy0, iy0 + lat.uy, iz0)) continue;
      ctx.units.push({
        key,
        course,
        wythe: w,
        thicknessAxis: axis === 0 ? 2 : 0,
        ix0,
        ix1,
        iy0,
        iy1: iy0 + lat.uy,
        iz0,
        iz1,
        pinned: ctx.pinned.has(key),
      });
    }
  }
}

/**
 * A unit is cut away by an opening when its centre falls inside one.
 *
 * Openings are drawn on the face nearest the charge, so they only cut the wall they were
 * drawn on — otherwise every window would come with a matching hole in the back wall.
 */
function insideOpening(
  spec: WallSpec,
  lat: Lattice,
  ix0: number,
  ix1: number,
  iy0: number,
  iy1: number,
  iz0: number,
): boolean {
  if (spec.openings.length === 0) return false;
  if (spec.plan === 'room' && iz0 !== 0) return false;
  const cx = ((ix0 + ix1) / 2) * lat.dx;
  const cy = ((iy0 + iy1) / 2) * lat.dy;
  return spec.openings.some((o) => cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h);
}
