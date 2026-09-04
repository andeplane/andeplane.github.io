/**
 * Units → a hex mesh, the joint node pairs, and the surface quads.
 *
 * Two properties are worth stating because everything downstream leans on them:
 *
 *  1. Every element is the same box (dx, dy, dz). Units are laid out on one global
 *     lattice and subdivided uniformly, so there is exactly ONE element stiffness
 *     matrix for the whole model. That turns the internal force into a shared 24×24
 *     matvec instead of per-element integration.
 *
 *  2. Nodes are never shared between units. A joint is a set of node PAIRS whose
 *     reference positions coincide — the two sides of a fuge, which the interface law
 *     then glues, cracks, slides and lets bear on each other. No contact search: the
 *     lattice guarantees the two faces match node for node.
 */

import type { WallSpec, F32, U32, U8 } from './types.ts';
import { generateUnits, type Lattice, type Unit } from './bond.ts';

/** Joint orientation. The interface law needs the normal; it is always an axis. */
export const AXIS_X = 0; // stussfuge (head joint)
export const AXIS_Y = 1; // liggefuge (bed joint)
export const AXIS_Z = 2; // collar joint, only in a two-wythe wall

export interface Mesh {
  spec: WallSpec;
  lattice: Lattice;
  units: Unit[];

  nodeCount: number;
  /** Reference positions, 3 per node. */
  x0: F32;
  /** 1/mass per node; 0 for a fixed node, which is how supports are enforced. */
  invMass: F32;
  /** Unit each node belongs to. */
  nodeUnit: U32;

  elementCount: number;
  /** 8 node indices per element, in the (a,b,c) bit order used by the stiffness matrix. */
  elements: U32;

  pairCount: number;
  /** 2 node indices per joint pair. */
  pairs: U32;
  /** Axis of the joint normal, one per pair. */
  pairAxis: U8;
  /** Tributary area carried by the pair, m². */
  pairArea: F32;

  quadCount: number;
  /** 4 node indices per exposed surface quad, wound counter-clockwise from outside. */
  quads: U32;

  /**
   * Per-unit render scales, 8 floats: the mortar body's scale on each axis (padded to a
   * vec4), then the brick's — in that order, because it is the draw instance order.
   */
  unitScale: F32;
  /** Per-unit node range [start, end) for centroids, picking and selection. */
  unitNodeStart: U32;
  unitNodeEnd: U32;

  /** Element box size, metres. */
  dx: number;
  dy: number;
  dz: number;
}

interface UnitLayout extends Unit {
  nxb: number;
  nyb: number;
  nzb: number;
  base: number;
}

export function buildMesh(spec: WallSpec, density: number): Mesh {
  const { units, lattice } = generateUnits(spec);
  const { dx, dy, dz } = lattice;

  // --- nodes -------------------------------------------------------------------
  const lay: UnitLayout[] = [];
  let nodeCount = 0;
  for (const u of units) {
    const nxb = u.ix1 - u.ix0;
    const nyb = u.iy1 - u.iy0;
    const nzb = u.iz1 - u.iz0;
    lay.push({ ...u, nxb, nyb, nzb, base: nodeCount });
    nodeCount += (nxb + 1) * (nyb + 1) * (nzb + 1);
  }

  const x0 = new Float32Array(nodeCount * 3);
  const nodeUnit = new Uint32Array(nodeCount);
  const unitNodeStart = new Uint32Array(units.length);
  const unitNodeEnd = new Uint32Array(units.length);
  const unitScale = new Float32Array(units.length * 8);

  for (let ui = 0; ui < lay.length; ui++) {
    const u = lay[ui];
    unitNodeStart[ui] = u.base;
    unitNodeEnd[ui] = u.base + (u.nxb + 1) * (u.nyb + 1) * (u.nzb + 1);
    for (let i = 0; i <= u.nxb; i++) {
      for (let j = 0; j <= u.nyb; j++) {
        for (let k = 0; k <= u.nzb; k++) {
          const n = nodeOf(u, i, j, k);
          x0[n * 3] = (u.ix0 + i) * dx;
          x0[n * 3 + 1] = (u.iy0 + j) * dy;
          x0[n * 3 + 2] = (u.iz0 + k) * dz;
          nodeUnit[n] = ui;
        }
      }
    }
    // Two bodies are drawn per unit and this is what separates them. The brick is the
    // expanded unit shrunk by half a fuge on every face, so it is the real 228 × 62 mm
    // stone. The mortar body keeps the unit's full extent across the wall face — that is
    // what fills the joint between neighbouring bricks — but is set back further through
    // the wall's own thickness, so it reads as raked mortar behind the brick rather than
    // a box the brick is hidden inside.
    //
    // Which axis is "through the thickness" depends on which way the wall runs, so the
    // unit carries it. Setting a return wall back along its LENGTH instead turns it into
    // a set of vertical stripes.
    const j = spec.joint;
    // Slot order matches the draw order: instance 0 is the mortar, instance 1 the brick.
    const span = [u.nxb * dx, u.nyb * dy, u.nzb * dz];
    for (let a = 0; a < 3; a++) {
      unitScale[ui * 8 + a] = a === u.thicknessAxis ? Math.max(0.2, 1 - (2.2 * j) / span[a]) : 1;
      unitScale[ui * 8 + 4 + a] = Math.max(0.2, 1 - j / span[a]);
    }
  }

  // --- elements and lumped mass ------------------------------------------------
  let elementCount = 0;
  for (const u of lay) elementCount += u.nxb * u.nyb * u.nzb;
  const elements = new Uint32Array(elementCount * 8);
  const mass = new Float32Array(nodeCount);
  const nodeMass = (density * dx * dy * dz) / 8;

  let e = 0;
  for (const u of lay) {
    for (let i = 0; i < u.nxb; i++) {
      for (let j = 0; j < u.nyb; j++) {
        for (let k = 0; k < u.nzb; k++) {
          for (let l = 0; l < 8; l++) {
            const n = nodeOf(u, i + ((l >> 2) & 1), j + ((l >> 1) & 1), k + (l & 1));
            elements[e * 8 + l] = n;
            mass[n] += nodeMass;
          }
          e++;
        }
      }
    }
  }

  // --- supports ----------------------------------------------------------------
  const fixed = new Uint8Array(nodeCount);
  const s = spec.supports;
  const holdBase = s !== 'free';
  const holdTop = s === 'base-top' || s === 'four-sided';
  const holdEnds = s === 'three-sided' || s === 'four-sided';
  for (let ui = 0; ui < lay.length; ui++) {
    const u = lay[ui];
    const all = u.pinned;
    for (let i = 0; i <= u.nxb; i++) {
      for (let j = 0; j <= u.nyb; j++) {
        for (let k = 0; k <= u.nzb; k++) {
          const gy = u.iy0 + j;
          const gx = u.ix0 + i;
          if (
            all ||
            (holdBase && gy === 0) ||
            (holdTop && gy === lattice.ny) ||
            (holdEnds && (gx === 0 || gx === lattice.nx))
          ) {
            fixed[nodeOf(u, i, j, k)] = 1;
          }
        }
      }
    }
  }

  const invMass = new Float32Array(nodeCount);
  for (let n = 0; n < nodeCount; n++) invMass[n] = fixed[n] ? 0 : 1 / mass[n];

  // --- joints ------------------------------------------------------------------
  const pairA: number[] = [];
  const pairB: number[] = [];
  const pairAx: number[] = [];
  const pairAr: number[] = [];

  // Units are few (hundreds) and this runs once, so the O(n²) sweep is not worth
  // bucketing. Two units make a joint when they touch on one axis AND overlap with
  // positive extent on both others — the overlap test is what stops diagonal
  // neighbours across a bond from being glued together.
  const area = [dy * dz, dx * dz, dx * dy];
  for (let a = 0; a < lay.length; a++) {
    for (let b = 0; b < lay.length; b++) {
      if (a === b) continue;
      const A = lay[a];
      const B = lay[b];
      for (let axis = 0; axis < 3; axis++) {
        if (hi(A, axis) !== lo(B, axis)) continue; // A's + face against B's − face
        const o1 = (axis + 1) % 3;
        const o2 = (axis + 2) % 3;
        const s1 = Math.max(lo(A, o1), lo(B, o1));
        const e1 = Math.min(hi(A, o1), hi(B, o1));
        const s2 = Math.max(lo(A, o2), lo(B, o2));
        const e2 = Math.min(hi(A, o2), hi(B, o2));
        if (e1 - s1 < 1 || e2 - s2 < 1) continue;

        for (let p = s1; p <= e1; p++) {
          for (let q = s2; q <= e2; q++) {
            const idx = [0, 0, 0];
            idx[axis] = hi(A, axis);
            idx[o1] = p;
            idx[o2] = q;
            const na = nodeAt(A, idx);
            const nb = nodeAt(B, idx);
            // Half weight on a node sitting on its own unit's edge; taking the smaller
            // of the two sides makes the areas around a four-brick corner sum correctly.
            const wa = edgeWeight(A, o1, p) * edgeWeight(A, o2, q);
            const wb = edgeWeight(B, o1, p) * edgeWeight(B, o2, q);
            pairA.push(na);
            pairB.push(nb);
            pairAx.push(axis);
            pairAr.push(Math.min(wa, wb) * area[axis]);
          }
        }
      }
    }
  }

  const pairCount = pairA.length;
  const pairs = new Uint32Array(pairCount * 2);
  for (let p = 0; p < pairCount; p++) {
    pairs[p * 2] = pairA[p];
    pairs[p * 2 + 1] = pairB[p];
  }

  // --- exposed surface ---------------------------------------------------------
  // Every face on a unit's boundary is drawn: bricks are separate bodies, and shrinking
  // each one back to its real size (unitScale) opens the fuge instead of z-fighting.
  const quadList: number[] = [];
  for (const u of lay) {
    face(quadList, u, 0, 0);
    face(quadList, u, 0, 1);
    face(quadList, u, 1, 0);
    face(quadList, u, 1, 1);
    face(quadList, u, 2, 0);
    face(quadList, u, 2, 1);
  }

  return {
    spec,
    lattice,
    units,
    nodeCount,
    x0,
    invMass,
    nodeUnit,
    elementCount,
    elements,
    pairCount,
    pairs,
    pairAxis: new Uint8Array(pairAx),
    pairArea: new Float32Array(pairAr),
    quadCount: quadList.length / 4,
    quads: new Uint32Array(quadList),
    unitScale,
    unitNodeStart,
    unitNodeEnd,
    dx,
    dy,
    dz,
  };
}

function nodeOf(u: UnitLayout, i: number, j: number, k: number): number {
  return u.base + (i * (u.nyb + 1) + j) * (u.nzb + 1) + k;
}

function nodeAt(u: UnitLayout, gi: number[]): number {
  return nodeOf(u, gi[0] - u.ix0, gi[1] - u.iy0, gi[2] - u.iz0);
}

function lo(u: UnitLayout, axis: number): number {
  return axis === 0 ? u.ix0 : axis === 1 ? u.iy0 : u.iz0;
}

function hi(u: UnitLayout, axis: number): number {
  return axis === 0 ? u.ix1 : axis === 1 ? u.iy1 : u.iz1;
}

function edgeWeight(u: UnitLayout, axis: number, g: number): number {
  return g === lo(u, axis) || g === hi(u, axis) ? 0.5 : 1;
}

/** Emit the quads of one boundary face of a unit, wound counter-clockwise from outside. */
function face(out: number[], u: UnitLayout, axis: number, side: number): void {
  const n = [u.nxb, u.nyb, u.nzb];
  const o1 = (axis + 1) % 3;
  const o2 = (axis + 2) % 3;
  const at = (p: number, q: number): number => {
    const c = [0, 0, 0];
    c[axis] = side ? n[axis] : 0;
    c[o1] = p;
    c[o2] = q;
    return nodeOf(u, c[0], c[1], c[2]);
  };
  for (let p = 0; p < n[o1]; p++) {
    for (let q = 0; q < n[o2]; q++) {
      const a = at(p, q);
      const b = at(p + 1, q);
      const c = at(p + 1, q + 1);
      const d = at(p, q + 1);
      // (o1 × o2) points along +axis, so the + side is already outward-facing.
      if (side) out.push(a, b, c, d);
      else out.push(a, d, c, b);
    }
  }
}

/**
 * Who touches what, in CSR form — the reason the GPU solver needs no atomics.
 *
 * Element and joint kernels write their forces into their OWN slots; then one kernel per
 * node walks these lists and sums what belongs to it. Scattering with atomics would need
 * f32 atomics, which WGSL does not have, and the compare-and-swap workaround is both
 * slower and non-deterministic. Gathering is neither.
 */
export interface Adjacency {
  /** Node → its (element × 8 + localIndex) entries. */
  elemStart: U32;
  elemData: U32;
  /** Node → its (pair × 2 + side) entries; side 0 is the − side of the joint. */
  pairStart: U32;
  pairData: U32;
}

export function buildAdjacency(mesh: Mesh): Adjacency {
  const n = mesh.nodeCount;
  const elemStart = new Uint32Array(n + 1);
  const pairStart = new Uint32Array(n + 1);
  for (let i = 0; i < mesh.elementCount * 8; i++) elemStart[mesh.elements[i] + 1]++;
  for (let i = 0; i < mesh.pairCount * 2; i++) pairStart[mesh.pairs[i] + 1]++;
  for (let i = 0; i < n; i++) {
    elemStart[i + 1] += elemStart[i];
    pairStart[i + 1] += pairStart[i];
  }
  const elemData = new Uint32Array(elemStart[n]);
  const pairData = new Uint32Array(pairStart[n]);
  const ec = elemStart.slice();
  const pc = pairStart.slice();
  for (let e = 0; e < mesh.elementCount; e++) {
    for (let l = 0; l < 8; l++) elemData[ec[mesh.elements[e * 8 + l]]++] = e * 8 + l;
  }
  for (let p = 0; p < mesh.pairCount; p++) {
    for (let s = 0; s < 2; s++) pairData[pc[mesh.pairs[p * 2 + s]]++] = p * 2 + s;
  }
  return { elemStart, elemData, pairStart, pairData };
}
