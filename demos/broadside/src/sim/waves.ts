/**
 * Gerstner ocean waves. This exact function is mirrored in the water shader
 * (render/water.ts) so ships bob in sync with the water you see.
 */

export interface WaveParams {
  /** Direction the wave travels (radians, heading convention). */
  direction: number;
  wavelength: number;
  /** 0..1 crest sharpness. */
  steepness: number;
}

export const DEFAULT_WAVES: readonly WaveParams[] = [
  { direction: 0.6, wavelength: 34, steepness: 0.16 },
  { direction: 1.4, wavelength: 19, steepness: 0.14 },
  { direction: -0.3, wavelength: 11, steepness: 0.12 },
  { direction: 2.3, wavelength: 6.5, steepness: 0.08 },
];

const G = 9.8;

export interface WaveSample {
  height: number;
  /** Surface slope along +X and +Z. */
  slopeX: number;
  slopeZ: number;
}

export const sampleWaves = (
  x: number,
  z: number,
  time: number,
  waves: readonly WaveParams[] = DEFAULT_WAVES,
  amplitudeScale = 1,
): WaveSample => {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.wavelength;
    const c = Math.sqrt(G / k);
    const dx = Math.sin(w.direction);
    const dz = Math.cos(w.direction);
    const a = (w.steepness / k) * amplitudeScale;
    const f = k * (dx * x + dz * z - c * time);
    height += a * Math.sin(f);
    const d = a * k * Math.cos(f);
    slopeX += dx * d;
    slopeZ += dz * d;
  }
  return { height, slopeX, slopeZ };
};
