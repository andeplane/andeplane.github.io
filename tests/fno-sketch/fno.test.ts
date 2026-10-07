import assert from 'node:assert/strict';
import { test } from 'node:test';
import katex from 'katex';
import {
  N,
  FREQS,
  cabs,
  cadd,
  csub,
  cconj,
  cmul,
  ZERO,
  mulberry32,
  makeField,
  defaultMask,
  makeInput,
  makeWeights,
  identityR,
  lift,
  dft2,
  phasorTerms,
  keptModes,
  spectralPath,
  fnoLayer,
  relu,
  gelu,
  roll,
  modeIndex,
  pixelOf,
  halfPlaneCells,
  independentModes,
  fmt,
  fmtC,
} from '../../src/features/fno-sketch/lib/fno.ts';
import { TEX } from '../../src/features/fno-sketch/lib/tex.ts';

const close = (a: number, b: number, tol = 1e-12, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (|diff| ${Math.abs(a - b)})`);

function randomField(seed: number, C: number): number[][] {
  const rng = mulberry32(seed);
  return Array.from({ length: N }, () => Array.from({ length: C }, () => rng() * 2 - 1));
}

test('DFT matches its definition, and the phasor terms sum to it', () => {
  const v = randomField(3, 3);
  const vhat = dft2(v);
  for (const [k1, k2] of [[0, 0], [1, 0], [-2, 1], [2, -1], [1, 2]]) {
    for (let c = 0; c < 3; c++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          const theta = (-2 * Math.PI * (k1 * i + k2 * j)) / 5;
          re += v[i * 5 + j][c] * Math.cos(theta);
          im += v[i * 5 + j][c] * Math.sin(theta);
        }
      const z = vhat[modeIndex(k1, k2)][c];
      close(z.re, re, 1e-12, `re (${k1},${k2},${c})`);
      close(z.im, im, 1e-12, `im (${k1},${k2},${c})`);
      const sum = phasorTerms(v, c, k1, k2).reduce(cadd, ZERO);
      close(sum.re, z.re);
      close(sum.im, z.im);
    }
  }
  // v̂(0,0,c) = 25 × mean
  const mean = v.reduce((s, x) => s + x[0], 0) / N;
  close(vhat[modeIndex(0, 0)][0].re, 25 * mean);
});

test('a real field has a Hermitian spectrum with a real (0,0) mode', () => {
  const vhat = dft2(randomField(11, 2));
  for (const k1 of FREQS)
    for (const k2 of FREQS)
      for (let c = 0; c < 2; c++) {
        const d = csub(vhat[modeIndex(-k1, -k2)][c], cconj(vhat[modeIndex(k1, k2)][c]));
        assert.ok(cabs(d) < 1e-12);
      }
  assert.ok(Math.abs(vhat[modeIndex(0, 0)][0].im) < 1e-12);
});

test('R is Hermitian by construction, deterministic, and independent of the truncation', () => {
  const w = makeWeights(7, 4);
  for (const k1 of FREQS)
    for (const k2 of FREQS)
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const a = w.R[modeIndex(-k1, -k2)][r][c];
          const b = cconj(w.R[modeIndex(k1, k2)][r][c]);
          assert.ok(a.re === b.re && a.im === b.im, `R(${-k1},${-k2}) vs conj R(${k1},${k2})`);
        }
  for (const row of w.R[modeIndex(0, 0)]) for (const z of row) assert.equal(z.im, 0);
  assert.deepEqual(makeWeights(7, 4), w);
  assert.notDeepEqual(makeWeights(8, 4), w);

  // A surviving mode's R(k) is the same whether K = (1,1) or (2,2).
  const input = { T: makeField(1), mask: defaultMask() };
  const small = fnoLayer(input, w, { K1: 1, K2: 1, activation: 'relu', identity: false });
  const large = fnoLayer(input, w, { K1: 2, K2: 2, activation: 'relu', identity: false });
  for (const [k1, k2] of keptModes(1, 1)) {
    assert.deepEqual(small.R[modeIndex(k1, k2)], large.R[modeIndex(k1, k2)]);
    assert.deepEqual(small.mixed[modeIndex(k1, k2)], large.mixed[modeIndex(k1, k2)]);
  }
});

test('identity check: all modes with R = I reproduces v', () => {
  const v = randomField(5, 4);
  const { out, maxImag } = spectralPath(dft2(v), identityR(4), keptModes(2, 2));
  for (let p = 0; p < N; p++) for (let c = 0; c < 4; c++) close(out[p][c], v[p][c], 1e-12);
  assert.ok(maxImag < 1e-12);

  const r = fnoLayer({ T: makeField(2), mask: defaultMask() }, makeWeights(3, 5), {
    K1: 0, K2: 0, activation: 'gelu', identity: true,
  });
  assert.ok(r.roundTrip < 1e-12);
  assert.equal(r.kept.length, 25);
});

test('the inverse is real for every truncation', () => {
  const v = randomField(9, 3);
  const vhat = dft2(v);
  const w = makeWeights(21, 3);
  for (const K1 of [0, 1, 2])
    for (const K2 of [0, 1, 2]) {
      const { maxImag } = spectralPath(vhat, w.R, keptModes(K1, K2));
      assert.ok(maxImag < 1e-12, `K = (${K1},${K2}): ${maxImag}`);
    }
});

test('a single cosine mode lands in exactly one ± pair with 12.5', () => {
  const v = Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return [Math.cos((2 * Math.PI * (1 * i + 2 * j)) / 5)];
  });
  const vhat = dft2(v);
  for (const k1 of FREQS)
    for (const k2 of FREQS) {
      const z = vhat[modeIndex(k1, k2)][0];
      const expected = (k1 === 1 && k2 === 2) || (k1 === -1 && k2 === -2) ? 12.5 : 0;
      close(z.re, expected, 1e-12, `(${k1},${k2})`);
      close(z.im, 0, 1e-12, `(${k1},${k2})`);
    }
});

test('with K1 = K2 = 0 the spectral path returns R(0,0) times the channel means everywhere', () => {
  const v = randomField(13, 3);
  const w = makeWeights(4, 3);
  const { out } = spectralPath(dft2(v), w.R, keptModes(0, 0));
  const mean = [0, 1, 2].map((c) => v.reduce((s, x) => s + x[c], 0) / N);
  const expected = w.R[modeIndex(0, 0)].map((row) => row.reduce((s, z, c) => s + z.re * mean[c], 0));
  for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) close(out[p][c], expected[c]);
});

test('kept-mode counts and symmetry', () => {
  for (const K1 of [0, 1, 2])
    for (const K2 of [0, 1, 2]) {
      const kept = keptModes(K1, K2);
      assert.equal(kept.length, (2 * K1 + 1) * (2 * K2 + 1));
      const keys = new Set(kept.map(([a, b]) => `${a},${b}`));
      for (const [a, b] of kept) assert.ok(keys.has(`${-a || 0},${-b || 0}`));
      assert.equal(halfPlaneCells(K1, K2), (2 * K1 + 1) * (K2 + 1));
      // Independent complex modes: the full box minus conjugate duplicates.
      // Only (0,0) is its own conjugate, so the full box holds (|box| + 1) / 2 independent modes.
      assert.equal(independentModes(K1, K2), (kept.length + 1) / 2);
    }
  assert.equal(independentModes(1, 1), 5); // (0,0), (1,0), (−1,1), (0,1), (1,1)
  assert.equal(independentModes(2, 2), 13); // (25 + 1) / 2
});

test('the lift is per-pixel affine', () => {
  const T = makeField(4);
  const mask = defaultMask();
  const a = makeInput(T, mask);
  const w = makeWeights(6, 3);
  const v = lift(a, w.P, w.bP);
  const p = 7; // (i, j) = (1, 2)
  assert.deepEqual(a[p], [T[p], mask[p], 0.2, 0.4]);
  for (let r = 0; r < 3; r++) {
    const byHand =
      w.P[r][0] * T[p] + w.P[r][1] * mask[p] + w.P[r][2] * 0.2 + w.P[r][3] * 0.4 + w.bP[r];
    close(v[p][r], byHand);
  }
});

test('the spectral path commutes with shifts of v', () => {
  const v = randomField(17, 3);
  const w = makeWeights(19, 3);
  const kept = keptModes(1, 2);
  const shiftedFirst = spectralPath(dft2(roll(v, 1, 2)), w.R, kept).out;
  const shiftedAfter = roll(spectralPath(dft2(v), w.R, kept).out, 1, 2);
  for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) close(shiftedFirst[p][c], shiftedAfter[p][c]);
});

test('activations', () => {
  assert.equal(relu(-1), 0);
  assert.equal(relu(2), 2);
  assert.equal(gelu(0), 0);
  close(gelu(3), 2.9964, 5e-4);
});

test('inputs: field in [0,1], ring mask, coordinate channels', () => {
  const T = makeField(1);
  assert.equal(T.length, 25);
  for (const t of T) assert.ok(t >= 0 && t <= 1);
  assert.deepEqual(makeField(1), T);
  const m = defaultMask();
  assert.equal(m.reduce((s, x) => s + x, 0), 16);
  assert.equal(m[12], 0);
});

test('display formats', () => {
  assert.equal(fmt(-0.001), '0.00');
  assert.equal(fmt(-1.234), '−1.23');
  assert.equal(fmtC({ re: 1, im: -0.5 }), '1.00 − 0.50i');
  assert.equal(fmtC({ re: 0, im: -0.0001 }), '0.00 + 0.00i');
  assert.deepEqual(cmul({ re: 0, im: 1 }, { re: 0, im: 1 }), { re: -1, im: 0 });
});

test('every TeX string on the page renders under KaTeX strict mode', () => {
  for (const [key, tex] of Object.entries(TEX)) {
    assert.ok(/^[\x20-\x7e]*$/.test(tex), `${key} is not printable ASCII`);
    assert.doesNotThrow(
      () => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'error', output: 'htmlAndMathml' }),
      key,
    );
  }
});
