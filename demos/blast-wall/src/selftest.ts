/**
 * Physics validation against the solver that actually ships.
 *
 * Run with `?selftest` and read the console. These checks used to run in Node against a
 * CPU mirror of the same maths, which was a mistake: the mirror drifted, the oracle was
 * the copy that was wrong, and the suite certified the bug instead of catching it. There
 * is one solver now, and this tests it.
 *
 * What stayed in Node (`npm run selftest`) is everything that is a pure function of the
 * mesh — element stiffness, bond geometry, joint pairing, the blast fits, occlusion.
 * Those need no GPU and still run in CI.
 */

import { defaultWall, type WallSpec } from './model/types.ts';
import { buildMesh, AXIS_X } from './model/mesh.ts';
import { defaultMaterials } from './physics/materials.ts';
import { defaultWorld } from './physics/world.ts';
import { defaultCharge } from './physics/blast.ts';
import { GpuSolver } from './gpu/solver.ts';

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}\n         ${detail}`);
}

function near(a: number, b: number, rel: number): boolean {
  return Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12);
}

/** One column, two courses: exactly one bed joint and nothing else. */
function twoBrick(device: GPUDevice): { solver: GpuSolver; top: number[]; area: number } {
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
  const solver = new GpuSolver(device, mesh, mat, { ...defaultWorld(), gravity: 0 }, {
    ...defaultCharge(),
    mass: 0,
  });
  const top: number[] = [];
  for (let n = 0; n < mesh.nodeCount; n++) if (mesh.nodeUnit[n] === 1) top.push(n);
  let area = 0;
  for (let p = 0; p < mesh.pairCount; p++) area += mesh.pairArea[p];
  return { solver, top, area };
}

/** Place the upper brick rigidly, evaluate forces without moving anything, read them. */
async function tractionAt(
  solver: GpuSolver,
  top: number[],
  offset: [number, number, number],
): Promise<[number, number, number]> {
  const mesh = solver.mesh;
  const x = Float32Array.from(mesh.x0);
  for (const n of top) {
    x[n * 3] += offset[0];
    x[n * 3 + 1] += offset[1];
    x[n * 3 + 2] += offset[2];
  }
  solver.writeRegion('x', x);
  solver.run(1, 0);
  const f = await solver.readRegion('nodeForce', mesh.nodeCount * 3);
  let fx = 0;
  let fy = 0;
  let fz = 0;
  for (const n of top) {
    fx += f[n * 3];
    fy += f[n * 3 + 1];
    fz += f[n * 3 + 2];
  }
  return [fx, fy, fz];
}

async function testJointModeI(device: GPUDevice): Promise<void> {
  console.log('\n1. Joint law: mode I, read off the traction–separation curve');
  const { solver, top, area } = twoBrick(device);
  const mat = solver.materials;
  const deltaF = (2 * mat.gf) / mat.ft;

  let peak = 0;
  let work = 0;
  let prevF = 0;
  let prevD = 0;
  const steps = 600;
  for (let i = 1; i <= steps; i++) {
    const d = (deltaF * 1.6 * i) / steps;
    const [, fy] = await tractionAt(solver, top, [0, d, 0]);
    const force = -fy;
    peak = Math.max(peak, force);
    work += ((force + prevF) / 2) * (d - prevD);
    prevF = force;
    prevD = d;
  }
  check(
    'peak traction is ft',
    near(peak / area, mat.ft, 0.03),
    `${(peak / area / 1e6).toFixed(3)} MPa against ft = ${(mat.ft / 1e6).toFixed(3)} MPa`,
  );
  check(
    'dissipated energy is Gf',
    near(work / area, mat.gf, 0.05),
    `${(work / area).toFixed(2)} J/m² against Gf = ${mat.gf} J/m²`,
  );
  solver.destroy();
}

async function testCompressionCap(device: GPUDevice): Promise<void> {
  console.log('\n2. Joint law: the compression cap under shear');
  const { solver, top, area } = twoBrick(device);
  const mat = solver.materials;
  const overlap = (3 * mat.fc) / mat.kn;
  // The crush offset only leaks into the tangential vector from the second evaluation
  // onward, which is exactly why this needs more than one.
  let fy = 0;
  for (let i = 0; i < 3; i++) [, fy] = await tractionAt(solver, top, [2e-6, -overlap, 0]);
  check(
    'a crushed joint still respects fc while being sheared',
    near(fy / area, mat.fc, 0.02),
    `${(fy / area / 1e6).toFixed(2)} MPa against fc = ${(mat.fc / 1e6).toFixed(2)} MPa, at 3× the cap overlap`,
  );
  solver.destroy();
}

async function testTripletShear(device: GPUDevice): Promise<void> {
  console.log('\n3. Joint law: simulated triplet shear test');
  const mat = defaultMaterials();
  const pts: { sigma: number; tau: number }[] = [];

  for (const overlap of [2e-6, 6e-6, 12e-6, 20e-6]) {
    const { solver, top, area } = twoBrick(device);
    let peak = 0;
    let sigma = 0;
    for (let i = 1; i <= 60; i++) {
      const s = (i / 60) * 3e-4;
      const [fx, fy] = await tractionAt(solver, top, [s, -overlap, 0]);
      if (-fx > peak) {
        peak = -fx;
        sigma = fy / area;
      }
    }
    pts.push({ sigma, tau: peak / area });
    solver.destroy();
  }

  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.sigma, 0);
  const sy = pts.reduce((a, p) => a + p.tau, 0);
  const sxx = pts.reduce((a, p) => a + p.sigma * p.sigma, 0);
  const sxy = pts.reduce((a, p) => a + p.sigma * p.tau, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  check(
    'recovers tan φ from the failure envelope',
    near(slope, mat.tanPhi, 0.05),
    `fitted ${slope.toFixed(3)} against ${mat.tanPhi}`,
  );
  check(
    'recovers the cohesion from the failure envelope',
    near(intercept, mat.cohesion, 0.05),
    `fitted ${(intercept / 1e6).toFixed(3)} MPa against ${(mat.cohesion / 1e6).toFixed(3)} MPa`,
  );
}

function smallWall(bond: 'running' | 'stack', supports: WallSpec['supports']): WallSpec {
  return {
    ...defaultWall(),
    plan: 'wall',
    length: 1.44,
    height: 2.072,
    bond,
    supports,
    divisions: { nx: 2, ny: 1 },
  };
}

async function testSettling(device: GPUDevice): Promise<void> {
  console.log('\n4. Standing the wall up under its own weight');
  const mat = defaultMaterials();
  const mesh = buildMesh(smallWall('running', 'base'), mat.density);
  const solver = new GpuSolver(device, mesh, mat, defaultWorld(), { ...defaultCharge(), mass: 0 });
  let freeMass = 0;
  for (let n = 0; n < mesh.nodeCount; n++) {
    if (mesh.invMass[n] > 0) freeMass += 1 / mesh.invMass[n];
  }
  const weight = freeMass * defaultWorld().gravity;

  const reactionNow = async (): Promise<number> => {
    solver.run(1, 0); // evaluate forces without moving anything
    const f = await solver.readRegion('nodeForce', mesh.nodeCount * 3);
    let r = 0;
    for (let n = 0; n < mesh.nodeCount; n++) if (mesh.invMass[n] === 0) r += f[n * 3 + 1];
    return -r;
  };

  const before = await reactionNow();
  solver.reset(); // settles
  const after = await reactionNow();

  // This asserts what relaxation actually achieves, not what would be ideal. It gets the
  // wall most of the way and then stops: the remainder is a standing wave in the stiff
  // axial modes that carry self-weight, which mass-proportional damping cannot reach —
  // see the note on `relaxSchedule`. A tighter bound here would be either flaky or a
  // quietly loosened test, and the honest number is worth more than either.
  check(
    'settling puts most of the wall\u2019s weight into its supports',
    after > 0.75 * weight && after < 1.15 * weight,
    `${(after / 1000).toFixed(2)} kN carried against ${(weight / 1000).toFixed(2)} kN of wall — ` +
      `${((after / weight) * 100).toFixed(0)} % of equilibrium, from ${(before / 1000).toFixed(2)} kN unsettled`,
  );
  solver.destroy();
}

async function testMomentum(device: GPUDevice): Promise<void> {
  console.log('\n5. Integrator');
  const mat = defaultMaterials();
  mat.damping = 0;
  const mesh = buildMesh(smallWall('running', 'free'), mat.density);
  const solver = new GpuSolver(
    device,
    mesh,
    mat,
    { ...defaultWorld(), gravity: 0, groundOmega: 0 },
    { ...defaultCharge(), mass: 0 },
  );

  const v0 = new Float32Array(mesh.nodeCount * 3);
  v0[0] = 4;
  v0[1] = 2.5;
  v0[2] = -1.5;
  solver.writeRegion('vel', v0);

  const momentum = async (): Promise<[number, number, number]> => {
    const v = await solver.readRegion('vel', mesh.nodeCount * 3);
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let n = 0; n < mesh.nodeCount; n++) {
      if (mesh.invMass[n] === 0) continue;
      const m = 1 / mesh.invMass[n];
      px += m * v[n * 3];
      py += m * v[n * 3 + 1];
      pz += m * v[n * 3 + 2];
    }
    return [px, py, pz];
  };

  const p0 = await momentum();
  solver.run(2000);
  const p1 = await momentum();
  const drift =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / Math.hypot(p0[0], p0[1], p0[2]);
  check(
    'linear momentum is conserved',
    drift < 1e-3,
    `drift ${(drift * 100).toExponential(2)} % over 2000 steps — the check that catches an internal force that is not equal and opposite`,
  );
  solver.destroy();
}

async function testBondMatters(device: GPUDevice): Promise<void> {
  console.log('\n6. Does the bond pattern actually matter?');
  const out: Record<string, { cracked: number; head: number }> = {};

  for (const bond of ['running', 'stack'] as const) {
    const mat = defaultMaterials();
    const mesh = buildMesh(smallWall(bond, 'base'), mat.density);
    const charge = {
      ...defaultCharge(),
      x: mesh.lattice.length / 2,
      y: 0.6,
      z: -3.5,
      mass: 8,
    };
    const solver = new GpuSolver(device, mesh, mat, defaultWorld(), charge);
    solver.reset();
    solver.run(Math.ceil(0.12 / solver.dt));

    const dmg = await solver.readRegion('pairDamage', mesh.pairCount);
    let cracked = 0;
    let head = 0;
    let headCracked = 0;
    for (let p = 0; p < mesh.pairCount; p++) {
      const isCracked = dmg[p] >= 0.999;
      if (isCracked) cracked++;
      if (mesh.pairAxis[p] === AXIS_X) {
        head++;
        if (isCracked) headCracked++;
      }
    }
    out[bond] = { cracked: cracked / mesh.pairCount, head: headCracked / Math.max(head, 1) };
    solver.destroy();
  }

  check(
    'the same charge cracks a stack-bonded wall more than a running-bonded one',
    out.stack.cracked > out.running.cracked,
    `running ${(out.running.cracked * 100).toFixed(1)} %, stack ${(out.stack.cracked * 100).toFixed(1)} % of joints fully cracked`,
  );
  check(
    'and cracks its head joints preferentially, having somewhere for them to run',
    out.stack.head > out.running.head,
    `stussfuger fully cracked: ${(out.running.head * 100).toFixed(0)} % in running bond, ${(out.stack.head * 100).toFixed(0)} % in stack bond`,
  );
}

async function testRoomRestraint(device: GPUDevice): Promise<void> {
  console.log('\n7. Do the corners actually hold the façade?');
  const mat = defaultMaterials();

  // Measured at the ENDS of the façade rather than at its middle: mid-span it is going
  // over either way, so mid-span barely separates the two cases. What return walls do is
  // pin the corners, and that is where to look for it.
  const endMovement = async (plan: 'wall' | 'room'): Promise<number> => {
    const spec: WallSpec = {
      ...defaultWall(),
      plan,
      length: 1.92,
      width: 1.44,
      height: 2.072,
      divisions: { nx: 2, ny: 1 },
      supports: 'base',
    };
    const mesh = buildMesh(spec, mat.density);
    const solver = new GpuSolver(device, mesh, defaultMaterials(), defaultWorld(), {
      ...defaultCharge(),
      x: mesh.lattice.length / 2,
      y: 0.6,
      z: -3.5,
      mass: 8,
    });
    solver.reset();
    solver.run(Math.ceil(0.05 / solver.dt));

    const x = await solver.readRegion('x', mesh.nodeCount * 3);
    const facade = mesh.lattice.wall * mesh.dz + 1e-9;
    const end = mesh.lattice.ux * mesh.dx;
    let disp = 0;
    for (let i = 0; i < mesh.nodeCount; i++) {
      if (mesh.x0[i * 3 + 2] > facade) continue;
      const px = mesh.x0[i * 3];
      if (px > end && px < mesh.lattice.length - end) continue;
      disp = Math.max(disp, x[i * 3 + 2] - mesh.x0[i * 3 + 2]);
    }
    solver.destroy();
    return disp;
  };

  const alone = await endMovement('wall');
  const inRoom = await endMovement('room');
  check(
    'return walls hold the ends of a façade that a lone wall cannot',
    inRoom < alone * 0.6,
    `ends move ${(alone * 1000).toFixed(0)} mm alone, ${(inRoom * 1000).toFixed(0)} mm in a room`,
  );
}

export async function runSelfTest(device: GPUDevice): Promise<void> {
  console.log('blast-wall GPU self-test — the solver that actually ships');
  checks.length = 0;
  await testJointModeI(device);
  await testCompressionCap(device);
  await testTripletShear(device);
  await testSettling(device);
  await testMomentum(device);
  await testBondMatters(device);
  await testRoomRestraint(device);

  const failed = checks.filter((c) => !c.pass);
  console.log(
    failed.length === 0
      ? `\nall ${checks.length} checks passed\n`
      : `\n${failed.length} of ${checks.length} check(s) failed\n`,
  );
}
