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
} from "../src/physics.ts";
test("parallel plates tune correctly and wider gap raises frequency", () => {
  assert.ok(
    Math.abs(capacitance(gapForFrequency(900000)) * 1e12 - 125.09) < 0.1,
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
  let energy = c.energy();
  for (let i = 0; i < 20000; i++) {
    c.step(0);
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
