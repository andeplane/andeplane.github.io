import { test } from "node:test";
import assert from "node:assert/strict";
import { Propagation, LAYOUT, COURANT_1D } from "../src/propagation.ts";
import { C0, ETA0 } from "../src/antenna.ts";
import { sheetForField, sourceCalibration, CARRIERS } from "../src/physics.ts";
const DT = 1 / 24576000;
test("a current sheet radiates η₀J/2 that arrives at the receiver after d/c, to the numerical dispersion limit", () => {
  const p = new Propagation(DT);
  const f = 900e3,
    J = sheetForField(1) * sourceCalibration(f, DT, COURANT_1D); // 1 V/m per direction
  const rx: number[] = [];
  const sheets = [0, 0, 0, 0, 0];
  for (let n = 0; n < 4000; n++) {
    sheets[2] = J * Math.sin(2 * Math.PI * f * n * DT);
    rx.push(p.step(sheets));
  }
  const delay = p.distance(2) / C0;
  assert.ok(Math.abs(p.distance(2) - ((LAYOUT.receiver - LAYOUT.sources[2]) * C0 * DT) / COURANT_1D) < 1e-9);
  // Retardation: after the transient the receiver sees -η₀J/2 delayed by the light travel
  // time plus the half-step latency of an additive source (its value at step n enters the
  // field at n+1). The Yee dispersion relation predicts a phase-velocity error of 1e-4.
  let worst = 0;
  for (let n = 1000; n < 4000; n++) {
    const expected = -Math.sin(2 * Math.PI * f * ((n + 0.5) * DT - delay));
    worst = Math.max(worst, Math.abs(rx[n] - expected));
  }
  assert.ok(worst < 2e-3, `retardation/amplitude error ${worst}`);
  assert.ok(Math.abs(J - 2 / ETA0) < 0.01 * (2 / ETA0), "calibration is a small correction");
  assert.ok(Math.abs(sourceCalibration(1.2e6, DT, 1) - 1) < 0.013 && sourceCalibration(1.2e6, DT, 1) < 1);
  // Causality: nothing arrives before d/c.
  for (let n = 0; n < Math.floor(delay / DT) - 1; n++) assert.ok(Math.abs(rx[n]) < 1e-12);
});
test("calibrated sheets give the requested field at every carrier to 0.1 %", () => {
  for (let j = 0; j < CARRIERS.length; j++) {
    const p = new Propagation(DT);
    const sheets = [0, 0, 0, 0, 0];
    let ee = 0,
      count = 0;
    for (let n = 0; n < 4000; n++) {
      sheets[j] = sheetForField(1) * sourceCalibration(CARRIERS[j], DT, COURANT_1D) * Math.sin(2 * Math.PI * CARRIERS[j] * n * DT);
      const e = p.step(sheets);
      if (n >= 1000) {
        ee += e * e;
        count++;
      }
    }
    const amplitude = Math.sqrt((2 * ee) / count);
    assert.ok(Math.abs(amplitude - 1) < 1e-3, `${CARRIERS[j]}: ${amplitude}`);
  }
});
test("numerical dispersion matches the Yee dispersion relation and stays below 1e-4 across the band", () => {
  const s = COURANT_1D;
  for (const f of [600e3, 1.2e6]) {
    const dx = (C0 * DT) / s,
      k = (2 * Math.PI * f) / C0;
    // sin(ωΔt/2) = S sin(k̃Δx/2) → numerical wavenumber k̃
    const kt = (2 / dx) * Math.asin(Math.sin(Math.PI * f * DT) / s);
    const analytic = ((1 - s * s) * (k * dx) ** 2) / 24;
    const measured = kt / k - 1;
    assert.ok(Math.abs(measured) < 1e-4, `${f}: ${measured}`);
    assert.ok(Math.abs(measured - analytic) < 0.1 * analytic, `${measured} vs ${analytic}`);
  }
});
test("absorbing boundaries: a pulse leaves the grid without measurable reflection", () => {
  const p = new Propagation(DT);
  const sheets = [0, 0, 0, 0, 0];
  let peak = 0;
  for (let n = 0; n < 400; n++) {
    sheets[0] = n < 40 ? Math.exp(-(((n - 20) / 6) ** 2)) : 0;
    p.step(sheets);
    if (n < 100) peak = Math.max(peak, ...Array.from(p.e, Math.abs));
  }
  const residual = Math.max(...Array.from(p.e, Math.abs), ...Array.from(p.h, Math.abs));
  assert.ok(peak > 1, "pulse present");
  assert.ok(residual < 1e-3 * peak, `residual ${residual / peak}`);
});
test("modulation survives propagation: carrier and both sidebands at the receiver with the analytic μ/2 ratio", () => {
  const p = new Propagation(DT);
  const fc = 900e3,
    fm = 5e3,
    mu = 0.65,
    J = sheetForField(1) * sourceCalibration(fc, DT, COURANT_1D);
  const N = 24576 * 4; // 4 ms, integer cycles of 5 kHz and 900 kHz
  const rx = new Float64Array(N);
  const sheets = [0, 0, 0, 0, 0];
  for (let n = 0; n < N; n++) {
    const t = n * DT;
    sheets[1] = J * (1 + mu * Math.cos(2 * Math.PI * fm * t)) * Math.sin(2 * Math.PI * fc * t);
    rx[n] = p.step(sheets);
  }
  const amp = (f: number) => {
    let c = 0,
      s = 0;
    for (let n = N / 2; n < N; n++) {
      c += rx[n] * Math.cos(2 * Math.PI * f * n * DT);
      s += rx[n] * Math.sin(2 * Math.PI * f * n * DT);
    }
    return (2 * Math.hypot(c, s)) / (N / 2);
  };
  const carrier = amp(fc),
    upper = amp(fc + fm),
    lower = amp(fc - fm);
  assert.ok(Math.abs(carrier - 1) < 1e-3, `carrier ${carrier}`);
  assert.ok(Math.abs(upper / carrier - mu / 2) < 1e-4, `upper ${upper}`);
  assert.ok(Math.abs(lower / carrier - mu / 2) < 1e-4, `lower ${lower}`);
  assert.ok(amp(fc + 3 * fm) < 1e-4, "no spurious components");
});
test("five co-propagating transmitters superpose linearly", () => {
  const sheets = [1, 2, 3, 4, 5].map((k) => k / ETA0);
  const p = new Propagation(DT);
  const sum = new Propagation(DT);
  const singles = sheets.map(() => new Propagation(DT));
  for (let n = 0; n < 500; n++) {
    const s = sheets.map((J) => J * Math.sin(2 * Math.PI * 700e3 * n * DT));
    const all = sum.step(s);
    let separate = 0;
    singles.forEach((q, i) => {
      const only = [0, 0, 0, 0, 0];
      only[i] = s[i];
      separate += q.step(only);
    });
    assert.ok(Math.abs(all - separate) < 1e-12);
    void p;
  }
});
test("plane-wave impedance: E = η₀H at the receiver and the grid stores positive energy", () => {
  const p = new Propagation(DT);
  const sheets = [0, 0, 0, 0, 0];
  let ee = 0,
    hh = 0;
  for (let n = 0; n < 3000; n++) {
    sheets[0] = (1 / ETA0) * Math.sin(2 * Math.PI * 900e3 * n * DT);
    p.step(sheets);
    if (n > 1500) {
      ee += p.e[LAYOUT.receiver] ** 2;
      hh += p.h[LAYOUT.receiver] ** 2;
    }
  }
  assert.ok(Math.abs(ee / hh - 1) < 1e-3, `E²/(η₀H)² = ${ee / hh}`);
  assert.ok(p.energy() > 0);
});
