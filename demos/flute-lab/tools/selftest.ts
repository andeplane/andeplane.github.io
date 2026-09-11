import assert from "node:assert/strict";
import {
  Flute,
  RATE,
  NX,
  NY,
  DX,
  C,
  RADIATION_CELLS,
  X0,
  TOP,
} from "../src/physics.ts";
import { Bore, BORE_RATE, TARGETS } from "../src/bore.ts";
import { spectrum, pitch } from "../src/spectrum.ts";
const rms = (a: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / a.length);
};
function run(f: Flute, seconds: number) {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    out[i] = f.step();
    assert.ok(Number.isFinite(out[i]));
  }
  return out;
}
assert.ok(C / (RATE * DX) < 1 / Math.sqrt(2), "2D CFL condition");
assert.equal(
  RADIATION_CELLS[0],
  (TOP - 1) * NX + X0 + 1,
  "Head radiation comes from the labium window",
);
assert.ok(
  !RADIATION_CELLS.includes(21 * NX + X0 - 1),
  "The mouth inlet is not a room radiation source",
);
const quiet = new Flute();
assert.equal(
  quiet.solid[21 * NX + X0 - 1],
  1,
  "The inlet/block is acoustically sealed",
);
quiet.breath = 0;
assert.equal(rms(run(quiet, 0.1)), 0, "No energy without excitation");
const pulse = new Flute();
pulse.breath = 0;
pulse.solid.fill(0);
pulse.p[20 * NX + 25] = 50;
pulse.mic = 20 * NX + 45;
const arrival = run(pulse, 0.01);
const amplitude = Math.max(...arrival.map(Math.abs));
const first = arrival.findIndex((v) => Math.abs(v) > 0.05 * amplitude) / RATE;
assert.ok(
  Math.abs(first - (20 * DX) / C) < 0.00025,
  `Wave arrival ${first} s versus ${(20 * DX) / C} s`,
);
const measured = [];
for (let n = 0; n <= 10; n++) {
  const f = new Bore();
  f.open = f.open.map((_, i) => i >= n);
  const crossings = [];
  let previous = 0;
  for (let i = 0; i < BORE_RATE * 0.6; i++) {
    f.step();
    const v = f.radiation[0];
    if (i > BORE_RATE * 0.3 && v >= 0 && previous < 0)
      crossings.push(i - 1 - previous / (v - previous));
    previous = v;
  }
  const hz =
    (BORE_RATE * (crossings.length - 1)) / (crossings.at(-1)! - crossings[0]);
  const target = [...TARGETS, 523.251][n];
  assert.ok(
    Math.abs(1200 * Math.log2(hz / target)) < 5,
    `Fingering ${n}: ${hz} vs ${target} Hz`,
  );
  measured.push(Number(hz.toFixed(2)));
}
const closed = new Flute();
const start = performance.now();
const closedOut = run(closed, 1);
const elapsed = performance.now() - start;
const tail = closedOut.slice(-16384);
const measuredC = pitch(spectrum(tail, 0), RATE, tail.length);
assert.ok(
  measuredC && Math.abs(measuredC.hz - 523.251) < 2,
  `Room microphone must measure C5: ${JSON.stringify(measuredC)}`,
);
assert.ok(rms(tail) > 0.01);
// Live fingering changes, without restarting the resonator.
for (const [covered, target] of [
  [9, 587.33],
  [8, 659.255],
  [7, 698.456],
  [5, 783.991],
  [3, 880],
  [1, 987.767],
  [0, 1046.502],
  [10, 523.251],
]) {
  closed.open = closed.open.map((_, i) => i >= covered);
  closed.geometry();
  const samples = run(closed, 0.5).slice(-16384),
    result = pitch(spectrum(samples, 0), RATE, samples.length);
  assert.ok(
    result && Math.abs(result.hz - target) < 2,
    `Live fingering ${covered}: ${JSON.stringify(result)} vs ${target}`,
  );
}
closed.breath = 0;
const decay = run(closed, 0.8);
assert.ok(
  rms(decay.slice(-8000)) < rms(tail) * 0.01,
  "Field decays after breath stops",
);
const disconnected = new Flute();
disconnected.feedback = false;
assert.ok(
  rms(run(disconnected, 0.5)) < rms(tail) * 0.02,
  "Feedback is necessary for sustained sound",
);
for (const jetGain of [12, 45]) {
  const f = new Flute();
  f.breath = 1.5;
  f.jetGain = jetGain;
  assert.ok(run(f, 0.3).every((p) => Math.abs(p) < 1000));
}
// FFT uses measured samples; verify both its frequency estimate and note name.
for (const hz of [
  261.626, 523.251, 587.33, 659.255, 698.456, 783.991, 880, 987.767, 1046.502,
]) {
  const signal = Float32Array.from({ length: 16384 }, (_, i) =>
    Math.sin((2 * Math.PI * hz * i) / 48000),
  );
  const result = pitch(spectrum(signal, 0), 48000, signal.length);
  assert.ok(result && Math.abs(result.hz - hz) < 0.15);
}
assert.equal(closed.step(), closed.p[closed.mic]);
closed.reset();
assert.equal(closed.time, 0);
assert.ok(closed.p.every((p) => p === 0));
console.log(
  JSON.stringify(
    {
      checks: "PASS",
      grid: [NX, NY],
      waveArrivalSeconds: first,
      chromaticFingeringsHz: measured,
      roomMicrophone: measuredC,
      cpuMsPerSimSecond: elapsed,
    },
    null,
    2,
  ),
);
