/**
 * Turns the stream of (m, e) samples into physics.
 *
 * Everything here guards one thing: fluctuation formulas are only meaningful for
 * equilibrated samples taken at fixed parameters. Any disturbance — temperature or
 * field moved, geometry or size switched, a reset or a brush stroke — bumps the epoch
 * and starts an equilibration discard, so quench transients never contaminate χ or
 * C_v. Discarded samples still feed the time-series charts; they are the dynamics.
 *
 * Accumulated statistics live in temperature bins keyed by (geometry, L), so touring
 * geometries builds separate curves instead of destroying data, and Onsager's exact
 * result is only ever compared against square-lattice samples.
 */

import type { GeometryKey } from '../physics/lattice.ts';
import type { Sample } from './observables.ts';

const BIN_WIDTH = 0.025;
/** Sweeps discarded after a disturbance, before samples count as equilibrium. */
const EQUILIBRATION_SWEEPS = 120;
const EQUILIBRATION_SWEEPS_CRITICAL = 400;
/** Bin sample counts before the derived quantities are shown. */
const MIN_SAMPLES_MEAN = 4;
const MIN_SAMPLES_FLUCTUATION = 24;

interface Bin {
  n: number;
  sAbsM: number;
  sM2: number;
  sE: number;
  sE2: number;
}

export interface ScatterPoint {
  T: number;
  n: number;
  absM: number;
  e: number;
  chi: number | null;
  cv: number | null;
}

export class Statistics {
  private epoch = 0;
  private discardUntilSweep = 0;
  private readonly bins = new Map<string, Map<number, Bin>>();

  /** Bump on any parameter change, reset, or brush stroke. */
  disturb(currentSweep: number, T: number, Tc: number): number {
    this.epoch++;
    const nearCritical = Math.abs(T - Tc) < 0.08 * Tc;
    this.discardUntilSweep =
      currentSweep + (nearCritical ? EQUILIBRATION_SWEEPS_CRITICAL : EQUILIBRATION_SWEEPS);
    return this.epoch;
  }

  get currentEpoch(): number {
    return this.epoch;
  }

  /** True if the sample was accepted into the equilibrium bins. */
  accumulate(sample: Sample): boolean {
    const { tag } = sample;
    if (tag.epoch !== this.epoch) return false; // stale: from before the last disturbance
    if (tag.sweep < this.discardUntilSweep) return false; // still equilibrating
    if (Math.abs(tag.h) > 0.005) return false; // field on: not the h = 0 equilibrium
    // The |h| filter alone would re-admit driven configurations for a few frames at
    // every zero-crossing of the field auto-sweep; those are remanent-branch states,
    // not equilibrium.
    if (tag.driven) return false;

    const key = `${tag.geometry}:${tag.L}`;
    let geoBins = this.bins.get(key);
    if (!geoBins) {
      geoBins = new Map();
      this.bins.set(key, geoBins);
    }
    const idx = Math.round(tag.T / BIN_WIDTH);
    let bin = geoBins.get(idx);
    if (!bin) {
      bin = { n: 0, sAbsM: 0, sM2: 0, sE: 0, sE2: 0 };
      geoBins.set(idx, bin);
    }
    bin.n++;
    bin.sAbsM += Math.abs(sample.m);
    bin.sM2 += sample.m * sample.m;
    bin.sE += sample.e;
    bin.sE2 += sample.e * sample.e;
    return true;
  }

  get equilibrating(): boolean {
    return this.discardUntilSweep > 0;
  }

  isEquilibrated(sweep: number): boolean {
    return sweep >= this.discardUntilSweep;
  }

  scatter(geometry: GeometryKey, L: number): ScatterPoint[] {
    const geoBins = this.bins.get(`${geometry}:${L}`);
    if (!geoBins) return [];
    const N = L * L;
    const points: ScatterPoint[] = [];
    for (const [idx, b] of geoBins) {
      if (b.n < MIN_SAMPLES_MEAN) continue;
      const T = idx * BIN_WIDTH;
      const absM = b.sAbsM / b.n;
      const m2 = b.sM2 / b.n;
      const e = b.sE / b.n;
      const e2 = b.sE2 / b.n;
      const enough = b.n >= MIN_SAMPLES_FLUCTUATION;
      points.push({
        T,
        n: b.n,
        absM,
        e,
        chi: enough ? Math.max(0, (N * (m2 - absM * absM)) / T) : null,
        cv: enough ? Math.max(0, (N * (e2 - e * e)) / (T * T)) : null,
      });
    }
    points.sort((a, b) => a.T - b.T);
    return points;
  }

  clear(geometry: GeometryKey, L: number): void {
    this.bins.delete(`${geometry}:${L}`);
  }

  clearAll(): void {
    this.bins.clear();
  }
}
