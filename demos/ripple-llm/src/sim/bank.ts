/**
 * The bank of designed tanks: metadata in data/tanks.json, the sculpted floors
 * (c², quantised to 16 bits, row-major) concatenated in data/tanks.bin.
 */
import { C2_DEEP, C2_SHALLOW, makeSpec, NX, NY, type TankSpec } from './tank.ts';

export interface TankMeta {
  id: string;
  kind: 'matrix' | 'llm';
  nIn: number;
  nOut: number;
  /** Chapter 1: which target matrix. */
  target?: string;
  /** Chapter 2: layer and tile position, and how many ports the tile uses. */
  layer?: 1 | 2;
  r?: number;
  c?: number;
  rows?: number;
  cols?: number;
  /** Design residual Σ(ReT − G·W)² / (G²‖W‖²) after quantisation. */
  loss: number;
  /** Offset into tanks.bin, in 16-bit words. */
  offset: number;
}

export interface BankMeta {
  nx: number;
  ny: number;
  gain: number;
  tanks: TankMeta[];
}

export function decodeFloor(words: Uint16Array, offset: number, nx = NX, ny = NY): Float32Array {
  const c2 = new Float32Array(nx * ny);
  for (let i = 0; i < c2.length; i++) c2[i] = C2_SHALLOW + (words[offset + i] / 65535) * (C2_DEEP - C2_SHALLOW);
  return c2;
}

export function specOf(meta: TankMeta, words: Uint16Array): TankSpec {
  return makeSpec(meta.nIn, meta.nOut, decodeFloor(words, meta.offset));
}
