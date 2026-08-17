import { describe, expect, it } from 'vitest';
import { midiToHz } from '../audio/piano.ts';
import { LAMBDA0_PX, SPEED_PX_S, fieldAt, sourceAt, wavelengthFor, type Source } from './field.ts';

function source(overrides: Partial<Source> = {}): Source {
  return {
    x: 0,
    y: 0,
    wavelength: LAMBDA0_PX,
    startedAt: 0,
    decay: 2,
    amplitude: 1,
    ...overrides,
  };
}

describe('wavelengthFor', () => {
  it('gives the reference note the reference wavelength', () => {
    expect(wavelengthFor(440, 440)).toBe(LAMBDA0_PX);
  });

  it('carries the real pitch ratios: a fifth is 2/3, an octave is 1/2', () => {
    const root = midiToHz(60);
    expect(wavelengthFor(midiToHz(67), root) / LAMBDA0_PX).toBeCloseTo(2 / 3, 2);
    expect(wavelengthFor(midiToHz(72), root) / LAMBDA0_PX).toBeCloseTo(1 / 2, 6);
  });
});

describe('sourceAt', () => {
  it('is silent ahead of the wavefront', () => {
    const s = source();
    // At t = 1s the front has reached SPEED px; just beyond it, nothing has arrived.
    expect(sourceAt(s, SPEED_PX_S + 10, 1)).toBe(0);
    expect(sourceAt(s, SPEED_PX_S - 10, 1)).not.toBe(0);
  });

  it('weakens with distance', () => {
    const s = source();
    // Ride along with the wave: sampling at t = r/SPEED + tau holds both the phase and
    // the retarded envelope fixed, so what is left is the spreading term alone. (Sampling
    // two radii at one wall-clock instant would compare different ages of the note — the
    // far field is *older*, because the ring keeps going after the note has died.)
    const rideAlong = (r: number, tau: number) => Math.abs(sourceAt(s, r, r / SPEED_PX_S + tau));
    expect(rideAlong(4 * LAMBDA0_PX, 0.4)).toBeLessThan(rideAlong(LAMBDA0_PX, 0.4));
    expect(rideAlong(8 * LAMBDA0_PX, 0.4)).toBeLessThan(rideAlong(4 * LAMBDA0_PX, 0.4));
  });

  it('keeps a ring expanding after its note has died', () => {
    const s = source({ decay: 0.5 });
    // Two decay constants in, the source is silent — but the crest it emitted early is
    // still travelling, and still visible out where it has got to.
    expect(Math.abs(sourceAt(s, 30, 2))).toBeLessThan(0.01);
    expect(Math.abs(sourceAt(s, 2 * SPEED_PX_S * 0.9, 2))).toBeGreaterThan(0);
  });

  it('fades out as the note dies', () => {
    const s = source({ decay: 0.4 });
    expect(sourceAt(s, 20, 8)).toBe(0);
  });
});

describe('fieldAt', () => {
  it('superposes sources and stays within a drawable range', () => {
    const sources = [
      source({ x: 100, y: 100 }),
      source({ x: 300, y: 140, wavelength: (LAMBDA0_PX * 2) / 3 }),
      source({ x: 500, y: 90, wavelength: LAMBDA0_PX / 2 }),
    ];
    let peak = 0;
    for (let t = 0.1; t < 3; t += 0.05) {
      for (let x = 0; x < 800; x += 7) {
        peak = Math.max(peak, Math.abs(fieldAt(sources, x, 120, t)));
      }
    }
    // Three unit sources can in principle sum to 3; spreading keeps it well under, and
    // the renderer clamps at 1 regardless.
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(3);
  });

  it('is zero with no sources', () => {
    expect(fieldAt([], 10, 10, 1)).toBe(0);
  });
});
