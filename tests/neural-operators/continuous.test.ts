import assert from 'node:assert/strict';
import { test } from 'node:test';
import { points, cellWidths, probe, applyIntegral, smoothKernel, reference, error, createTrainer, trainingPairs, trainKernel, neuralKernel } from '../../src/features/neural-operators/labs/lib/continuous.ts';

test('nonuniform physical quadrature converges; equal weights retain density bias', () => {
  const ys = points(80), truth = reference(ys);
  const errors = [12, 96].map(n => {
    const xs = points(n, true), widths = cellWidths(xs), input = xs.map(x => probe(x));
    assert(widths.every(w => w > 0));
    assert(Math.abs(widths.reduce((a, b) => a + b) - 1) < 1e-12);
    return [error(applyIntegral(xs, input, ys), truth), error(applyIntegral(xs, input, ys, smoothKernel, false), truth)];
  });
  assert(errors[1][0] < errors[0][0] / 20);
  assert(errors[1][1] > 0.2);
});

for (const mode of ['difference', 'coordinates'] as const) test(`${mode} kernel learns and transfers across grids`, () => {
  const state = createTrainer(mode), pairs = trainingPairs(), ys = points(65);
  for (let step = 0; step < 1200; step++) trainKernel(state, pairs);
  assert(state.theta.length === (mode === "difference" ? 37 : 49));
  assert(state.loss < 3e-5);
  for (const seed of [0, 100, 101]) for (const n of [24, 96]) for (const clustered of [false, true]) {
    const xs = points(n, clustered);
    const prediction = applyIntegral(xs, xs.map(x => probe(x, seed)), ys, (x, y) => neuralKernel(state.theta, x, y, mode));
    assert(error(prediction, reference(ys, seed)) < 0.03, `seed=${seed}, n=${n}, clustered=${clustered}`);
  }
});

for (const mode of ['difference', 'coordinates'] as const) test(`${mode} supports every selectable width and source branch`, () => {
  for (let units = 1; units <= 12; units++) {
    const s = createTrainer(mode, true, units);
    assert.equal(s.theta.length, (mode === 'difference' ? 3 : 4) * units + 1);
    trainKernel(s, trainingPairs(true));
    assert(Number.isFinite(neuralKernel(s.theta, .3, .7, mode)));
    assert(s.withSource);
    assert(applyIntegral([.25, .75], [0, 0], [.4], (x,y) => neuralKernel(s.theta,x,y,mode))[0] === 0);
  }
});
