/**
 * Builds the column plan: every column position, tagged with its order.
 *
 * Coordinate convention
 *   +x  east  (the front, toward the altar)
 *   +z  north
 *   y   up
 * The temple's long axis runs east–west, so `length` (108.63) lies along x and
 * `width` (55.16) along z. The east facade is the entrance front.
 */

import { STYLOBATE, PLAN, EDGE_INSET } from './params.js';

/** Evenly spaced axis positions, symmetric about 0, spanning `span`. */
function axis(count, span) {
  if (count < 2) return [0];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + i * step);
}

export function buildPlan() {
  const inset = EDGE_INSET.value;
  const spanX = STYLOBATE.length - 2 * inset; // along the flanks
  const spanZ = STYLOBATE.width - 2 * inset; // across the fronts

  const outerX = axis(PLAN.outerAlong, spanX); // 24 positions
  const outerZ = axis(PLAN.outerAcross, spanZ); // 8 positions

  const bayX = outerX[1] - outerX[0];
  const bayZ = outerZ[1] - outerZ[0];

  // Inner ring sits one bay in from the outer ring on all four sides.
  const innerX = axis(PLAN.innerAlong, spanX - 2 * bayX);
  const innerZ = axis(PLAN.innerAcross, spanZ - 2 * bayZ);

  const columns = [];

  /**
   * `angle` is the capital's rotation about the vertical.
   *
   * An Ionic capital is directional: the volute faces front the colonnade, and
   * the bolster runs back into it. So a column on a flank shows its volutes to
   * a viewer standing north or south (angle 0), while a column on a facade
   * shows them to a viewer standing east or west (angle π/2). Getting this
   * wrong is one of the most conspicuous errors in a Greek temple model.
   *
   * Corner columns are left as flank-facing. Real Ionic corners take an angle
   * volute canted at 45°, which is a genuine piece of missing detail rather
   * than an approximation — flagged in the README.
   */
  const add = (x, z, order, group, angle = 0) =>
    columns.push({ x, z, order, group, angle });

  const ACROSS = Math.PI / 2; // volutes facing east/west

  // ── Peristasis: rectangular ring, corners counted once ────────────────────
  const ring = (xs, zs, order, group) => {
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    const z0 = zs[0];
    const z1 = zs[zs.length - 1];
    // The two flank rows, running along x. Volutes face ±z.
    for (const x of xs) {
      add(x, z0, order, group, 0);
      add(x, z1, order, group, 0);
    }
    // The two facade rows, running along z; corners already placed above.
    for (const z of zs.slice(1, -1)) {
      add(x0, z, order, group, ACROSS);
      add(x1, z, order, group, ACROSS);
    }
  };

  ring(outerX, outerZ, 'outer', 'outerRing');
  ring(innerX, innerZ, 'inner', 'innerRing');

  // ── Third row at each facade ──────────────────────────────────────────────
  // Sits one bay inside the inner ring's end row, spanning the interior width.
  const thirdX = [innerX[1], innerX[innerX.length - 2]];
  const thirdZ = axis(PLAN.thirdRowPerFacade, spanZ - 4 * bayZ);
  for (const x of thirdX) {
    for (const z of thirdZ) add(x, z, 'inner', 'thirdRow', ACROSS);
  }

  // ── Pronaos (east, 8) and rear hall (west, 9) ─────────────────────────────
  // Two transverse rows each; the rear hall's odd ninth column stands on the
  // axis, which is what "nine-column rear hall" implies.
  // NB: innerX[0] is the WEST end (−x); east is +x. The pronaos is the eastern,
  // entrance porch; the nine-column hall is the western, rear one.
  const last = innerX.length - 1;
  const porchX = {
    east: [innerX[last - 2], innerX[last - 3]],
    west: [innerX[2], innerX[3]],
  };
  const porchZ = axis(4, spanZ - 4 * bayZ);

  for (const x of porchX.east) {
    for (const z of porchZ) add(x, z, 'porch', 'pronaos', ACROSS);
  }
  for (const x of porchX.west) {
    for (const z of porchZ) add(x, z, 'porch', 'rearHall', ACROSS);
  }
  // The ninth, standing on the central axis of the rear hall — which is what
  // an odd-numbered "neunsäulige Rückhalle" implies.
  add(innerX[4], 0, 'porch', 'rearHall', ACROSS);

  // ── Cella: two internal colonnades, running along the length ──────────────
  const cellaX = axis(PLAN.cellaColonnadeLength, spanX * 0.52);
  const cellaZ = [-spanZ * 0.16, spanZ * 0.16];
  for (const x of cellaX) {
    for (const z of cellaZ) add(x, z, 'cella', 'cella', 0);
  }

  const counts = columns.reduce((acc, c) => {
    acc[c.group] = (acc[c.group] || 0) + 1;
    return acc;
  }, {});

  return {
    columns,
    counts,
    total: columns.length,
    attestedTotal: PLAN.totalAttested,
    bayX,
    bayZ,
    spanX,
    spanZ,
    innerX,
    innerZ,
    outerX,
    outerZ,
  };
}
