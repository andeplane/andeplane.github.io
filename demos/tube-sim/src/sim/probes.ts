import type { Solver } from './solver';
import type { GridLayout, Probe } from './types';

export const PROBE_HISTORY_LENGTH = 600;

export function probeCell(probe: Probe, layout: GridLayout): { x: number; y: number } {
  return {
    x: Math.round(probe.fx * layout.nx),
    y: Math.round(probe.fy * layout.ny),
  };
}

export function sampleProbe(probe: Probe, solver: Solver): void {
  const { x, y } = probeCell(probe, solver.layout);
  probe.history.push(solver.pressureAt(x, y));
  if (probe.history.length > PROBE_HISTORY_LENGTH) probe.history.shift();
}
