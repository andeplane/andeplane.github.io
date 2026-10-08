/**
 * Calibration worker: solves the Helmholtz equation for each sculpted floor it is
 * given and returns the tank's complex transfer matrix plus a half-resolution
 * copy of each wave-maker's steady field (for the tank hall's thumbnails).
 *
 * This is the frequency-domain twin of the time-domain solver: the same discrete
 * equations, solved directly for the state the tank settles into.
 */
import { decodeFloor, type TankMeta } from './bank.ts';
import { steadyState } from './helmholtz.ts';
import { makeSpec, NX, NY } from './tank.ts';

export interface CalibRequest {
  words: Uint16Array;
  tanks: { index: number; meta: TankMeta }[];
}

export interface CalibResult {
  index: number;
  Tre: number[][];
  Tim: number[][];
  /** Per wave-maker: interleaved re/im on a (NX/2)×(NY/2) grid. */
  thumbs: Float32Array[];
  ms: number;
}

export const THUMB_NX = NX / 2;
export const THUMB_NY = NY / 2;

self.onmessage = (e: MessageEvent<CalibRequest>) => {
  const { words, tanks } = e.data;
  for (const { index, meta } of tanks) {
    const t0 = performance.now();
    const spec = makeSpec(meta.nIn, meta.nOut, decodeFloor(words, meta.offset));
    const ss = steadyState(spec, meta.kind === 'llm');
    const thumbs = ss.fields.map((f) => {
      const out = new Float32Array(THUMB_NX * THUMB_NY * 2);
      for (let y = 0; y < THUMB_NY; y++) {
        for (let x = 0; x < THUMB_NX; x++) {
          let re = 0;
          let im = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const i = (2 * y + dy) * NX + 2 * x + dx;
              re += f.re[i];
              im += f.im[i];
            }
          }
          out[2 * (y * THUMB_NX + x)] = re / 4;
          out[2 * (y * THUMB_NX + x) + 1] = im / 4;
        }
      }
      return out;
    });
    const res: CalibResult = {
      index,
      Tre: ss.Tre.map((r) => Array.from(r)),
      Tim: ss.Tim.map((r) => Array.from(r)),
      thumbs,
      ms: performance.now() - t0,
    };
    (self as unknown as Worker).postMessage(res, thumbs.map((t) => t.buffer));
  }
};
