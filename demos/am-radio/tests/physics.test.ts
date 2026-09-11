import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Circuit,
  RadioEngine,
  capacitance,
  gapForFrequency,
  resonance,
  response,
  defaults,
  CA,
  CARRIERS,
  type Settings,
} from "../src/physics.ts";
test("parallel plates tune correctly with the antenna capacitance in parallel; wider gap raises frequency", () => {
  assert.ok(
    Math.abs(capacitance(gapForFrequency(900000)) * 1e12 + CA * 1e12 - 125.09) < 0.1,
  );
  assert.ok(Math.abs(resonance(gapForFrequency(900000)) - 900000) < 1e-6);
  assert.ok(resonance(1) > resonance(0.5));
});
test("tank response rejects distant stations", () => {
  const g = gapForFrequency(900000);
  assert.ok(response(900000, g) > 15 * response(600000, g));
  assert.ok(response(900000, g) > 15 * response(1200000, g));
});
test("unforced passive tank loses energy", () => {
  const c = new Circuit(1 / 24576000);
  c.v = 1;
  c.va = -1;
  let energy = c.energy();
  for (let i = 0; i < 20000; i++) {
    c.step(0, 0);
    assert.ok(c.energy() <= energy + 1e-22);
    energy = c.energy();
  }
  assert.ok(Math.abs(c.v) < 1e-12);
});
function toneRun(
  over = 512,
  angle = 0,
  diode = true,
  gap = gapForFrequency(1200000),
) {
  const e = new RadioEngine(48000, over);
  e.configure({
    ...defaults,
    gap,
    angle,
    diode,
    stations: [false, false, false, false, true],
  });
  let sq = 0,
    cos = 0,
    sin = 0;
  for (let n = 0; n < 4800; n++) {
    const out = e.sample();
    assert.ok(Number.isFinite(out));
    if (n >= 2400) {
      sq += out * out;
      cos += out * Math.cos((2 * Math.PI * 1000 * n) / 48000);
      sin += out * Math.sin((2 * Math.PI * 1000 * n) / 48000);
    }
  }
  return {
    rms: Math.sqrt(sq / 2400),
    correlation: Math.hypot(cos, sin) / Math.sqrt(sq * 1200),
  };
}
test("RF integration recovers 1 kHz modulation", () => {
  const result = toneRun();
  assert.ok(result.rms > 0.03, JSON.stringify(result));
  assert.ok(result.correlation > 0.93, JSON.stringify(result));
});
test("antenna null and disconnected diode silence load", () => {
  assert.ok(toneRun(512, 90).rms < 1e-8);
  assert.ok(toneRun(512, 0, false).rms < 1e-8);
});
test("detuning suppresses recovered audio", () => {
  assert.ok(
    toneRun(512, 0, true, gapForFrequency(600000)).rms < toneRun().rms * 0.1,
  );
});
test("halving RF step converges in RMS", () => {
  const a = toneRun(512).rms,
    b = toneRun(1024).rms;
  assert.ok(Math.abs(a - b) / b < 0.12, `${a} vs ${b}`);
});
test("switching off transmitters drains receiver", () => {
  const e = new RadioEngine();
  for (let n = 0; n < 1000; n++) e.sample();
  e.configure({ ...defaults, stations: [false, false, false, false, false] });
  for (let n = 0; n < 4800; n++) e.sample();
  assert.ok(Math.abs(e.output.voltage) < 1e-6);
});
import {
  Receiver,
  RP,
  RD,
  RA,
  HEFF,
  ETA0,
  ANTENNA,
  sheetForField,
  L,
} from "../src/physics.ts";
import { analyze } from "../src/antenna.ts";
test("discrete energy balance: port energy in equals stored change plus every dissipation, to rounding", () => {
  const dt = 1 / 24576000;
  const c = new Circuit(dt);
  c.account = true;
  let voc = 0;
  const u0 = c.energy();
  let prev = 0;
  for (let n = 0; n < 40000; n++) {
    // Two carriers so the diode conducts and the tank is driven off resonance too.
    voc =
      0.9 * Math.sin(2 * Math.PI * 900e3 * (n + 1) * dt) +
      0.5 * Math.sin(2 * Math.PI * 750e3 * (n + 1) * dt);
    c.step(prev, voc);
    prev = voc;
  }
  const e = c.drain();
  const stored = c.energy() - u0;
  // The port resistance is not part of the time stepping (its drop is 1e-6 of the port
  // reactance); its loss is estimated from the port current and reported separately.
  const balance = e.port - e.tank - e.diode - e.detector - stored;
  assert.ok(e.port > 0 && e.tank > 0 && e.diode > 0 && e.detector > 0);
  assert.ok(Math.abs(balance) < 1e-9 * e.port, `imbalance ${balance} of ${e.port}`);
  assert.ok(e.radiated < 1e-5 * e.port && e.radiated > 0);
});
test("loaded port benchmark: time-domain tank amplitude matches the frequency-domain moment-method Thévenin solution", () => {
  // Detector disconnected, single carrier at the tuned frequency, field 1 V/m.
  for (const f of [600e3, 900e3, 1.2e6]) {
    const e = new RadioEngine(48000, 512);
    const idx = CARRIERS.indexOf(f);
    e.configure({
      ...defaults,
      gap: gapForFrequency(f),
      diode: false,
      depth: 0,
      stations: CARRIERS.map((_, j) => j === idx),
    });
    for (let n = 0; n < 2400; n++) e.sample(n === 2399);
    let peak = 0;
    for (const v of e.rfTank) peak = Math.max(peak, Math.abs(v));
    // Frequency domain: V_oc = h_eff·E from the MoM receiving solve, port Z_a = R_a − j/ωC_a from the
    // same solve, tank Z_t = (1/R_p + jωC + 1/jωL)⁻¹; V = V_oc·Z_t/(Z_a + Z_t).
    const a = analyze(ANTENNA, f);
    const w = 2 * Math.PI * f;
    const ztr = 1 / RP,
      zti = w * capacitance(gapForFrequency(f)) - 1 / (w * L);
    // 1/Y_t as a complex number
    const d = ztr * ztr + zti * zti;
    const [tr, ti] = [ztr / d, -zti / d];
    const [zar, zai] = a.impedance;
    const sr = zar + tr,
      si = zai + ti;
    const [vr, vi] = a.openCircuit;
    // V = Voc * Zt / (Za + Zt)
    const nr = vr * tr - vi * ti,
      ni = vr * ti + vi * tr;
    const dd = sr * sr + si * si;
    const expected = Math.hypot((nr * sr + ni * si) / dd, (ni * sr - nr * si) / dd);
    const midpoint = Math.abs(response(f, gapForFrequency(f)) - expected) / expected;
    assert.ok(midpoint < 2e-3, `analytic response vs MoM Thévenin: ${midpoint}`);
    assert.ok(Math.abs(peak - expected) / expected < 0.03, `${f}: ${peak} vs ${expected}`);
  }
});
/** Spectral amplitude of a 1 kHz-family component in the steady-state output. */
function spectrum(e: RadioEngine, seconds = 0.1) {
  const N = Math.round(seconds * 48000);
  const out = new Float64Array(N);
  for (let n = 0; n < 2400; n++) e.sample();
  for (let n = 0; n < N; n++) out[n] = e.sample();
  return (f: number) => {
    let c = 0,
      s = 0;
    for (let n = 0; n < N; n++) {
      c += out[n] * Math.cos((2 * Math.PI * f * n) / 48000);
      s += out[n] * Math.sin((2 * Math.PI * f * n) / 48000);
    }
    return (2 * Math.hypot(c, s)) / N;
  };
}
function toneEngine(depth: number, gap = gapForFrequency(1.2e6), station = 4) {
  const e = new RadioEngine(48000, 512);
  e.configure({
    ...defaults,
    gap,
    depth,
    stations: CARRIERS.map((_, j) => j === station),
  });
  return e;
}
test("demodulation distortion at 65 % depth is low and rises sharply above 100 % modulation", () => {
  const a = spectrum(toneEngine(0.65));
  const thd = Math.hypot(a(2000), a(3000), a(4000)) / a(1000);
  assert.ok(a(1000) > 0.5, `fundamental ${a(1000)}`);
  assert.ok(thd < 0.05, `THD ${thd}`);
  const b = spectrum(toneEngine(1.3));
  const over = Math.hypot(b(2000), b(3000), b(4000)) / b(1000);
  assert.ok(over > 3 * thd, `overmodulation THD ${over} vs ${thd}`);
});
test("station selectivity: a neighbour 150 kHz away is rejected by more than 15 dB at the output", () => {
  // Tune to 1200 kHz with the tone; measure the tone at the output. Then tune 150 kHz away.
  // The detector loads the tank (about R_d/2 in parallel), so the loaded Q is nearer 25
  // than the coil's 70; that, not the coil, sets a crystal set's selectivity.
  const on = spectrum(toneEngine(0.65))(1000);
  const off = spectrum(toneEngine(0.65, gapForFrequency(1.05e6)))(1000);
  const db = 20 * Math.log10(on / off);
  assert.ok(db > 15, `rejection ${db} dB`);
});
test("RF rejection: carrier ripple reaching the decimator is more than 80 dB below the recovered tone", () => {
  const e = toneEngine(0.65);
  for (let n = 0; n < 4800; n++) e.sample(n === 4799);
  // Carrier component of the filtered envelope over the 512-step capture (25 carrier cycles),
  // relative to the envelope's 1 kHz swing at the same point of the chain.
  const N = 512,
    dt = 1 / e.rfRate;
  // Remove the audio-rate trend of the envelope and apply a Hann window so that the
  // measurement floor is well below the ripple being measured.
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let n = 0; n < N; n++) {
    sx += n;
    sy += e.rfFiltered[n];
    sxx += n * n;
    sxy += n * e.rfFiltered[n];
  }
  const slope = (N * sxy - sx * sy) / (N * sxx - sx * sx),
    mean = (sy - slope * sx) / N;
  let c = 0,
    s = 0;
  for (let n = 0; n < N; n++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
    const v = (e.rfFiltered[n] - mean - slope * n) * w;
    c += v * Math.cos(2 * Math.PI * 1.2e6 * n * dt);
    s += v * Math.sin(2 * Math.PI * 1.2e6 * n * dt);
  }
  const ripple = (4 * Math.hypot(c, s)) / N;
  const tone = spectrum(toneEngine(0.65))(1000) / defaults.gain;
  const db = 20 * Math.log10(tone / Math.max(ripple, 1e-15));
  assert.ok(db > 80, `RF residual ${db} dB`);
});
test("the field the antenna sees is the calibrated incident field and the port readings are physical", () => {
  const e = toneEngine(0);
  for (let n = 0; n < 9600; n++) e.sample(n === 9599);
  let peak = 0;
  for (const v of e.rfE) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(peak - 1) < 0.01, `incident peak ${peak}`);
  // Incident power density of a 1 V/m plane wave: E²/(2η₀).
  assert.ok(Math.abs(e.power.incident - 1 / (2 * ETA0)) < 0.02 / (2 * ETA0));
  // Port charge is C_a(v_oc − v); the available power V_oc²/(8R_a) dwarfs what a short dipole delivers.
  assert.ok(e.power.available > 1e3 * e.power.port);
  assert.ok(e.power.port > 0 && e.power.radiated < 1e-4 * e.power.port);
  assert.ok(Math.max(...e.rfCharge) > 1 && Math.max(...e.rfCurrent) > 1);
  void sheetForField;
  void HEFF;
  void RD;
  void RA;
  void Receiver;
});
test("switching the field off, blocking the antenna or opening the diode each silence the load", () => {
  const silent = (settings: Partial<Settings>) => {
    const e = new RadioEngine(48000, 512);
    e.configure({
      ...defaults,
      gap: gapForFrequency(1.2e6),
      ...settings,
      stations: [false, false, false, false, true],
    });
    let sq = 0;
    for (let n = 0; n < 4800; n++) {
      const v = e.sample();
      if (n >= 2400) sq += v * v;
    }
    return Math.sqrt(sq / 2400);
  };
  assert.ok(silent({ field: 0 }) < 1e-9);
  assert.ok(silent({ angle: 90 }) < 1e-9);
  assert.ok(silent({ diode: false }) < 1e-9);
  assert.ok(silent({}) > 0.1);
});
test("replayed Yee grid reproduces the exact retarded field that drives the receiver", () => {
  const e = new RadioEngine(48000, 512);
  e.configure({ ...defaults });
  let worst = 0;
  for (let n = 0; n < 3000; n++) {
    e.sample(n % 700 === 699);
    if (n % 700 === 699) worst = Math.max(worst, e.deviation);
  }
  assert.ok(worst < 5e-3, `grid vs exact ${worst} V/m`);
  assert.ok(e.spaceTime.some((v) => Math.abs(v) > 0.5));
});
