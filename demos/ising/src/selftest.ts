/**
 * In-app physics validation, run with `?selftest` and reported to the console.
 *
 * Targets are exact results: energy per spin at the T → 0 and T → ∞ limits, the
 * Onsager magnetization curve for the square lattice, and — the test that catches a
 * broken sublattice coloring — the transition sitting at the right T_c on the
 * triangular and honeycomb lattices. An invalid coloring (e.g. a 2-color checkerboard
 * on the non-bipartite triangular lattice) shifts or destroys the transition rather
 * than crashing, so only physics can detect it.
 */

import { Simulation, type FillMode } from './sim/simulation.ts';
import { onsagerMagnetization } from './physics/exact.ts';
import type { GeometryKey } from './physics/lattice.ts';

const L = 252; // ≡ 0 mod 6

interface Check {
  name: string;
  measured: number;
  expected: string;
  pass: boolean;
}

export async function runSelfTest(device: GPUDevice): Promise<void> {
  console.log('[selftest] running physics validation on a 252² lattice…');
  const sim = new Simulation(device, L, 'square');
  const staging = device.createBuffer({
    label: 'selftest staging',
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  async function run(sweeps: number): Promise<void> {
    let left = sweeps;
    while (left > 0) {
      const chunk = Math.min(64, left);
      const encoder = device.createCommandEncoder();
      sim.encodeFrame(encoder, chunk);
      device.queue.submit([encoder.finish()]);
      left -= chunk;
    }
    await device.queue.onSubmittedWorkDone();
  }

  async function sampleOnce(): Promise<{ m: number; e: number }> {
    const encoder = device.createCommandEncoder();
    sim.encodeMeasure(encoder, staging);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const ints = new Int32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    const sumS = ints[0];
    const sumBonds = ints[1];
    return { m: sumS / sim.N, e: (-sumBonds - sim.h * sumS) / sim.N };
  }

  async function measure(
    geometry: GeometryKey,
    T: number,
    h: number,
    fill: FillMode,
    equil: number,
    samples: number,
  ): Promise<{ absM: number; e: number }> {
    sim.setGeometry(geometry);
    sim.T = T;
    sim.h = h;
    sim.reset(fill);
    await run(equil);
    let sAbsM = 0;
    let sE = 0;
    for (let i = 0; i < samples; i++) {
      await run(3);
      const { m, e } = await sampleOnce();
      sAbsM += Math.abs(m);
      sE += e;
    }
    return { absM: sAbsM / samples, e: sE / samples };
  }

  const checks: Check[] = [];
  const near = (v: number, target: number, tol: number) => Math.abs(v - target) <= tol;

  {
    const r = await measure('square', 100, 0, 'random', 100, 40);
    checks.push({ name: 'square T=100: e ≈ 0', measured: r.e, expected: '|e| < 0.15', pass: Math.abs(r.e) < 0.15 });
    checks.push({ name: 'square T=100: |m| ≈ 0', measured: r.absM, expected: '< 0.05', pass: r.absM < 0.05 });
  }
  {
    const r = await measure('square', 0.2, 0, 'up', 200, 20);
    checks.push({ name: 'square T=0.2: e → −2', measured: r.e, expected: '±0.02', pass: near(r.e, -2, 0.02) });
    checks.push({ name: 'square T=0.2: |m| → 1', measured: r.absM, expected: '> 0.99', pass: r.absM > 0.99 });
  }
  for (const T of [1.8, 2.1]) {
    const exact = onsagerMagnetization(T);
    const r = await measure('square', T, 0, 'up', 800, 120);
    checks.push({
      name: `square T=${T}: |m| vs Onsager ${exact.toFixed(4)}`,
      measured: r.absM,
      expected: '±3%',
      pass: near(r.absM, exact, 0.03 * Math.max(exact, 0.1)),
    });
  }
  {
    const r = await measure('triangular', 0.2, 0, 'up', 200, 20);
    checks.push({ name: 'triangular T=0.2: e → −3', measured: r.e, expected: '±0.03', pass: near(r.e, -3, 0.03) });
    checks.push({ name: 'triangular T=0.2: |m| → 1', measured: r.absM, expected: '> 0.99', pass: r.absM > 0.99 });
  }
  {
    // Below T_c = 3.641 the triangular lattice must be ordered; a broken 3-coloring
    // shifts or destroys the transition and fails this.
    const r = await measure('triangular', 3.0, 0, 'up', 600, 60);
    checks.push({ name: 'triangular T=3.0 (< T_c): ordered', measured: r.absM, expected: '|m| > 0.5', pass: r.absM > 0.5 });
  }
  {
    const r = await measure('triangular', 4.5, 0, 'random', 400, 60);
    checks.push({ name: 'triangular T=4.5 (> T_c): disordered', measured: r.absM, expected: '|m| < 0.15', pass: r.absM < 0.15 });
  }
  {
    const r = await measure('honeycomb', 0.2, 0, 'up', 200, 20);
    checks.push({ name: 'honeycomb T=0.2: e → −1.5', measured: r.e, expected: '±0.02', pass: near(r.e, -1.5, 0.02) });
  }
  {
    const r = await measure('honeycomb', 1.9, 0, 'random', 400, 60);
    checks.push({ name: 'honeycomb T=1.9 (> T_c): disordered', measured: r.absM, expected: '|m| < 0.2', pass: r.absM < 0.2 });
  }
  {
    const r = await measure('square', 1.5, 0.5, 'random', 300, 20);
    const { m } = await sampleOnce();
    checks.push({ name: 'square T=1.5, h=+0.5: m follows h', measured: m, expected: 'm > 0.9', pass: m > 0.9 && r.absM > 0.9 });
  }

  const failed = checks.filter((c) => !c.pass);
  console.table(
    checks.map((c) => ({ check: c.name, measured: c.measured.toFixed(4), expected: c.expected, result: c.pass ? 'PASS' : 'FAIL' })),
  );
  console.log(failed.length === 0 ? '[selftest] ALL PASS' : `[selftest] ${failed.length} FAILED`);
}
