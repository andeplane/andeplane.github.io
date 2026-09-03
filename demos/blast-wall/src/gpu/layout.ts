/**
 * One memory layout, shared by the CPU packer, the compute kernels and the renderer.
 *
 * WebGPU guarantees only eight storage buffers per shader stage, and this solver has
 * twenty-odd arrays. So they live in three arenas — read-only u32, read-only f32, and
 * read-write f32 — and every kernel indexes into them through offsets that arrive in the
 * uniform block. The offsets are computed here and nowhere else, so a shader can never
 * disagree with the buffer it is reading.
 */

import type { Mesh } from '../model/mesh.ts';

export interface Layout {
  n: number;
  e: number;
  p: number;
  u: number;
  /** Element counts of each arena. */
  u32Size: number;
  roSize: number;
  rwSize: number;
  off: Record<string, number>;
}

export function layoutFor(mesh: Mesh): Layout {
  const n = mesh.nodeCount;
  const e = mesh.elementCount;
  const p = mesh.pairCount;
  const u = mesh.units.length;
  const off: Record<string, number> = {};

  let c = 0;
  const u32 = (name: string, size: number) => {
    off[name] = c;
    c += size;
  };
  u32('elements', 8 * e);
  u32('pairs', 2 * p);
  u32('pairAxis', p);
  u32('elemStart', n + 1);
  u32('elemData', 8 * e);
  u32('pairStart', n + 1);
  u32('pairData', 2 * p);
  u32('unitRange', 2 * u);
  u32('nodeUnit', n);
  const u32Size = c;

  c = 0;
  const ro = (name: string, size: number) => {
    off[name] = c;
    c += size;
  };
  ro('x0', 3 * n);
  ro('invMass', n);
  ro('pairArea', p);
  ro('loadDir', 3 * n);
  ro('loadPulse', 3 * n);
  ro('K', 576);
  ro('unitScale', 4 * u);
  const roSize = c;

  c = 0;
  const rw = (name: string, size: number) => {
    off[name] = c;
    c += size;
  };
  rw('x', 3 * n);
  rw('vel', 3 * n);
  rw('quat', 4 * e);
  rw('elemForce', 24 * e);
  rw('pairForce', 3 * p);
  rw('pairDamage', p);
  rw('pairState', 5 * p);
  rw('nodeScalar', 2 * n);
  rw('clock', 4);
  rw('centroid', 3 * u);
  const rwSize = c;

  return { n, e, p, u, u32Size, roSize, rwSize, off };
}

/** Names in the order the uniform block expects them, after the 24 leading floats. */
export const OFFSET_FIELDS = [
  'elements',
  'pairs',
  'pairAxis',
  'elemStart',
  'elemData',
  'pairStart',
  'pairData',
  'unitRange',
  'nodeUnit',
  'x0',
  'invMass',
  'pairArea',
  'loadDir',
  'loadPulse',
  'K',
  'unitScale',
  'x',
  'vel',
  'quat',
  'elemForce',
  'pairForce',
  'pairDamage',
  'pairState',
  'nodeScalar',
  'clock',
  'centroid',
] as const;

/** Bytes in the params uniform: 20 floats, 4 counts, then the offsets, padded to 16. */
export const PARAMS_BYTES = Math.ceil((20 + 4 + OFFSET_FIELDS.length) / 4) * 4 * 4;
