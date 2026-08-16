import { C_SOUND, CFL_LIMIT, CFL_SAFETY } from '../physics/constants';
import type { GridLayout, TubeParams } from './types';

const WALL_THICKNESS_CELLS = 3;
const SPONGE_WIDTH_CELLS = 18;
const MAX_NX = 480;
const MAX_NY = 260;

/**
 * Turns physical tube parameters into a concrete grid: cell size, domain
 * extent, and where the walls/holes/source sit in cell-index space.
 *
 * The domain always contains: a rigid closed cap + wall on the left/top/bottom
 * of the tube, the tube's interior air, the open right end, and enough
 * surrounding atmosphere (plus a damping sponge shell) to watch radiation
 * happen instead of hitting the canvas edge.
 */
export function buildGridLayout(tube: TubeParams): GridLayout {
  const diameterCells = 24; // resolution across the tube diameter, before any cap
  let h = clamp(tube.diameter / diameterCells, 0.003, 0.007);

  const wallM = WALL_THICKNESS_CELLS * h;
  const viewMarginY = Math.max(3 * tube.diameter, 0.2);
  const viewMarginXRight = Math.min(Math.max(0.3 * tube.length, 0.25), 0.5);
  const spongeM = SPONGE_WIDTH_CELLS * h;

  const domainWidthM = wallM + tube.length + viewMarginXRight + spongeM;
  const domainHeightM = tube.diameter + 2 * (viewMarginY + spongeM);

  let nx = Math.round(domainWidthM / h);
  let ny = Math.round(domainHeightM / h);

  // Keep total cell count bounded regardless of how extreme the tube params
  // get, by coarsening the grid rather than growing it unboundedly.
  const overscale = Math.max(nx / MAX_NX, ny / MAX_NY, 1);
  if (overscale > 1) {
    h *= overscale;
    nx = Math.round(domainWidthM / h);
    ny = Math.round(domainHeightM / h);
  }

  const dt = (CFL_SAFETY * CFL_LIMIT * h) / C_SOUND;

  const tubeX0 = WALL_THICKNESS_CELLS;
  const tubeLengthCells = Math.max(4, Math.round(tube.length / h));
  const tubeX1 = tubeX0 + tubeLengthCells - 1;

  const tubeDiameterCells = Math.max(4, Math.round(tube.diameter / h));
  const tubeY0 = Math.round(ny / 2 - tubeDiameterCells / 2);
  const tubeY1 = tubeY0 + tubeDiameterCells - 1;

  const sourceX = tubeX0 + Math.min(2, Math.floor(tubeLengthCells / 4));

  const holeGaps = tube.holes
    .map((hole, holeIndex) => {
      if (hole.diameter <= 0) return null;
      const diameterCells = clamp(Math.round(hole.diameter / h), 1, tubeLengthCells - 2);
      const centerCol = tubeX0 + Math.round(clamp(hole.position, 0, 1) * (tubeLengthCells - 1));
      let x0 = centerCol - Math.floor(diameterCells / 2);
      let x1 = x0 + diameterCells - 1;
      if (x0 < tubeX0 + 1) {
        x1 += tubeX0 + 1 - x0;
        x0 = tubeX0 + 1;
      }
      if (x1 > tubeX1 - 1) {
        x0 -= x1 - (tubeX1 - 1);
        x1 = tubeX1 - 1;
      }
      x0 = Math.max(tubeX0, x0);
      const wall: 'top' | 'bottom' = holeIndex % 2 === 0 ? 'bottom' : 'top';
      return { x0, x1, wall, holeIndex };
    })
    .filter((gap): gap is NonNullable<typeof gap> => gap !== null);

  return {
    h,
    nx,
    ny,
    dt,
    spongeWidth: SPONGE_WIDTH_CELLS,
    tubeX0,
    tubeX1,
    tubeY0,
    tubeY1,
    wallThicknessCells: WALL_THICKNESS_CELLS,
    sourceX,
    sourceY0: tubeY0,
    sourceY1: tubeY1,
    holeGaps,
  };
}

export interface WallRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Analytic list of solid wall rectangles: the closed left cap, the top/bottom
 * wall runs (split around hole gaps), and a short protruding "chimney" rim at
 * each hole so it reads as an actual neck rather than a bare gap. Shared by
 * the mask builder and the renderer so geometry can't drift between them.
 */
export function wallRects(layout: GridLayout): WallRect[] {
  const { tubeX0, tubeX1, tubeY0, tubeY1, wallThicknessCells, holeGaps } = layout;
  const rects: WallRect[] = [
    { x0: 0, x1: tubeX0 - 1, y0: tubeY0 - wallThicknessCells, y1: tubeY1 + wallThicknessCells },
  ];

  for (const wall of ['top', 'bottom'] as const) {
    const gaps = holeGaps.filter((g) => g.wall === wall);
    const y0 = wall === 'top' ? tubeY0 - wallThicknessCells : tubeY1 + 1;
    const y1 = wall === 'top' ? tubeY0 - 1 : tubeY1 + wallThicknessCells;
    for (const [x0, x1] of complementSegments(tubeX0, tubeX1, gaps)) {
      rects.push({ x0, x1, y0, y1 });
    }
  }

  const rimHeight = Math.max(3, wallThicknessCells + 2);
  for (const gap of holeGaps) {
    const y0 = gap.wall === 'top' ? tubeY0 - wallThicknessCells - rimHeight : tubeY1 + 1 + wallThicknessCells;
    const y1 = gap.wall === 'top' ? tubeY0 - wallThicknessCells - 1 : tubeY1 + wallThicknessCells + rimHeight;
    rects.push({ x0: gap.x0, x1: gap.x0, y0, y1 });
    if (gap.x1 !== gap.x0) rects.push({ x0: gap.x1, x1: gap.x1, y0, y1 });
  }

  return rects;
}

function complementSegments(
  x0: number,
  x1: number,
  gaps: { x0: number; x1: number }[],
): [number, number][] {
  const sorted = [...gaps].sort((a, b) => a.x0 - b.x0);
  const segments: [number, number][] = [];
  let cur = x0;
  for (const gap of sorted) {
    const gx0 = clamp(gap.x0, x0, x1);
    const gx1 = clamp(gap.x1, x0, x1);
    if (gx0 > cur) segments.push([cur, gx0 - 1]);
    cur = Math.max(cur, gx1 + 1);
  }
  if (cur <= x1) segments.push([cur, x1]);
  return segments;
}

/** Builds the solid/air mask (1 = solid wall, 0 = air) for the given layout. */
export function buildSolidMask(layout: GridLayout): Uint8Array {
  const { nx, ny } = layout;
  const mask = new Uint8Array(nx * ny);
  for (const rect of wallRects(layout)) {
    for (let y = Math.max(0, rect.y0); y <= Math.min(ny - 1, rect.y1); y++) {
      for (let x = Math.max(0, rect.x0); x <= Math.min(nx - 1, rect.x1); x++) {
        mask[y * nx + x] = 1;
      }
    }
  }
  return mask;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
