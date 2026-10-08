import { describe, expect, it } from 'vitest';
import { CpuCrossbar, exactMatvec } from './matrix.ts';
import { LatticeCrossbar } from './lattice.ts';
import { gaussianStream, IDEAL, type CrossbarSettings } from './tile.ts';

function rel(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let e = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    e += (a[i] - b[i]) ** 2;
    n += b[i] ** 2;
  }
  return Math.sqrt(e / n);
}

function data(K: number, N: number, seed: number, signed = true) {
  const rnd = gaussianStream(seed);
  const W = new Float32Array(K * N).map(() => rnd());
  const xs = Array.from({ length: 8 }, () => new Float32Array(K).map(() => (signed ? rnd() : Math.abs(rnd()))));
  return { W, xs };
}

const MUSEUM: CrossbarSettings = { bits: 6, noise: 0.005, lambda: 3e-5, seed: 7, errors: 'hash' };

describe('lattice crossbar (the big models’ water)', () => {
  it('equals CpuCrossbar with hashed errors and first-order manifolds, signed and unsigned', () => {
    for (const [K, N, signed] of [
      [64, 64, true],
      [70, 130, true],
      [100, 64, false],
      [17, 5, false],
    ] as const) {
      for (const s of [MUSEUM, { ...MUSEUM, bits: null }, { ...MUSEUM, lambda: 0 }, { ...MUSEUM, noise: 0 }, { bits: 3, noise: 0.05, lambda: 1e-3, seed: 2, errors: 'hash' as const }]) {
        const { W, xs } = data(K, N, K * 31 + N, signed);
        const ref = new CpuCrossbar('m', W, K, N, signed, { ...s, ir: 'first-order' });
        const lat = new LatticeCrossbar('m', W, K, N, signed, s);
        for (const x of xs) expect(rel(lat.matvec(x), ref.matvec(x))).toBeLessThan(2e-6);
      }
    }
  });

  it('is exact in the ideal case', () => {
    const { W, xs } = data(70, 90, 5);
    const lat = new LatticeCrossbar('m', W, 70, 90, true, IDEAL);
    for (const x of xs) expect(rel(lat.matvec(x), exactMatvec(W, 70, 90, x))).toBeLessThan(1e-6);
  });

  it('first-order manifolds track the full network solve (λ = 3·10⁻⁵, 128 × 128 valves)', () => {
    const { W, xs } = data(64, 64, 11);
    const s: CrossbarSettings = { bits: null, noise: 0, lambda: 3e-5, seed: 1 };
    const exact = new CpuCrossbar('m', W, 64, 64, true, s);
    exact.commissionSync();
    const fo = new CpuCrossbar('m', W, 64, 64, true, { ...s, ir: 'first-order' });
    let irErr = 0;
    let approxErr = 0;
    for (const x of xs) {
      const ye = exactMatvec(W, 64, 64, x);
      const yn = exact.matvec(x);
      irErr += rel(yn, ye);
      approxErr += rel(fo.matvec(x), yn);
    }
    // The IR error left after calibration is ~1%; first order reproduces it to a small fraction.
    expect(irErr / xs.length).toBeGreaterThan(3e-3);
    expect(approxErr / xs.length).toBeLessThan(0.25 * (irErr / xs.length));
  });

  it('hashed valve errors have the same size as streamed ones', () => {
    const { W, xs } = data(64, 64, 3);
    const base: CrossbarSettings = { bits: null, noise: 0.01, lambda: 0, seed: 4 };
    const a = new CpuCrossbar('m', W, 64, 64, true, base);
    const b = new CpuCrossbar('m', W, 64, 64, true, { ...base, errors: 'hash' });
    let ea = 0;
    let eb = 0;
    for (const x of xs) {
      const ye = exactMatvec(W, 64, 64, x);
      ea += rel(a.matvec(x), ye);
      eb += rel(b.matvec(x), ye);
    }
    expect(eb / ea).toBeGreaterThan(0.7);
    expect(eb / ea).toBeLessThan(1.4);
  });
});
