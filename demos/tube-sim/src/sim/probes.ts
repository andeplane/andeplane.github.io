import type { Solver } from './solver';
import type { GridLayout, Probe } from './types';

export const MAX_PROBES = 3;
/**
 * Sample the meters on the simulation clock, not the display clock: at 0.001×
 * a frame is a fraction of one step, at 1× it is thousands, and p(t) has to
 * come out the same either way. 5 µs resolves even the shortest (0.05 ms)
 * pulse, and 8000 samples covers ~40 ms of event.
 */
export const PROBE_SAMPLE_INTERVAL = 5e-6; // s
export const PROBE_MAX_SAMPLES = 8000;

export function probeCell(probe: Probe, layout: GridLayout): { x: number; y: number } {
  return {
    x: Math.round(probe.fx * layout.nx),
    y: Math.round(probe.fy * layout.ny),
  };
}

export function createProbe(id: number, fx: number, fy: number): Probe {
  return { id, fx, fy, t: [], p: [], peak: 0 };
}

export function clearProbe(probe: Probe): void {
  probe.t.length = 0;
  probe.p.length = 0;
  probe.peak = 0;
}

/** Records one sample if enough simulated time has passed since the last one. */
export function sampleProbe(probe: Probe, solver: Solver): void {
  const last = probe.t[probe.t.length - 1];
  if (last !== undefined && solver.simTime - last < PROBE_SAMPLE_INTERVAL) return;
  const { x, y } = probeCell(probe, solver.layout);
  const value = solver.pressureAt(x, y);
  probe.t.push(solver.simTime);
  probe.p.push(value);
  if (Math.abs(value) > probe.peak) probe.peak = Math.abs(value);
  if (probe.t.length > PROBE_MAX_SAMPLES) {
    probe.t.shift();
    probe.p.shift();
  }
}
