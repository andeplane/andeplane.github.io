/**
 * CPU reference checks for the ripple computer, run as part of `npm run build`.
 *
 * The same solver drives the rendered tank and the in-page training, so these
 * tests check the claims the page makes:
 *  1. the tank is a sane wave medium (no water created, no blow-up, waves arrive
 *     at the probes when the wave speed says they should);
 *  2. XOR is learnable by a linear readout from the water's probe features,
 *     on held-out noisy trials;
 *  3. XOR is *not* learnable by the same linear readout from the raw input bits.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLayout, C2, WaveTank } from '../src/sim/tank.ts';
import { driveAt, makeDataset, runTrial, xorStimulus, XOR_PADDLES, XOR_STEPS } from '../src/sim/tasks.ts';
import { accuracy, trainReadout } from '../src/sim/readout.ts';

const layout = buildLayout();

test('layout is deterministic and probes sit in open water', () => {
  const again = buildLayout();
  assert.deepEqual(again.pillars, layout.pillars);
  assert.equal(layout.probes.length, 16);
  assert.ok(layout.pillars.length >= 15, `expected a pillar field, got ${layout.pillars.length}`);
  for (const p of layout.probes) {
    assert.equal(layout.solid[Math.floor(p.y) * layout.nx + Math.floor(p.x)], 0, 'probe inside a pillar');
  }
});

test('the paddles move water around but never create or destroy it, and the tank settles', () => {
  const tank = new WaveTank(layout);
  const stim = xorStimulus(1, 1);
  let peak = 0;
  for (let t = 0; t < 1200; t++) {
    driveAt(stim, t, tank.drive);
    tank.step();
    peak = Math.max(peak, tank.energy());
  }
  let mass = 0;
  for (let i = 0; i < tank.u.length; i++) mass += tank.u[i];
  assert.ok(Number.isFinite(peak) && peak > 1, `energy should rise while driven (peak ${peak})`);
  assert.ok(Math.abs(mass) < 1e-2, `net water volume should stay zero, got ${mass}`);
  assert.ok(tank.energy() < 0.25 * peak, 'beaches and damping should calm the tank');
});

test('ripples reach a probe when the wave speed says they should', () => {
  const tank = new WaveTank(layout);
  const rec = runTrial(tank, xorStimulus(1, 0));
  const P = layout.probes.length;
  // Nearest probe to paddle A, and its straight-line distance.
  const a = layout.paddles[XOR_PADDLES[0]];
  let best = 0;
  let bestD = Infinity;
  layout.probes.forEach((p, k) => {
    const d = Math.hypot(p.x - layout.paddleX, p.y - a.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  let first = -1;
  for (let t = 0; t < XOR_STEPS; t++) {
    if (Math.abs(rec[t * P + best]) > 2e-3) {
      first = t;
      break;
    }
  }
  const c = Math.sqrt(C2); // cells per step
  assert.ok(first > 0, 'the probe never saw a ripple');
  // Arrival cannot beat the wave speed (plus the burst rise time) and should not be much later.
  assert.ok(first >= 0.85 * (bestD / c), `arrived too early: step ${first}, distance ${bestD.toFixed(1)}`);
  assert.ok(first <= bestD / c + 60, `arrived too late: step ${first}, distance ${bestD.toFixed(1)}`);
});

test('a linear readout learns XOR from the water, but not from the raw bits', () => {
  const tank = new WaveTank(layout);
  const train = makeDataset('xor', tank, 24, 1);
  const testSet = makeDataset('xor', tank, 24, 2, 1000);
  const y = train.map((s) => s.label);
  const yt = testSet.map((s) => s.label);

  const water = trainReadout(train.map((s) => s.x), y, 2, 0.1);
  const waterAcc = accuracy(water, testSet.map((s) => s.x), yt);
  const raw = trainReadout(train.map((s) => s.raw), y, 2, 0.1);
  const rawAcc = accuracy(raw, testSet.map((s) => s.raw), yt);

  assert.ok(waterAcc >= 0.95, `water readout should solve XOR on held-out trials, got ${waterAcc}`);
  assert.ok(rawAcc <= 0.75, `a linear readout on the raw bits cannot do XOR, got ${rawAcc}`);
});
