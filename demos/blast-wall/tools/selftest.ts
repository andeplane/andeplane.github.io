/**
 * Everything that can be checked WITHOUT running the solver — `npm run selftest`, plain
 * Node, no browser and no GPU, so CI runs it on every pull request.
 *
 * The split is deliberate. There used to be a CPU mirror of the solver here to act as a
 * test oracle, and it drifted from the WGSL it was mirroring: the mirror was the copy
 * that was wrong, so the suite certified a bug in the compression cap rather than
 * catching it. There is one solver now, and the checks that need it live in
 * `src/selftest.ts`, running in the browser against the kernels that actually ship.
 *
 * What is left here is everything that is a pure function of the mesh: the element
 * stiffness matrix, the bond geometry, joint pairing, the blast fits, line-of-sight
 * occlusion, opening faces. None of it needs a GPU, and none of it can drift.
 */

import { defaultWall, type WallSpec } from '../src/model/types.ts';
import { buildMesh } from '../src/model/mesh.ts';
import { generateUnits } from '../src/model/bond.ts';
import { defaultMaterials } from '../src/physics/materials.ts';
import { boxStiffness } from '../src/physics/element.ts';
import { buildNodeLoads } from '../src/physics/load.ts';
import { defaultCharge } from '../src/physics/blast.ts';
import {
  incidentOverpressure,
  reflectedOverpressure,
  scaledDistance,
  ArrivalTable,
} from '../src/physics/blast.ts';

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${name}\n         ${detail}`);
}

function near(a: number, b: number, rel: number): boolean {
  return Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12);
}

// ---------------------------------------------------------------------------
// 1. The element stiffness matrix
// ---------------------------------------------------------------------------
function testElement(): void {
  console.log('\n1. Element stiffness (trilinear hex, 2×2×2 Gauss)');
  const [a, b, c] = [0.06, 0.037, 0.054];
  const E = 16.7e9;
  const nu = 0.15;
  const K = boxStiffness(a, b, c, E, nu);
  const XI = [-1, -1, -1, -1, 1, 1, 1, 1];
  const ETA = [-1, -1, 1, 1, -1, -1, 1, 1];
  const ZETA = [-1, 1, -1, 1, -1, 1, -1, 1];
  const pos = (l: number) => [(XI[l] * a) / 2, (ETA[l] * b) / 2, (ZETA[l] * c) / 2];

  const apply = (u: number[]): number[] => {
    const f = new Array(24).fill(0);
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) f[i] += K[i * 24 + j] * u[j];
    return f;
  };
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

  // Rigid modes must produce no force at all: 3 translations and 3 rotations.
  let worst = 0;
  // Normalise against a mode that genuinely deforms the element — a 1e-4 uniaxial
  // stretch — so the comparison is "no force at all" against "the force of a real strain".
  const scale = norm(apply(Array.from({ length: 24 }, (_, i) =>
    i % 3 === 0 ? 1e-4 * ((XI[Math.floor(i / 3)] * a) / 2) : 0)));
  for (const mode of [0, 1, 2, 3, 4, 5]) {
    const u = new Array(24).fill(0);
    for (let l = 0; l < 8; l++) {
      const p = pos(l);
      if (mode < 3) u[l * 3 + mode] = 1e-4;
      else {
        // Infinitesimal rotation about axis (mode−3).
        const ax = mode - 3;
        const i1 = (ax + 1) % 3;
        const i2 = (ax + 2) % 3;
        u[l * 3 + i1] = -1e-4 * p[i2];
        u[l * 3 + i2] = 1e-4 * p[i1];
      }
    }
    worst = Math.max(worst, norm(apply(u)) / scale);
  }
  check('six rigid-body modes carry no force', worst < 1e-6, `worst residual ${worst.toExponential(2)} of a unit-strain force`);

  // Uniaxial strain: σxx = (λ+2μ) εxx, so the force on the +x face is that times its area.
  const eps = 1e-4;
  const u1 = new Array(24).fill(0);
  for (let l = 0; l < 8; l++) u1[l * 3] = eps * pos(l)[0];
  const f1 = apply(u1);
  let fx = 0;
  for (let l = 0; l < 8; l++) if (XI[l] > 0) fx += f1[l * 3];
  const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = E / (2 * (1 + nu));
  const wantX = (lam + 2 * mu) * eps * b * c;
  check('uniaxial strain gives (λ+2μ)ε', near(fx, wantX, 1e-5), `face force ${fx.toFixed(3)} N vs ${wantX.toFixed(3)} N`);

  // Simple shear: σxy = μγ.
  const gam = 1e-4;
  const u2 = new Array(24).fill(0);
  for (let l = 0; l < 8; l++) u2[l * 3] = gam * pos(l)[1];
  const f2 = apply(u2);
  let fs = 0;
  for (let l = 0; l < 8; l++) if (ETA[l] > 0) fs += f2[l * 3];
  const wantS = mu * gam * a * c;
  check('simple shear gives μγ', near(fs, wantS, 1e-5), `face force ${fs.toFixed(3)} N vs ${wantS.toFixed(3)} N`);
}

// ---------------------------------------------------------------------------
// 2. Bond geometry — the thing the wall is actually for
// ---------------------------------------------------------------------------
function testBond(): void {
  console.log('\n2. Bond geometry');
  const spec: WallSpec = { ...defaultWall(), plan: 'wall', length: 2.4, height: 1.184 };

  for (const bond of ['running', 'stack'] as const) {
    const { units, lattice } = generateUnits({ ...spec, bond });
    // Collect the interior head-joint positions of each course.
    const byCourse = new Map<number, Set<number>>();
    for (const u of units) {
      const s = byCourse.get(u.course) ?? new Set<number>();
      if (u.ix0 > 0) s.add(u.ix0);
      byCourse.set(u.course, s);
    }
    let aligned = 0;
    let total = 0;
    for (let c = 1; c < lattice.ny / lattice.uy; c++) {
      const a = byCourse.get(c - 1)!;
      for (const x of byCourse.get(c)!) {
        total++;
        if (a.has(x)) aligned++;
      }
    }
    const frac = aligned / Math.max(total, 1);
    if (bond === 'running') {
      check('running bond: no stussfuge sits above another', frac === 0, `${aligned} of ${total} head joints aligned with the course below`);
    } else {
      check('stack bond: every stussfuge sits above another', frac === 1, `${aligned} of ${total} head joints aligned with the course below`);
    }
  }

  const mesh = buildMesh(spec, 1900);
  let maxGap = 0;
  for (let p = 0; p < mesh.pairCount; p++) {
    const a = mesh.pairs[p * 2];
    const b = mesh.pairs[p * 2 + 1];
    maxGap = Math.max(
      maxGap,
      Math.hypot(
        mesh.x0[a * 3] - mesh.x0[b * 3],
        mesh.x0[a * 3 + 1] - mesh.x0[b * 3 + 1],
        mesh.x0[a * 3 + 2] - mesh.x0[b * 3 + 2],
      ),
    );
  }
  check('every joint pair is coincident in the reference state', maxGap < 1e-9, `largest reference gap ${maxGap.toExponential(2)} m over ${mesh.pairCount} pairs`);

  // Total mass must equal wall volume × density, whatever the bond does at the ends.
  let m = 0;
  for (let n = 0; n < mesh.nodeCount; n++) if (mesh.invMass[n] > 0) m += 1 / mesh.invMass[n];
  const bulk = mesh.lattice.length * mesh.lattice.height * mesh.lattice.thickness * 1900;
  check('lumped mass adds up to the wall (minus its supports)', m < bulk && m > bulk * 0.8, `${m.toFixed(0)} kg of a ${bulk.toFixed(0)} kg wall, rest held by supports`);
}

// ---------------------------------------------------------------------------
// 6. Blast parameters
// ---------------------------------------------------------------------------
function testBlast(): void {
  console.log('\n7. Blast');
  const p1 = incidentOverpressure(1);
  check('peak overpressure at Z = 1 is about 1 MPa', p1 > 0.8e6 && p1 < 1.3e6, `${(p1 / 1e6).toFixed(3)} MPa`);
  const p3 = incidentOverpressure(3);
  check('peak overpressure at Z = 3 is about 0.1 MPa', p3 > 0.05e6 && p3 < 0.15e6, `${(p3 / 1e6).toFixed(3)} MPa`);
  check('overpressure falls monotonically with distance', incidentOverpressure(0.5) > p1 && p1 > p3 && p3 > incidentOverpressure(10), 'checked at Z = 0.5, 1, 3, 10');

  const pr = reflectedOverpressure(p3);
  check('reflection amplifies between 2× and 8×', pr / p3 > 2 && pr / p3 < 8, `${(pr / p3).toFixed(2)}× at Z = 3`);

  // The front leaves fast and slows toward the speed of sound.
  const table = new ArrivalTable(20, 40);
  const near1 = table.timeAt(2);
  const far = table.timeAt(20);
  const vNear = 2 / near1;
  const vFar = (20 - 2) / (far - near1);
  check('the shock decelerates toward the speed of sound', vNear > vFar && vFar > 330 && vFar < 700, `${vNear.toFixed(0)} m/s over the first 2 m, ${vFar.toFixed(0)} m/s after`);
  check('scaled distance scales', near(scaledDistance(10, 8), 5, 1e-9), 'R = 10 m, W = 8 kg → Z = 5');
}

// ---------------------------------------------------------------------------
// 8. Four walls, bonded at the corners
// ---------------------------------------------------------------------------
function testRoom(): void {
  console.log('\n9. Four walls, bonded at the corners');
  const mat = defaultMaterials();
  const spec: WallSpec = {
    ...defaultWall(),
    plan: 'room',
    length: 1.92,
    width: 1.44,
    height: 1.036,
    divisions: { nx: 2, ny: 1 },
  };
  const mesh = buildMesh(spec, mat.density);

  // Everything rests on this: a square plan lattice is what lets a wall running along z
  // be the same kind of object as one running along x.
  check(
    'the plan lattice is square',
    Math.abs(mesh.dx - mesh.dz) < 1e-12,
    `dx = ${(mesh.dx * 1000).toFixed(1)} mm, dz = ${(mesh.dz * 1000).toFixed(1)} mm`,
  );

  // A corner joint is one whose two bricks belong to walls running on different axes.
  const runsAlongX = (u: number) => {
    const b = mesh.units[u];
    return b.ix1 - b.ix0 >= b.iz1 - b.iz0;
  };
  let corner = 0;
  for (let p = 0; p < mesh.pairCount; p++) {
    const a = mesh.nodeUnit[mesh.pairs[p * 2]];
    const b = mesh.nodeUnit[mesh.pairs[p * 2 + 1]];
    if (runsAlongX(a) !== runsAlongX(b)) corner++;
  }
  check('the return walls are jointed to the façades', corner > 0, `${corner} joint pairs cross a corner`);

  // And the four walls have to be ONE structure, not four things standing next to
  // each other — which is the entire reason for building a room rather than a wall.
  const parent = new Int32Array(mesh.units.length).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let p = 0; p < mesh.pairCount; p++) {
    const ra = find(mesh.nodeUnit[mesh.pairs[p * 2]]);
    const rb = find(mesh.nodeUnit[mesh.pairs[p * 2 + 1]]);
    if (ra !== rb) parent[ra] = rb;
  }
  const pieces = new Set<number>();
  for (let u = 0; u < mesh.units.length; u++) pieces.add(find(u));
  check('the room is one connected structure', pieces.size === 1, `${mesh.units.length} bricks in ${pieces.size} connected piece(s)`);

  // The blast must not reach through the façade. Before the line-of-sight test existed
  // the inside of the back wall took 0.45 MPa and the return walls were pushed outward
  // from within the room, which is a third of the façade's load applied to surfaces that
  // cannot see the charge.
  {
    const room = buildMesh({ ...spec, height: 2.072 }, mat.density);
    const load = buildNodeLoads(room, { ...defaultCharge(), x: room.lattice.length / 2, y: 1, z: -4.5, mass: 25 });
    const facadeDepth = room.lattice.wall * room.dz + 1e-9;
    let facade = 0;
    let behind = 0;
    for (let n = 0; n < room.nodeCount; n++) {
      const fz = load.dir[n * 3 + 2];
      if (room.x0[n * 3 + 2] <= facadeDepth) facade += fz;
      else behind += Math.abs(fz);
    }
    check(
      'nothing behind the façade is loaded through it',
      behind < Math.abs(facade) * 0.02,
      `façade takes ${(facade / 1e6).toFixed(2)} MN, everything behind it ${(behind / 1e6).toFixed(3)} MN`,
    );
  }

  // An opening belongs to the wall it was drawn on. Cutting one out of a return wall
  // used to punch it through the façade instead, because the editor always intersected
  // the plane z = 0 and the mesher only ever cut units with iz0 === 0.
  {
    const cut: WallSpec = {
      ...spec,
      openings: [{ x: 0.4, y: 0.2, w: 0.6, h: 0.5, face: 'x0' }],
    };
    const before = buildMesh(spec, mat.density);
    const after = buildMesh(cut, mat.density);
    const onWall = (m: typeof before, face: 'x0' | 'z0') =>
      m.units.filter((u) =>
        face === 'x0' ? u.ix0 < m.lattice.wall : u.iz0 < m.lattice.wall,
      ).length;
    const lostReturn = onWall(before, 'x0') - onWall(after, 'x0');
    const lostFacade = onWall(before, 'z0') - onWall(after, 'z0');
    check(
      'an opening cuts the wall it was drawn on and no other',
      lostReturn > 0 && lostFacade === 0,
      `${lostReturn} bricks gone from the return wall, ${lostFacade} from the façade`,
    );
  }

  // Whether the corners actually restrain the façade under load is a solver question,
  // so it lives in the GPU suite (src/selftest.ts) rather than here.
}

// ---------------------------------------------------------------------------

console.log('blast-wall self-test');
testElement();
testBond();
testBlast();
testRoom();

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
