/**
 * Non-blocking readback of the reduction results.
 *
 * A small ring of mappable staging buffers; if all are in flight the frame simply
 * skips measuring — the simulation never stalls on `mapAsync`. Results arrive one to
 * a few frames late, so every sample carries the tag captured at encode time and is
 * attributed to the parameters that actually produced it, not to wherever the
 * temperature slider is by the time the bytes arrive.
 */

import type { GeometryKey } from '../physics/lattice.ts';

export interface SampleTag {
  T: number;
  h: number;
  /** True while the field auto-sweep is driving h — never equilibrium data. */
  driven: boolean;
  geometry: GeometryKey;
  L: number;
  /** Simulation time of the measurement, in sweeps. */
  sweep: number;
  /** Sweeps covered by the flip counter. */
  flipSweeps: number;
  /** Statistics epoch — bumped on every reset/paint/parameter change. */
  epoch: number;
}

export interface Sample {
  /** Magnetization per spin, signed. */
  m: number;
  /** Energy per spin (J = 1). */
  e: number;
  /** Accepted flips per attempted flip since the previous measurement. */
  acceptance: number;
  tag: SampleTag;
}

interface Slot {
  buffer: GPUBuffer;
  busy: boolean;
}

export class Observables {
  private readonly slots: Slot[];

  constructor(device: GPUDevice, count = 4) {
    this.slots = Array.from({ length: count }, (_, i) => ({
      buffer: device.createBuffer({
        label: `staging ${i}`,
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      busy: false,
    }));
  }

  /** A free staging buffer, or null if every slot is still in flight. */
  acquire(): GPUBuffer | null {
    const slot = this.slots.find((s) => !s.busy);
    if (!slot) return null;
    slot.busy = true;
    return slot.buffer;
  }

  /** Call after submitting the encoder that copied into `buffer`. */
  resolve(buffer: GPUBuffer, tag: SampleTag, N: number, onSample: (s: Sample) => void): void {
    const slot = this.slots.find((s) => s.buffer === buffer)!;
    buffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const ints = new Int32Array(buffer.getMappedRange().slice(0));
        buffer.unmap();
        slot.busy = false;
        const sumS = ints[0];
        const sumBonds = ints[1];
        const flips = ints[2] >>> 0;
        const m = sumS / N;
        const e = (-sumBonds - tag.h * sumS) / N;
        const attempts = N * Math.max(tag.flipSweeps, 1e-9);
        onSample({ m, e, acceptance: flips / attempts, tag });
      })
      .catch(() => {
        slot.busy = false;
      });
  }
}
