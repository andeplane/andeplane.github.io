/**
 * The wave field: what the background is actually drawing.
 *
 * Every note that sounds becomes a point source on the canvas. Each emits circular crests
 * that spread at one shared on-screen speed — exactly as sound does in air, where pitch
 * changes the wavelength, not the speed. So
 *
 *     lambda = LAMBDA0 * f_root / f_note      and      f_vis = SPEED / lambda
 *
 * and the ratios are the real ones: a fifth's crests are spaced 2/3 of the root's, an
 * octave's half. That is the whole trick — because the ratios are exact, a 3:2 sums into
 * stationary interference fringes while 45:32 (the tritone) never repeats and shimmers.
 * Consonance becomes something you can see.
 *
 * Displacement of one source, at radius r and time t after its onset:
 *
 *     env(t - r/SPEED) * spread(r) * sin(2*pi * (f_vis*t - r/lambda))
 *
 * The `t - r/SPEED` retardation matters: it means the ring keeps expanding after the note
 * has died, fading from the inside out, instead of the whole field dimming at once.
 *
 * This module is the single definition of that field. The canvas-2D fallback calls
 * `fieldAt` directly; the WebGL path uses `FIELD_GLSL` below, which is a line-for-line
 * transcription — they are kept adjacent so they cannot quietly drift apart.
 */

import { envelopeAt } from '../audio/piano.ts';

/**
 * On-screen wavelength of the reference note (the root of the current question), in px,
 * and the speed every ripple travels at. The pair is chosen together: the temporal
 * frequency a viewer sees is SPEED/lambda, so ~2.2 Hz for the root and ~3.3 Hz for the
 * fifth — fast enough that several crests are in flight while the note rings, slow enough
 * that the pattern breathes rather than strobes.
 */
export const LAMBDA0_PX = 124;
export const SPEED_PX_S = 270;
/** Cylindrical spreading is gentle; this constant softens it further near the source. */
const SPREAD_SCALE = 90;
/**
 * Real 2D spreading alone leaves a third of the amplitude a whole screen away, which
 * fills the page with grey. This extra exponential reach keeps a ripple local to the note
 * that made it.
 */
const REACH_PX = 700;
/** More than this and the shader loop gets long for no visual gain. */
export const MAX_SOURCES = 6;

export interface Source {
  /** Position in CSS pixels. */
  x: number;
  y: number;
  /** On-screen wavelength in px — carries the pitch ratio. */
  wavelength: number;
  /** Page-clock time (seconds) at which the note sounded. */
  startedAt: number;
  /** Envelope decay constant of that note, seconds. */
  decay: number;
  /** Overall strength, 0-1. */
  amplitude: number;
}

export function wavelengthFor(hz: number, referenceHz: number): number {
  return (LAMBDA0_PX * referenceHz) / hz;
}

function spread(r: number): number {
  return Math.exp(-r / REACH_PX) / Math.sqrt(1 + r / SPREAD_SCALE);
}

/** Displacement of a single source at distance `r`, `t` seconds after its onset. */
export function sourceAt(source: Source, r: number, t: number): number {
  if (t <= 0) return 0;
  const retarded = t - r / SPEED_PX_S;
  // Nothing ahead of the wavefront.
  if (retarded <= 0) return 0;
  const env = envelopeAt(retarded, source.decay);
  if (env < 0.001) return 0;
  const phase = 2 * Math.PI * ((SPEED_PX_S * t) / source.wavelength - r / source.wavelength);
  return source.amplitude * env * spread(r) * Math.sin(phase);
}

/** Summed displacement of every live source at a point. Roughly [-1, 1]. */
export function fieldAt(sources: readonly Source[], x: number, y: number, now: number): number {
  let sum = 0;
  for (const source of sources) {
    const dx = x - source.x;
    const dy = y - source.y;
    sum += sourceAt(source, Math.hypot(dx, dy), now - source.startedAt);
  }
  return sum;
}

/**
 * How long a source stays worth drawing: the envelope is inaudible after ~2.5 decay
 * constants, and after that the ring still has to travel off the canvas.
 */
export function sourceLifetime(source: Pick<Source, 'decay'>, maxRadius: number): number {
  return 2.5 * source.decay + maxRadius / SPEED_PX_S;
}

/**
 * GLSL transcription of `sourceAt`/`fieldAt`, including the envelope from
 * `audio/piano.ts`. Kept beside the TypeScript so the two stay in step.
 */
export const FIELD_GLSL = /* glsl */ `
const float SPEED = ${SPEED_PX_S.toFixed(1)};
const float SPREAD_SCALE = ${SPREAD_SCALE.toFixed(1)};
const float REACH = ${REACH_PX.toFixed(1)};
const float ATTACK = 0.006;
const float TAU = 6.28318530718;

float envelopeAt(float t, float decay) {
  if (t < 0.0) return 0.0;
  if (t < ATTACK) return t / ATTACK;
  return exp(-4.2 * (t - ATTACK) / decay);
}

// x: px, y: px, wavelength: px, startedAt: s, decay: s, amplitude: 0-1
float sourceAt(vec2 p, vec4 src, vec2 params, float now) {
  float t = now - src.z;
  if (t <= 0.0) return 0.0;
  float r = length(p - src.xy);
  float retarded = t - r / SPEED;
  if (retarded <= 0.0) return 0.0;
  float env = envelopeAt(retarded, params.x);
  if (env < 0.001) return 0.0;
  float spread = exp(-r / REACH) * inversesqrt(1.0 + r / SPREAD_SCALE);
  float phase = TAU * (SPEED * t - r) / src.w;
  return params.y * env * spread * sin(phase);
}
`;
