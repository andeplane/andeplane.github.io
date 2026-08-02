import type { Diagnostics } from '../physics/diagnostics.ts';
import type { SimParams } from '../physics/params.ts';

/**
 * Orbit-averaged scalars for the graphs.
 *
 * One orbit takes a fraction of a second here, so a value sampled once per animation
 * frame samples the orbital ripple at an arbitrary phase and the curves come out as a
 * sawtooth that is pure aliasing. These are accumulated inside the step loop instead.
 */
export interface Averages {
  distance: number;
  omegaOrbit: number;
  omegaSpin: number;
  spinRatio: number;
  bulgeLead: number;
  tidalStrain: number;
}

/** A snapshot of the world, small enough to post every frame without thinking about it. */
export interface Frame {
  diagnostics: Diagnostics;
  averages: Averages;
  earth: Float32Array;
  /** Particle positions, for the debug view. */
  particles: Float32Array;
  /** Orbits completed since the run began. */
  orbits: number;
  /** Simulation steps executed per second of wall clock, for the perf readout. */
  stepsPerSecond: number;
  /** True when the worker is falling behind the requested speed. */
  saturated: boolean;
}

export type ToWorker =
  | { type: 'init'; params: SimParams }
  | { type: 'reset'; params: SimParams }
  | { type: 'material'; stiffness: number; damping: number }
  | { type: 'speed'; multiplier: number }
  | { type: 'running'; running: boolean };

export type FromWorker = { type: 'frame'; frame: Frame } | { type: 'ready' };
