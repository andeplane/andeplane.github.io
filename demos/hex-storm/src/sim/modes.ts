/**
 * Azimuthal mode analysis: sample vorticity around a ring and take a DFT.
 * The dominant wavenumber m is the number of sides of the polygon.
 */
export const RING_SAMPLES = 256;
export const MAX_MODE = 12;

export interface ModeSpectrum {
  /** Power in azimuthal modes 0..MAX_MODE (index = m). */
  power: Float32Array;
  /** Dominant m ≥ 1, or 0 if the ring is featureless. */
  dominant: number;
  /** Fraction of the total (m ≥ 1) power in the dominant mode. */
  purity: number;
}

export function analyseRing(samples: ArrayLike<number>): ModeSpectrum {
  const n = samples.length;
  const power = new Float32Array(MAX_MODE + 1);
  let total = 0;
  for (let m = 0; m <= MAX_MODE; m++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * m * i) / n;
      re += samples[i] * Math.cos(a);
      im -= samples[i] * Math.sin(a);
    }
    power[m] = (re * re + im * im) / (n * n);
    if (m >= 1) total += power[m];
  }
  let dominant = 0;
  let best = 0;
  for (let m = 1; m <= MAX_MODE; m++) {
    if (power[m] > best) {
      best = power[m];
      dominant = m;
    }
  }
  return { power, dominant, purity: total > 0 ? best / total : 0 };
}
