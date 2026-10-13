/** Serialisation of the trained calc-gpt weights (float32, base64 per tensor). */
import type { ModelConfig } from '../calcgpt/model';

/** calc-gpt's configuration (see calc-gpt src/ui/worker.ts). */
export const CONFIG: ModelConfig = { vocabSize: 16, blockSize: 12, nLayer: 2, nHead: 4, nEmbd: 32 };

export interface WeightMeta {
  trainedSteps: number;
  heldOutAccuracy: number;
  heldOutCount: number;
  noiseAwareSigma: number;
}

export interface WeightFile extends WeightMeta {
  config: ModelConfig;
  params: Record<string, string>;
}

function toB64(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fromB64(s: string): Float32Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

export function encodeWeights(params: Map<string, Float32Array>, meta: WeightMeta): WeightFile {
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = toB64(v);
  return { config: CONFIG, ...meta, params: out };
}

export function decodeWeights(file: WeightFile): Map<string, Float32Array> {
  const m = new Map<string, Float32Array>();
  for (const [k, v] of Object.entries(file.params)) m.set(k, fromB64(v));
  return m;
}
