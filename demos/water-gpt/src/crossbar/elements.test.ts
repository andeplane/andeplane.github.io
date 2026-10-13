import { describe, expect, it } from 'vitest';
import { waterActivation, waterLayerNorm, waterSoftmax } from './elements.ts';
import { layerNorm, softmax } from '../modes/calc/forward.ts';
import { geluNew } from '../big/model.ts';

const IDEAL = { noise: 0, seed: 1 };
const REAL = { noise: 0.005, seed: 1 };

function vec(n: number, seed: number): Float32Array {
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.sin(i * 1.7 + seed) * 2 + Math.cos(i * 0.31 * seed);
  return v;
}

function maxAbs(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe('hydraulic circuits', () => {
  const x = vec(64, 3);
  const g = vec(64, 5).map((v) => 1 + 0.2 * v);
  const b = vec(64, 7).map((v) => 0.1 * v);

  it('with perfect parts compute exactly the digital functions', () => {
    expect(maxAbs(waterLayerNorm(IDEAL, 'ln', x, g, b, 1e-5), layerNorm(x, g, b))).toBeLessThan(1e-5);
    const s = vec(40, 2);
    expect(maxAbs(waterSoftmax(IDEAL, 'sm', 0, s, 0.5), softmax(s.map((v) => v * 0.5)))).toBeLessThan(1e-6);
    expect(maxAbs(waterActivation(IDEAL, 'a', 'gelu', x.slice()), x.map(geluNew))).toBeLessThan(1e-6);
    expect(maxAbs(waterActivation(IDEAL, 'a', 'relu', x.slice()), x.map((v) => Math.max(0, v)))).toBeLessThan(1e-7);
  });

  it('with 0.5% part tolerances stay close, and the flow divider still sums to one', () => {
    const ln = waterLayerNorm(REAL, 'ln', x, g, b, 1e-5);
    expect(maxAbs(ln, layerNorm(x, g, b))).toBeLessThan(0.05);
    const p = waterSoftmax(REAL, 'sm', 0, vec(40, 2), 0.5);
    expect(Math.abs(p.reduce((a, v) => a + v, 0) - 1)).toBeLessThan(1e-6);
    expect(maxAbs(p, softmax(vec(40, 2).map((v) => v * 0.5)))).toBeLessThan(0.01);
    const relu = waterActivation(REAL, 'a', 'relu', x.slice());
    for (let i = 0; i < x.length; i++) if (x[i] <= 0) expect(relu[i]).toBeCloseTo(0, 12);
  });

  it('give every circuit its own parts (different tags, different errors)', () => {
    const a = waterLayerNorm(REAL, 'l0.ln1', x, g, b, 1e-5);
    const c = waterLayerNorm(REAL, 'l0.ln2', x, g, b, 1e-5);
    expect(maxAbs(a, c)).toBeGreaterThan(0);
  });
});
