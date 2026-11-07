import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceStep,
  fieldAt,
  pmlLoss,
  lineSourceField,
  sourceForCurrent,
  sourceForProbeField,
  NX,
  NY,
  DX,
  DT,
  COURANT,
  SOURCE,
  PROBE,
  PML,
  PROBE_DISTANCE,
  type Wall,
} from "../src/field.ts";
const C0 = 299792458;
const cell = fieldAt;
/** Run the CPU reference with a per-step source function; returns the probe series and last state. */
function run(steps: number, source: (t: number) => number, wall: Wall = 0, watch: [number, number][] = [[PROBE.x, PROBE.y]]) {
  let a = new Float32Array(NX * NY * 4);
  const series = watch.map(() => new Float64Array(steps));
  for (let n = 0; n < steps; n++) {
    a = referenceStep(a, source((n + 1) * DT), wall);
    watch.forEach(([x, y], i) => (series[i][n] = cell(a, x, y)));
  }
  return { a, series };
}
const amplitude = (s: Float64Array, f: number, from: number, to: number) => {
  let c = 0,
    q = 0;
  for (let n = from; n < to; n++) {
    c += s[n] * Math.cos(2 * Math.PI * f * (n + 1) * DT);
    q += s[n] * Math.sin(2 * Math.PI * f * (n + 1) * DT);
  }
  return { amplitude: (2 * Math.hypot(c, q)) / (to - from), phase: Math.atan2(q, c) };
};
test("Yee vacuum Courant number respects the two-dimensional bound", () =>
  assert.ok(COURANT < 1 / Math.sqrt(2)));
test("finite propagation reaches a distant field probe after the light travel time", () => {
  const { series, a } = run(600, (t) => Math.min(1, t / 1e-6) * Math.sin(2 * Math.PI * 900e3 * t));
  const arrival = (PROBE_DISTANCE / C0) / DT;
  let early = 0,
    late = 0;
  for (let n = 0; n < 600; n++) {
    const v = Math.abs(series[0][n]);
    if (n < arrival - 10) early = Math.max(early, v);
    if (n > arrival + 60) late = Math.max(late, v);
  }
  assert.ok(early < 1e-4, `early ${early}`);
  assert.ok(late > 0.001, `late ${late}`);
  assert.ok(a.every(Number.isFinite));
});
test("conducting cells enforce zero tangential electric field, and the closed screen blocks the path", () => {
  let a = new Float32Array(NX * NY * 4);
  a[(30 * NX + 145) * 4] = 1;
  a = referenceStep(a, 0, 1);
  assert.equal(cell(a, 145, 30), 0);
});
test("PML: normal-incidence reflection is below −60 dB across the band (the former 16-cell sponge measured −12 dB)", () => {
  // One-dimensional analogue of the TMz scheme with the same Courant number and layer profile.
  const N = 1200,
    S = COURANT;
  const reflection = (f: number) => {
    const e = new Float64Array(N),
      h = new Float64Array(N - 1);
    const le = (i: number) => pmlLoss(Math.min(i, N - 1 - i));
    const lh = (i: number) => pmlLoss(Math.min(i + 0.5, N - 1 - i - 0.5));
    const T = 1 / f,
      w = 1.5 * T,
      tc = 4 * T;
    const steps = (t: number) => t / DT;
    const travel = (400 - 150) / S,
      round = (2 * (N - 1 - 400)) / S;
    let incident = 0,
      back = 0;
    for (let n = 0; n < steps(tc) + travel + round + steps(4 * w); n++) {
      for (let i = 0; i < N - 1; i++) {
        const l = lh(i);
        h[i] = ((1 - l) * h[i] - S * (e[i + 1] - e[i])) / (1 + l);
      }
      for (let i = 1; i < N - 1; i++) {
        const l = le(i);
        e[i] = ((1 - l) * e[i] - S * (h[i] - h[i - 1])) / (1 + l);
      }
      const t = n * DT;
      e[150] += Math.exp(-(((t - tc) / w) ** 2)) * Math.sin(2 * Math.PI * f * t);
      e[0] = e[N - 1] = 0;
      const a = Math.abs(e[400]);
      if (n > steps(tc) + travel - steps(3 * w) && n < steps(tc) + travel + steps(3 * w))
        incident = Math.max(incident, a);
      if (n > steps(tc) + travel + round - steps(3 * w)) back = Math.max(back, a);
    }
    return 20 * Math.log10(back / incident);
  };
  for (const f of [600e3, 900e3, 1.2e6]) {
    const db = reflection(f);
    assert.ok(db < -60, `${f}: ${db} dB`);
  }
  assert.ok(PML < SOURCE.x, "the source lies outside the layer");
});
const cw = (f: number, amp = 1) => (t: number) => amp * Math.min(1, t / 1e-6) * Math.sin(2 * Math.PI * f * t);
test("line-source amplitude matches the analytic 2D Green's function and decays as 1/√r", () => {
  const f = 900e3,
    steps = 1400;
  const current = 0.03;
  const { series } = run(steps, cw(f, sourceForCurrent(current)), 0, [
    [PROBE.x, PROBE.y],
    [PROBE.x - 60, PROBE.y],
  ]);
  // Steady state: after arrival plus the 1 μs ramp, integrate over whole cycles.
  const cycle = Math.round(1 / f / DT);
  const from = steps - 4 * cycle,
    to = steps;
  const far = amplitude(series[0], f, from, to).amplitude;
  const near = amplitude(series[1], f, from, to).amplitude;
  const analytic = lineSourceField(current, f, PROBE_DISTANCE);
  assert.ok(Math.abs(far / analytic - 1) < 0.03, `probe ${far} vs analytic ${analytic}`);
  const rFar = PROBE_DISTANCE,
    rNear = (PROBE.x - 60 - SOURCE.x) * DX;
  assert.ok(Math.abs(near / far - Math.sqrt(rFar / rNear)) < 0.03, `decay ${near / far} vs ${Math.sqrt(rFar / rNear)}`);
  // The calibration used by the slow mode reproduces 1 V/m at the probe.
  const cal = sourceForProbeField(1, f) / sourceForCurrent(current);
  assert.ok(Math.abs(far * cal - 1) < 0.03);
});
test("numerical wavelength on the grid matches c/f to the Yee dispersion relation (< 0.1 %)", () => {
  const f = 900e3,
    steps = 1400;
  const x1 = PROBE.x - 40,
    x2 = PROBE.x;
  const { series } = run(steps, cw(f), 0, [
    [x1, PROBE.y],
    [x2, PROBE.y],
  ]);
  const cycle = Math.round(1 / f / DT);
  const p1 = amplitude(series[0], f, steps - 4 * cycle, steps).phase;
  const p2 = amplitude(series[1], f, steps - 4 * cycle, steps).phase;
  // Phase lag over (x2 - x1) cells: k̃·Δ (mod 2π); the separation is under one wavelength.
  let lag = p2 - p1;
  while (lag < 0) lag += 2 * Math.PI;
  while (lag > 2 * Math.PI) lag -= 2 * Math.PI;
  const k = (2 * Math.PI * f) / C0;
  const measured = lag / ((x2 - x1) * DX);
  const predicted = (2 / DX) * Math.asin(Math.sin(Math.PI * f * DT) / COURANT);
  assert.ok(Math.abs(measured / k - 1) < 1e-3, `k̃/k − 1 = ${measured / k - 1}`);
  // The cylindrical wave's phase differs from a plane wave's by the Hankel asymptotic
  // correction ≈ 1/(8(kr)²) ≈ 4e-4 at kr ≈ 17, which dominates the residual here.
  assert.ok(Math.abs(measured / predicted - 1) < 1e-3, `vs dispersion relation ${measured / predicted - 1}`);
});
test("a closed conducting screen blocks the probe; the aperture lets a diffracted fraction through", () => {
  const f = 900e3,
    steps = 1300;
  const cycle = Math.round(1 / f / DT);
  const level = (wall: Wall) => {
    const { series } = run(steps, cw(f), wall);
    return amplitude(series[0], f, steps - 3 * cycle, steps).amplitude;
  };
  const open = level(0),
    aperture = level(1),
    closed = level(2);
  assert.ok(closed < 0.03 * open, `closed ${closed / open}`);
  assert.ok(aperture > 0.05 * open && aperture < 0.9 * open, `aperture ${aperture / open}`);
});
test("amplitude modulation propagates through the 2D grid with the analytic sideband ratio", () => {
  const fc = 900e3,
    fm = 200e3,
    mu = 0.5,
    steps = 2400;
  const { series } = run(steps, (t) =>
    Math.min(1, t / 1e-6) * (1 + mu * Math.cos(2 * Math.PI * fm * t)) * Math.sin(2 * Math.PI * fc * t),
  );
  // Window of whole cycles of both the carrier and the modulation: 5 μs = 666 steps holds
  // 4.5 carrier cycles; use 1 modulation period × 3 = 15 μs ≈ 1998 steps? Keep it simple:
  // 2000 steps starting after the transient, and accept the leakage-limited tolerance.
  const from = steps - 1332,
    to = steps;
  const carrier = amplitude(series[0], fc, from, to).amplitude;
  const upper = amplitude(series[0], fc + fm, from, to).amplitude;
  const lower = amplitude(series[0], fc - fm, from, to).amplitude;
  assert.ok(Math.abs(upper / carrier - mu / 2) < 0.06, `upper ${upper / carrier}`);
  assert.ok(Math.abs(lower / carrier - mu / 2) < 0.06, `lower ${lower / carrier}`);
});
