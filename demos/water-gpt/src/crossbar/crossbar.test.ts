import { describe, expect, it } from 'vitest';
import { CrossbarNetwork, denseSolve } from './network.ts';
import { CpuCrossbar, exactMatvec } from './matrix.ts';
import { gaussianStream, IDEAL, type CrossbarSettings } from './tile.ts';

const rnd = gaussianStream(42);

function relErr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let e = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    e += (a[i] - b[i]) ** 2;
    n += b[i] ** 2;
  }
  return Math.sqrt(e / n);
}

/** Relative RMS error of a crossbar over many random signed inputs. */
function crossbarError(K: number, N: number, settings: CrossbarSettings, signed = true): number {
  const W = new Float32Array(K * N).map(() => rnd());
  const cb = new CpuCrossbar('test', W, K, N, signed, settings);
  cb.commissionSync();
  let e = 0;
  let n = 0;
  for (let t = 0; t < 16; t++) {
    const x = new Float32Array(K).map(() => (signed ? rnd() : Math.abs(rnd())));
    const y = cb.matvec(x);
    const ye = exactMatvec(W, K, N, x);
    for (let j = 0; j < N; j++) {
      e += (y[j] - ye[j]) ** 2;
      n += ye[j] ** 2;
    }
  }
  return Math.sqrt(e / n);
}

describe('hydraulic network', () => {
  it('line relaxation matches a dense direct solve of the same network', () => {
    const R = 4;
    const C = 5;
    const g = Array.from({ length: R * C }, (_, i) => ((i * 37) % 11) / 10);
    const s = [0.2, 1, 0.6, 0.9];
    for (const lambda of [0.01, 0.1, 0.5]) {
      const q = new CrossbarNetwork(R, C, g, lambda).solve(s).q;
      expect(relErr(q, denseSolve(R, C, g, lambda, s))).toBeLessThan(1e-9);
    }
  });

  it('conserves mass: total valve flow equals total collector outflow', () => {
    const g = Array.from({ length: 6 * 8 }, () => Math.random());
    const net = new CrossbarNetwork(6, 8, g, 0.02);
    const sol = net.solve([1, 0.5, 0.2, 0.9, 0, 0.3]);
    const f = net.segmentFlows(sol);
    const valves = f.valve.reduce((a, b) => a + b, 0);
    const out = sol.q.reduce((a, b) => a + b, 0);
    expect(Math.abs(valves - out) / out).toBeLessThan(1e-8);
  });

  it('transfer matrix (superposition) reproduces a direct solve', () => {
    const g = Array.from({ length: 6 * 4 }, () => Math.random());
    const net = new CrossbarNetwork(6, 4, g, 0.05);
    const T = net.transferMatrix();
    const s = [0.1, 0.7, 0.3, 1, 0.5, 0.2];
    const q = net.solve(s).q;
    const qT = new Float64Array(4);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) qT[j] += T[j * 6 + i] * s[i];
    expect(relErr(qT, q)).toBeLessThan(1e-9);
  });
});

describe('crossbar matrix–vector product', () => {
  it('is exactly W·x in the ideal case (continuous valves, no error, no manifold loss)', () => {
    for (const [K, N] of [
      [4, 4],
      [32, 96],
      [128, 32],
      [70, 130],
    ]) {
      expect(crossbarError(K, N, IDEAL)).toBeLessThan(1e-6);
      expect(crossbarError(K, N, IDEAL, false)).toBeLessThan(1e-6);
    }
  });

  it('stays within stated tolerances with each non-ideality (64×64 tile, 128×128 valves)', () => {
    // 6-bit valves: ≈1.6% relative RMS error
    expect(crossbarError(64, 64, { ...IDEAL, bits: 6 })).toBeLessThan(0.025);
    // 0.5% valve programming error: ≈2%
    expect(crossbarError(64, 64, { ...IDEAL, noise: 0.005 })).toBeLessThan(0.03);
    // manifold resistance λ = 3e-5 after calibration: ≈0.8%
    expect(crossbarError(64, 64, { ...IDEAL, lambda: 3e-5 })).toBeLessThan(0.015);
    // all three together (the exhibit's default): under 4%
    expect(crossbarError(64, 64, { bits: 6, noise: 0.005, lambda: 3e-5, seed: 3 })).toBeLessThan(0.04);
  });

  it('a non-negative-input tile has no x⁻ reservoirs', () => {
    const cb = new CpuCrossbar('relu', new Float32Array(8 * 3).fill(1), 8, 3, false, IDEAL);
    expect(cb.tiles[0].tile.R).toBe(8);
    expect(cb.tiles[0].tile.C).toBe(6);
  });
});
