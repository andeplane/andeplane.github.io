/**
 * Slow mode: the full-wave 2D Maxwell solution drives the receiver.
 *
 * All five transmitters share one line current at the 2D grid's source. The
 * sample stream is built from the same station programs as the real-time
 * receiver, the WebGPU grid is run for the requested physical duration, the
 * E_z time series at the probe is scaled by the moment-method effective
 * height and orientation into the port's open-circuit voltage, and the
 * identical receiver chain (tank, diode, detector, filters, amplifier, 8 Ω)
 * is stepped at the grid's 7.5 ns time step. Nothing in this path uses the
 * real-time solution or the audio directly.
 */
import { DT, sourceForProbeField, PROBE_DISTANCE, type Field, type Wall } from "./field.ts";
import {
  CARRIERS,
  HEFF,
  Receiver,
  RadioEngine,
  type Settings,
} from "./physics.ts";
export type OfflineResult = {
  /** Audio-rate sample rate of the recovered output. */
  rate: number;
  /** Speaker voltage (V). */
  audio: Float32Array;
  /** Detector voltage (V) at audio rate. */
  envelope: Float32Array;
  /** Transmitted message of the tuned station at audio rate, delayed by the light travel time. */
  message: Float32Array;
  /** Incident E_z at the probe (V/m), decimated to audio rate as the per-sample peak. */
  incident: Float32Array;
  /** Full probe series (V/m) at the grid step. */
  probe: Float32Array;
  steps: number;
  seconds: number;
  wallSeconds: number;
  stepsPerSecond: number;
  slowdown: number;
  decimation: number;
  station: number;
  travelSeconds: number;
};
/** Build the source sample stream for `steps` grid steps. */
export function transmitterStream(
  engine: RadioEngine,
  settings: Settings,
  steps: number,
) {
  const out = new Float32Array(steps);
  const scale = CARRIERS.map((f) => sourceForProbeField(settings.field, f));
  // Program samples at the engine's audio rate, linearly interpolated between samples.
  const m = (j: number, t: number) => {
    const x = t * engine.rate,
      i = Math.floor(x),
      r = x - i;
    return (1 - r) * engine.message(j, i / engine.rate) + r * engine.message(j, (i + 1) / engine.rate);
  };
  for (let n = 0; n < steps; n++) {
    const t = (n + 1) * DT;
    let s = 0;
    for (let j = 0; j < 5; j++) {
      if (!settings.stations[j]) continue;
      s +=
        scale[j] *
        (1 + settings.depth * m(j, t)) *
        Math.sin(2 * Math.PI * CARRIERS[j] * t);
    }
    out[n] = s;
  }
  return out;
}
/** Which station the plates are tuned nearest to. */
export function tunedStation(frequency: number) {
  let best = 0;
  for (let j = 1; j < 5; j++)
    if (Math.abs(CARRIERS[j] - frequency) < Math.abs(CARRIERS[best] - frequency)) best = j;
  return best;
}
export async function runOffline(
  field: Field,
  engine: RadioEngine,
  settings: Settings,
  seconds: number,
  wall: Wall,
  tuned: number,
  progress?: (done: number, total: number, phase: string) => boolean | void,
): Promise<OfflineResult> {
  const steps = Math.round(seconds / DT);
  const stream = transmitterStream(engine, settings, steps);
  const t0 = performance.now();
  const probe = await field.run(stream, wall, (done, total) =>
    progress?.(done, total, "Solving Maxwell's equations on the GPU"),
  );
  const wallSeconds = (performance.now() - t0) / 1000;
  // Receiver chain at the grid step; decimate to the nearest integer ratio of 48 kHz.
  const decimation = Math.round(1 / (48000 * DT));
  const rate = 1 / (decimation * DT);
  const receiver = new Receiver(DT, rate);
  receiver.circuit.configure(settings.gap, settings.tau, settings.diode);
  const projection = HEFF * Math.cos((settings.angle * Math.PI) / 180);
  const frames = Math.floor(steps / decimation);
  const audio = new Float32Array(frames),
    envelope = new Float32Array(frames),
    filtered = new Float32Array(frames),
    message = new Float32Array(frames),
    incident = new Float32Array(frames);
  let prev = 0;
  const travel = PROBE_DISTANCE / 299792458;
  for (let i = 0; i < frames; i++) {
    let peak = 0;
    for (let k = 0; k < decimation; k++) {
      const n = i * decimation + k;
      const e = probe[n];
      const voc = projection * e;
      receiver.stepRf(prev, voc);
      prev = voc;
      peak = Math.max(peak, Math.abs(e));
    }
    filtered[i] = receiver.filters[3];
    envelope[i] = receiver.circuit.envelope;
    incident[i] = peak;
    const t = (i + 1) * decimation * DT - travel;
    message[i] = t >= 0 ? engine.message(tuned, t) : 0;
    if (i % 2000 === 0 && progress?.(i, frames, "Stepping the receiver circuit") === false)
      throw Error("cancelled");
  }
  // Output stage in a second pass. A run of a few milliseconds is shorter than
  // the 30 Hz coupling capacitor's 5 ms time constant, so instead of the
  // power-on thump (which would clip the amplifier) the coupling stage starts
  // at the run's mean filtered detector voltage after the tank has charged.
  const settle = Math.min(frames - 1, Math.round(0.0005 * rate));
  let mean = 0;
  for (let i = settle; i < frames; i++) mean += filtered[i];
  mean /= Math.max(1, frames - settle);
  receiver.output.dc = mean;
  for (let i = 0; i < frames; i++)
    audio[i] = receiver.output.step(filtered[i], settings.gain);
  return {
    rate,
    audio,
    envelope,
    message,
    incident,
    probe,
    steps,
    seconds,
    wallSeconds,
    stepsPerSecond: steps / wallSeconds,
    slowdown: wallSeconds / seconds,
    decimation,
    station: tuned,
    travelSeconds: travel,
  };
}
