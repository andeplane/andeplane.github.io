import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
let Processor;
const filename = readdirSync(new URL("../dist/assets/", import.meta.url)).find(
  (n) => n.startsWith("audio-worklet-"),
);
assert.ok(filename, "Build the worklet first");
runInNewContext(
  readFileSync(new URL("../dist/assets/" + filename, import.meta.url), "utf8"),
  {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = { onmessage: null, postMessage() {} };
    },
    registerProcessor(_name, Class) {
      Processor = Class;
    },
  },
);
function controls(p, speed, paused = false) {
  p.port.onmessage({
    data: {
      type: "controls",
      speed,
      breath: 1,
      jetGain: 24,
      open: Array(10).fill(false),
      paused,
    },
  });
}
function render(p, frames) {
  const buffer = new Float32Array(128),
    samples = [];
  for (let i = 0; i < frames; i++) {
    p.process([], [[buffer]]);
    samples.push(...buffer);
  }
  return samples;
}
function crossings(a) {
  let n = 0;
  for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 && a[i] >= 0) n++;
  return n;
}
const normal = new Processor(),
  slow = new Processor();
controls(normal, 1);
controls(slow, 0.25);
// Same simulated warm-up, different listening duration.
render(normal, 375);
render(slow, 1500);
const fast = render(normal, 375),
  low = render(slow, 1500);
assert.ok(
  Math.abs(normal.sim.time - slow.sim.time) < 1 / 48000,
  "Both playback speeds reach the same physics state",
);

assert.ok(
  Math.abs(crossings(fast) - crossings(low)) < 3,
  "Quarter-speed stretches the same oscillations over four times as much listening time",
);
assert.ok(
  fast.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.6),
  "Finite, bounded output",
);
const before = normal.sim.time;
controls(normal, 1, true);
assert.ok(render(normal, 10).every((v) => v === 0));
assert.equal(normal.sim.time, before, "Pause freezes physics");
normal.port.onmessage({ data: { type: "reset" } });
assert.equal(normal.sim.time, 0);
controls(normal, 0.0001);
render(normal, 375);
assert.ok(
  Math.abs(normal.sim.time - 0.0001) < 1 / 48000,
  "Extreme slow motion keeps fixed stable timesteps",
);
console.log(
  "Audio worklet PASS: resampling/pitch scaling, pause, reset, bounds, 0.0001x clock.",
);
