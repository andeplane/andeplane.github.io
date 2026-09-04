/**
 * Physics validation, in plain Node — `npm run selftest`, no browser, no GPU.
 *
 * Every check has an answer known ahead of time from elasticity, from the joint's own
 * definition, or from the lab test the joint law is calibrated against. The interesting
 * ones are the last two: a simulated triplet shear test has to recover the cohesion and
 * friction coefficient it was given, and a wall in running bond has to behave measurably
 * differently from the same wall in stack bond. That second one is the whole claim of
 * the demo, so it gets a test rather than a screenshot.
 */

import { defaultWall, type WallSpec } from '../src/model/types.ts';
import { buildMesh } from '../src/model/mesh.ts';
import { generateUnits } from '../src/model/bond.ts';
import { defaultMaterials } from '../src/physics/materials.ts';
import { boxStiffness } from '../src/physics/element.ts';
import { Solver, defaultWorld } from '../src/physics/solver.ts';
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
// 3. The joint law, read straight off its traction–separation curve
// ---------------------------------------------------------------------------
function twoBrickSolver(): { solver: Solver; top: number[]; area: number } {
  // One column, two courses, stack bond: exactly one bed joint, nothing else.
  const spec: WallSpec = {
    ...defaultWall(),
    plan: 'wall',
    length: 0.24,
    height: 0.148,
    bond: 'stack',
    divisions: { nx: 2, ny: 1 },
    supports: 'free',
  };
  const mat = defaultMaterials();
  mat.damping = 0;
  const mesh = buildMesh(spec, mat.density);
  const world = { ...defaultWorld(), gravity: 0 };
  const solver = new Solver(mesh, mat, { ...defaultCharge(), mass: 0 }, world);
  // Every node of the upper unit, so the brick is moved as a rigid body and the only
  // thing resisting is the joint. Grabbing just its top face would measure the brick's
  // own stiffness instead.
  const top: number[] = [];
  for (let n = 0; n < mesh.nodeCount; n++) if (mesh.nodeUnit[n] === 1) top.push(n);
  let area = 0;
  for (let p = 0; p < mesh.pairCount; p++) area += mesh.pairArea[p];
  return { solver, top, area };
}

function testJointTension(): void {
  console.log('\n3. Joint law: mode I');
  const { solver, top, area } = twoBrickSolver();
  const mat = solver.materials;
  const expectArea = solver.mesh.lattice.length * solver.mesh.lattice.thickness;
  check('bed joint area equals the unit footprint', near(area, expectArea, 1e-5), `${(area * 1e6).toFixed(0)} mm² vs ${(expectArea * 1e6).toFixed(0)} mm²`);

  // Pull the upper brick apart in small rigid steps and read the reaction.
  const deltaF = (2 * mat.gf) / mat.ft;
  const steps = 4000;
  let peak = 0;
  let work = 0;
  let prevF = 0;
  let prevD = 0;
  for (let i = 1; i <= steps; i++) {
    const d = (deltaF * 1.6 * i) / steps;
    for (const n of top) solver.x[n * 3 + 1] = solver.mesh.x0[n * 3 + 1] + d;
    solver.computeForces();
    let react = 0;
    for (const n of top) react += solver.f[n * 3 + 1];
    const F = -react; // the force it takes to hold the brick out there
    peak = Math.max(peak, F);
    work += ((F + prevF) / 2) * (d - prevD);
    prevF = F;
    prevD = d;
  }
  check('peak traction is ft', near(peak / area, mat.ft, 0.02), `${(peak / area / 1e6).toFixed(3)} MPa vs ft = ${(mat.ft / 1e6).toFixed(3)} MPa`);
  check('dissipated energy is Gf', near(work / area, mat.gf, 0.03), `${(work / area).toFixed(2)} J/m² vs Gf = ${mat.gf} J/m²`);

  // Past full damage the joint carries no tension but must still bear in compression.
  for (const n of top) solver.x[n * 3 + 1] = solver.mesh.x0[n * 3 + 1] + deltaF * 4;
  solver.computeForces();
  let openF = 0;
  for (const n of top) openF += solver.f[n * 3 + 1];
  for (const n of top) solver.x[n * 3 + 1] = solver.mesh.x0[n * 3 + 1] - 1e-6;
  solver.computeForces();
  let closeF = 0;
  for (const n of top) closeF += solver.f[n * 3 + 1];
  check('a cracked joint carries no tension', Math.abs(openF) / area < 1e3, `${(Math.abs(openF) / area).toFixed(1)} Pa left`);
  check('a cracked joint still bears in compression', closeF / area > 0.5 * mat.kn * 1e-6, `${(closeF / area / 1e6).toFixed(3)} MPa at 1 µm overlap`);
}

function testTripletShear(): void {
  console.log('\n4. Joint law: simulated triplet shear test');
  const mat = defaultMaterials();
  const pts: { sigma: number; tau: number }[] = [];

  for (const overlap of [2e-6, 6e-6, 12e-6, 20e-6]) {
    const { solver, top, area } = twoBrickSolver();
    // Press the joint together, then shear it along the wall and watch for the peak.
    let peak = 0;
    let sigma = 0;
    // Sweep far enough that even the most confined case reaches its plateau; a peak
    // read off a curve that is still climbing would bias the fitted envelope.
    for (let i = 1; i <= 3000; i++) {
      const s = (i / 3000) * 3e-4;
      for (const n of top) {
        solver.x[n * 3] = solver.mesh.x0[n * 3] + s;
        solver.x[n * 3 + 1] = solver.mesh.x0[n * 3 + 1] - overlap;
      }
      solver.computeForces();
      let fx = 0;
      let fy = 0;
      for (const n of top) {
        fx += solver.f[n * 3];
        fy += solver.f[n * 3 + 1];
      }
      if (-fx > peak) {
        peak = -fx;
        sigma = fy / area; // compression is positive here
      }
    }
    pts.push({ sigma, tau: peak / area });
  }

  // Least-squares line: τ = c + σ tanφ. Recovering both is the whole point of the test.
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.sigma, 0);
  const sy = pts.reduce((a, p) => a + p.tau, 0);
  const sxx = pts.reduce((a, p) => a + p.sigma * p.sigma, 0);
  const sxy = pts.reduce((a, p) => a + p.sigma * p.tau, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  check('recovers tan φ from the failure envelope', near(slope, mat.tanPhi, 0.02), `fitted ${slope.toFixed(3)} vs ${mat.tanPhi}`);
  check('recovers the cohesion from the failure envelope', near(intercept, mat.cohesion, 0.02), `fitted ${(intercept / 1e6).toFixed(3)} MPa vs ${(mat.cohesion / 1e6).toFixed(3)} MPa`);
}

// ---------------------------------------------------------------------------
// 5. The integrator
// ---------------------------------------------------------------------------
function smallWall(bond: 'running' | 'stack', supports: WallSpec['supports'] = 'base-top'): WallSpec {
  return {
    ...defaultWall(),
    plan: 'wall',
    length: 1.44,
    height: 1.036,
    bond,
    supports,
    divisions: { nx: 2, ny: 1 },
  };
}

/**
 * A free-standing wall for the bond comparison.
 *
 * Held top AND bottom, a squat panel resists by arching and the bond hardly matters —
 * the thrust line does the work and it does not care where the head joints are. Let the
 * wall stand free and the answer depends entirely on the crack path, which is exactly
 * the thing the bond decides.
 */
function tallWall(bond: 'running' | 'stack'): WallSpec {
  return {
    ...defaultWall(),
    plan: 'wall',
    length: 1.44,
    height: 2.072,
    bond,
    supports: 'base',
    divisions: { nx: 2, ny: 1 },
  };
}

function testMomentum(): void {
  console.log('\n5. Integrator');
  const spec = smallWall('running', 'free');
  const mat = defaultMaterials();
  mat.damping = 0;
  const mesh = buildMesh(spec, mat.density);
  const solver = new Solver(mesh, mat, { ...defaultCharge(), mass: 0 }, {
    ...defaultWorld(),
    gravity: 0,
    groundOmega: 0,
  });
  // Kick one corner and let the wall ring. Nothing external acts, so the total linear
  // momentum can only change if an internal force is not equal and opposite.
  solver.v[0] = 4;
  solver.v[1] = 2.5;
  solver.v[2] = -1.5;
  const p0 = momentum(solver);
  let peakEnergy = 0;
  for (let i = 0; i < 2000; i++) {
    solver.step();
    peakEnergy = Math.max(peakEnergy, solver.kineticEnergy());
  }
  const p1 = momentum(solver);
  const drift = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / Math.hypot(p0[0], p0[1], p0[2]);
  check('linear momentum is conserved', drift < 1e-4, `drift ${(drift * 100).toExponential(2)} % over 2000 steps`);

  const e1 = solver.kineticEnergy();
  check('kinetic energy stays bounded', e1 < peakEnergy * 1.001 && Number.isFinite(e1), `${e1.toFixed(4)} J now, peak ${peakEnergy.toFixed(4)} J`);
}

function momentum(s: Solver): [number, number, number] {
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let n = 0; n < s.mesh.nodeCount; n++) {
    const inv = s.mesh.invMass[n];
    if (inv === 0) continue;
    const m = 1 / inv;
    px += m * s.v[n * 3];
    py += m * s.v[n * 3 + 1];
    pz += m * s.v[n * 3 + 2];
  }
  return [px, py, pz];
}

function testCfl(): void {
  const spec = smallWall('running');
  const mat = defaultMaterials();
  mat.damping = 0;
  const mesh = buildMesh(spec, mat.density);
  const results: number[] = [];
  for (const factor of [0.9, 1.25]) {
    const s = new Solver(mesh, mat, { ...defaultCharge(), mass: 0 }, defaultWorld());
    const dt = s.criticalStep() * factor;
    for (let n = 0; n < mesh.nodeCount; n++) s.v[n * 3 + 2] = mesh.invMass[n] > 0 ? 0.5 : 0;
    for (let i = 0; i < 3000; i++) s.step(dt);
    results.push(s.kineticEnergy());
  }
  check(
    'the measured critical step is the real one',
    Number.isFinite(results[0]) && results[0] < 1e3 && !(Number.isFinite(results[1]) && results[1] < 1e6),
    `0.9× critical → ${results[0].toExponential(2)} J, 1.25× → ${results[1].toExponential(2)} J`,
  );
}

// ---------------------------------------------------------------------------
// 6. Blast parameters
// ---------------------------------------------------------------------------
function testBlast(): void {
  console.log('\n6. Blast');
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
// 7. The headline claim: the bond pattern changes what happens
// ---------------------------------------------------------------------------
function testBondMatters(): void {
  console.log('\n7. Does the bond pattern actually matter?');
  const out: Record<string, { damage: number; disp: number; pieces: number; units: number }> = {};

  for (const bond of ['running', 'stack'] as const) {
    const spec = tallWall(bond);
    const mat = defaultMaterials();
    const mesh = buildMesh(spec, mat.density);
    const charge = { ...defaultCharge(), x: mesh.lattice.length / 2, y: 0.6, z: -3.5, mass: 8 };
    const solver = new Solver(mesh, mat, charge, defaultWorld());
    const steps = Math.ceil(0.05 / solver.dt);
    for (let i = 0; i < steps; i++) solver.step();

    let dmg = 0;
    const delta0 = mat.ft / mat.kn;
    const deltaF = Math.max((2 * mat.gf) / mat.ft, 1.01 * delta0);
    for (let p = 0; p < mesh.pairCount; p++) if (solver.kappa[p] >= deltaF) dmg++;
    let disp = 0;
    for (let n = 0; n < mesh.nodeCount; n++) {
      disp = Math.max(disp, Math.abs(solver.x[n * 3 + 2] - mesh.x0[n * 3 + 2]));
    }
    // How many pieces is the wall in? Two units are still one piece while any joint
    // between them is not fully cracked. This is the metric the bond pattern is FOR:
    // with the head joints stacked, the wall unzips along them into columns; offset,
    // a crack has to work its way around every brick.
    const parent = new Int32Array(mesh.units.length).map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    for (let p = 0; p < mesh.pairCount; p++) {
      if (solver.kappa[p] >= deltaF) continue;
      const ra = find(mesh.nodeUnit[mesh.pairs[p * 2]]);
      const rb = find(mesh.nodeUnit[mesh.pairs[p * 2 + 1]]);
      if (ra !== rb) parent[ra] = rb;
    }
    const pieces = new Set<number>();
    for (let u = 0; u < mesh.units.length; u++) pieces.add(find(u));
    out[bond] = { damage: dmg / mesh.pairCount, disp, pieces: pieces.size, units: mesh.units.length };
  }

  const r = out.running;
  const s = out.stack;
  check(
    'the same charge cracks a stack-bonded wall more than a running-bonded one',
    s.damage > r.damage,
    `running ${(r.damage * 100).toFixed(1)} % of joints fully cracked, stack ${(s.damage * 100).toFixed(1)} %`,
  );
  check(
    'and breaks it into more pieces',
    s.pieces > r.pieces,
    `running bond holds together in ${r.pieces} piece(s), stack bond falls into ${s.pieces}, out of ${r.units} bricks — both pushed about ${(r.disp * 1000).toFixed(0)} mm out of plane`,
  );
}

// ---------------------------------------------------------------------------
// 8. Four walls, bonded at the corners
// ---------------------------------------------------------------------------
function testRoom(): void {
  console.log('\n8. Four walls, bonded at the corners');
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

  // The point the corners earn. Measured at the ENDS of the façade rather than at its
  // middle: a wall standing alone has nothing holding its ends, and mid-span it is going
  // over either way, so mid-span barely separates the two cases. What return walls do is
  // pin the corners, and that is where to look for it.
  const runFacade = (plan: 'wall' | 'room'): number => {
    const s2: WallSpec = { ...spec, plan, height: 2.072 };
    const m2 = buildMesh(s2, mat.density);
    const solver = new Solver(m2, defaultMaterials(), {
      ...defaultCharge(),
      x: m2.lattice.length / 2,
      y: 0.6,
      z: -3.5,
      mass: 8,
    }, defaultWorld());
    for (let i = 0, n = Math.ceil(0.05 / solver.dt); i < n; i++) solver.step();
    // Measure the façade only: the wall nearest the charge, which for the single-wall
    // plan is the whole model and for a room is the front leaf.
    const facade = m2.lattice.wall * m2.dz + 1e-9;
    const end = m2.lattice.ux * m2.dx;
    let disp = 0;
    for (let i = 0; i < m2.nodeCount; i++) {
      if (m2.x0[i * 3 + 2] > facade) continue;
      const x = m2.x0[i * 3];
      if (x > end && x < m2.lattice.length - end) continue;
      disp = Math.max(disp, solver.x[i * 3 + 2] - m2.x0[i * 3 + 2]);
    }
    return disp;
  };
  const alone = runFacade('wall');
  const inRoom = runFacade('room');
  check(
    'return walls hold the ends of the façade that a lone wall cannot',
    inRoom < alone * 0.6,
    `ends move ${(alone * 1000).toFixed(0)} mm alone, ${(inRoom * 1000).toFixed(0)} mm in a room`,
  );
}

// ---------------------------------------------------------------------------

console.log('blast-wall self-test');
testElement();
testBond();
testJointTension();
testTripletShear();
testMomentum();
testCfl();
testBlast();
testBondMatters();
testRoom();

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
