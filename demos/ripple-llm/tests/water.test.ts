/**
 * The tanks really compute what the exhibit claims.
 *
 *  - every Chapter 1 tank's in-phase transfer matrix, from a fresh Helmholtz solve
 *    of its committed floor, equals its target W to within 1e-3;
 *  - the time-domain tank (the one you watch) settles to the same answer;
 *  - the tiny language model run through all 24 tanks agrees with the exact digital
 *    model on held-out names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specOf, type BankMeta } from '../src/sim/bank.ts';
import { inPhase, steadyState } from '../src/sim/helmholtz.ts';
import { runTimeDomain } from '../src/sim/tank.ts';
import { TARGETS } from '../src/model/targets.ts';
import { agreement, allTiles, GAIN, waterMul, type Weights } from '../src/model/llm.ts';
import { gauss, mulberry32 } from '../src/sim/rng.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(readFileSync(join(here, '../src/data/tanks.json'), 'utf8')) as BankMeta;
const buf = readFileSync(join(here, '../src/data/tanks.bin'));
const words = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
const model = JSON.parse(readFileSync(join(here, '../src/data/model.json'), 'utf8')) as { weights: Weights; testNames: string[] };

test('bank is consistent with the code', () => {
  assert.equal(bank.gain, GAIN);
  assert.equal(bank.tanks.length, TARGETS.length + allTiles(model.weights).length);
  for (const t of bank.tanks) assert.ok(t.loss < 1e-8, `${t.id} design residual ${t.loss}`);
});

test('Chapter 1: each sculpted tank computes its matrix (Helmholtz, |Re T/G − W| < 1e-3)', () => {
  for (const target of TARGETS) {
    const meta = bank.tanks.find((t) => t.id === target.id)!;
    const ss = steadyState(specOf(meta, words), false);
    let err = 0;
    target.W.forEach((row, i) => row.forEach((w, j) => (err = Math.max(err, Math.abs(ss.Tre[i][j] / GAIN - w)))));
    assert.ok(err < 1e-3, `${target.id}: max entry error ${err}`);
  }
});

test('Chapter 1: the time-domain tank settles to W·x (lock-in reading within 5e-3)', () => {
  for (const target of TARGETS) {
    const meta = bank.tanks.find((t) => t.id === target.id)!;
    const x = target.examples[1];
    const exact = target.W.map((row) => row.reduce((s, w, j) => s + w * x[j], 0));
    const td = runTimeDomain(specOf(meta, words), x);
    td.re.forEach((v, i) => assert.ok(Math.abs(v / GAIN - exact[i]) < 5e-3, `${target.id} probe ${i}: ${v / GAIN} vs ${exact[i]}`));
  }
});

test('Chapter 2: a model tile in the time domain matches its steady-state solve', () => {
  const meta = bank.tanks.find((t) => t.id === 'L2-12')!;
  const spec = specOf(meta, words);
  const x = [0.3, -0.9, 0.5, 0.1, -0.4, 0.8, -0.2, 0.6];
  const fd = inPhase(steadyState(spec, false).Tre, x);
  const td = runTimeDomain(spec, x);
  fd.forEach((v, i) => assert.ok(Math.abs(td.re[i] - v) / GAIN < 5e-3, `probe ${i}`));
});

test('Chapter 2: the water-run language model agrees with the digital one', () => {
  const tiles = allTiles(model.weights);
  const Tre = tiles.map((t) => {
    const meta = bank.tanks.find((m) => m.layer === t.layer && m.r === t.r && m.c === t.c)!;
    return steadyState(specOf(meta, words), false).Tre;
  });
  const a = agreement(model.weights, model.testNames, waterMul(model.weights, tiles, Tre));
  console.log(
    `  ${a.n} predictions: top-1 agreement ${(a.top1 * 100).toFixed(2)}%, mean KL ${a.kl.toExponential(2)} nats, loss water ${a.lossWater.toFixed(4)} vs exact ${a.lossExact.toFixed(4)}`,
  );
  assert.ok(a.n > 2000);
  assert.ok(a.top1 >= 0.995, `top-1 agreement ${a.top1}`);
  assert.ok(a.kl < 1e-5, `KL ${a.kl}`);

  // Analogue noise on every probe reading degrades it gracefully, not catastrophically.
  const rand = mulberry32(5);
  const noisy = agreement(model.weights, model.testNames, waterMul(model.weights, tiles, Tre, () => 0.1 * gauss(rand)));
  console.log(`  with probe noise σ = 0.1: top-1 ${(noisy.top1 * 100).toFixed(2)}%, KL ${noisy.kl.toExponential(2)}`);
  assert.ok(noisy.top1 > 0.7 && noisy.top1 < a.top1);
});
