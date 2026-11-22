import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  antennaPort,
  solveCurrents,
  shortDipoleRadiationResistance,
  C0,
  EPS0,
} from "../src/antenna.ts";
import { ANTENNA, CARRIERS, PORT } from "../src/physics.ts";
const near = (a: number, b: number, rel: number, what: string) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);
test("half-wave dipole: resonance near 0.47 λ with the textbook ~73 Ω radiation resistance", () => {
  const f = 300e6,
    lam = C0 / f;
  const r = analyze({ length: 0.47 * lam, radius: 0.001 * lam, segments: 41 }, f);
  assert.ok(r.impedance[0] > 65 && r.impedance[0] < 80, `R = ${r.impedance[0]}`);
  assert.ok(Math.abs(r.impedance[1]) < 12, `X = ${r.impedance[1]}`);
  const full = analyze({ length: 0.5 * lam, radius: 0.001 * lam, segments: 41 }, f);
  assert.ok(full.impedance[1] > 30, "a full half wavelength is inductive");
  assert.ok(full.impedance[0] > 80 && full.impedance[0] < 100);
});
test("short dipole limits: effective height L/2, radiation resistance 20π²(L/λ)², capacitance πε₀h/(ln(h/a)−1)", () => {
  const p = antennaPort(ANTENNA, CARRIERS, 900e3);
  near(p.effectiveHeight, ANTENNA.length / 2, 0.03, "h_eff");
  near(
    p.radiationResistance,
    shortDipoleRadiationResistance(ANTENNA.length, 900e3),
    0.06,
    "R_rad",
  );
  const h = ANTENNA.length / 2;
  near(
    p.capacitance,
    (Math.PI * EPS0 * h) / (Math.log(h / ANTENNA.radius) - 1),
    0.05,
    "C_a",
  );
  assert.ok(p.ohmicResistance < 0.1 && p.ohmicResistance > 0);
  // Across the broadcast band the quasi-static port is frequency independent to well under 0.1 %.
  assert.ok(p.heightSpread < 1e-3, `height spread ${p.heightSpread}`);
  assert.ok(p.capacitanceSpread < 1e-3, `capacitance spread ${p.capacitanceSpread}`);
  // Radiation resistance scales as f².
  const r6 = p.rows[0].resistance,
    r12 = p.rows[4].resistance;
  near(r12 / r6, 4, 0.02, "R_rad ∝ f²");
});
test("reciprocity: open-circuit voltage from the receiving solve equals h_eff from the transmitting current", () => {
  for (const f of [600e3, 1.2e6, 30e6]) {
    const r = analyze(ANTENNA, f);
    near(r.openCircuit[0], r.effectiveHeight[0], 2e-3, `V_oc/E at ${f}`);
  }
});
test("Thévenin equivalent reproduces the fully loaded moment-method port current", () => {
  const f = 900e3;
  const r = analyze(ANTENNA, f);
  const [zr, zi] = r.impedance;
  for (const load of [
    [0, 0],
    [50e3, 0],
    [0, -1 / (2 * Math.PI * f * 125e-12)],
    [1e5, 4e4],
  ] as [number, number][]) {
    const s = solveCurrents(ANTENNA, f, { field: [1, 0] }, load);
    const tr = zr + load[0],
      ti = zi + load[1],
      d = tr * tr + ti * ti;
    const ir = (r.openCircuit[0] * tr + r.openCircuit[1] * ti) / d;
    const ii = (r.openCircuit[1] * tr - r.openCircuit[0] * ti) / d;
    near(Math.hypot(s.ir[s.feed], s.ii[s.feed]), Math.hypot(ir, ii), 1e-6, "|I|");
  }
});
test("polarization: tangential projection gives the cos θ law and a null at 90°", () => {
  const r = analyze(ANTENNA, 900e3);
  for (const deg of [0, 30, 60, 89.9, 90]) {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = solveCurrents(ANTENNA, 900e3, { field: [c, 0] });
    assert.ok(
      Math.abs(s.ir[s.feed] - c * r.feedCurrentPerVoltPerMetre[0]) < 1e-12 &&
        Math.abs(s.ii[s.feed] - c * r.feedCurrentPerVoltPerMetre[1]) < 1e-12,
    );
  }
});
test("induced charge: opposite signs on the two arms, zero net, transmitting current nearly triangular", () => {
  const r = analyze(ANTENNA, 900e3);
  const n = r.transmittingCharge.length;
  let net = 0;
  for (let j = 0; j < n; j++) {
    const l = j === 0 || j === n - 1 ? ANTENNA.length / ANTENNA.segments / 2 : ANTENNA.length / ANTENNA.segments;
    net += r.transmittingCharge[j] * l;
    if (j < (n - 1) / 2) assert.ok(Math.sign(r.transmittingCharge[j]) === -Math.sign(r.transmittingCharge[n - 1 - j]));
  }
  assert.ok(Math.abs(net) < 1e-3 * Math.abs(r.transmittingCharge[0] * ANTENNA.length));
  const c = (ANTENNA.segments - 1) / 2;
  near(r.transmitting[Math.round(c / 2)], 0.5, 0.06, "quarter-point current");
  // The port capacitance used by the circuit is the charge per volt on one arm.
  let arm = 0;
  for (let j = 0; j < (n - 1) / 2; j++)
    arm += r.transmittingCharge[j] * (j === 0 ? ANTENNA.length / ANTENNA.segments / 2 : ANTENNA.length / ANTENNA.segments);
  near(Math.abs(arm), PORT.capacitance, 0.05, "arm charge per volt");
});
