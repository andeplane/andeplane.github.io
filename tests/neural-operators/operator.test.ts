import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coefficients,
  field,
  project,
  modes,
  dataset,
  trainStep,
  relativeError,
  interpolate,
  spatialField,
  average,
} from '../../src/features/neural-operators/labs/lib/operator.ts';

test('DFT round-trips a resolved band-limited control field', () => {
  const a = coefficients(9);
  assert(
    relativeError(field(project(field(a, 16), 16), 96), field(a, 96)) < 1e-12,
  );
});

test('spatial spots are not perfectly reconstructed from 8x8; error plateaus under mode truncation', () => {
  const truth = spatialField(42, 96);
  const errors = [4, 8, 16].map((n) => {
    const pixels = spatialField(42, n);
    const a = project(pixels, n).map((c, k) =>
      Math.max(modes[k][0], Math.abs(modes[k][1])) < n / 2 ? c : { c: 0, s: 0 },
    );
    return relativeError(
      field(a, 96).map((v) => v + average(pixels)),
      truth,
    );
  });
  assert(errors[0] > errors[1] && errors[1] > errors[2]);
  assert(errors[1] > 0.1 && errors[2] > 0.05);
});

test('training on spatial Gaussian pairs reduces error on held-out fields', () => {
  const data = dataset(0.02, 0.3);
  let weights = modes.map(() => 0.1);
  const first = trainStep(weights, data).loss;
  let loss = first;
  for (let i = 0; i < 400; i++) {
    const result = trainStep(weights, data);
    weights = result.weights;
    loss = result.loss;
  }
  assert(loss < first * 0.01);
  for (const seed of [42, 43, 901]) {
    const pixels = spatialField(seed, 16);
    const a = project(pixels, 16);
    for (const n of [16, 64, 96]) {
      const pred = field(a, n, weights).map((v) => v + average(pixels));
      const truth = spatialField(seed, n, 0.3, 0.02);
      assert(relativeError(pred, truth) < 0.05);
    }
  }
});

test('spatial analytic heat reference conserves mean and dissipates energy', () => {
  const initial = spatialField(42, 96),
    future = spatialField(42, 96, 0.3, 0.02);
  assert(Math.abs(average(initial) - average(future)) < 1e-10);
  assert(
    future.reduce((s, v) => s + v * v, 0) <
      initial.reduce((s, v) => s + v * v, 0),
  );
});

test('bilinear interpolation preserves sampled values and wraps periodically', () => {
  const u = spatialField(42, 16);
  assert(relativeError(interpolate(u, 16, 16), u) < 1e-12);
  const fine = interpolate(u, 16, 32);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      assert.equal(fine[y * 2 * 32 + x * 2], u[y * 16 + x]);
  assert.equal(fine[31], (u[15] + u[0]) / 2);
});
