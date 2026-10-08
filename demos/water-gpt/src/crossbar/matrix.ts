/**
 * The shared crossbar matmul API that every model mode calls.
 *
 * A weight matrix W [K × N] (calc-gpt layout: y = x · W) is cut into TILE × TILE blocks; each
 * block is its own physical crossbar with its own valve scale, programming error and manifold
 * network. A matrix–vector product runs every tile at once; the collectors of tiles that
 * share output columns drain into the same tank, so their flows simply add (Kirchhoff again).
 *
 * The tile is the unit a faster backend (e.g. WebGPU for 100M-weight models) would batch:
 * `Crossbar` is the interface, `CpuCrossbar` the reference implementation.
 */
import { CrossbarTile, TILE, type CrossbarSettings, type TileDetail } from './tile.ts';

export interface TilePlacement {
  /** First logical input row / output column of the block. */
  r0: number;
  c0: number;
  tile: CrossbarTile;
}

export interface Crossbar {
  readonly name: string;
  readonly K: number;
  readonly N: number;
  readonly signedInputs: boolean;
  readonly tiles: TilePlacement[];
  /** y = x · W computed by the water network (y is overwritten). */
  matvec(x: ArrayLike<number>, y?: Float32Array): Float32Array;
  /** Detailed network state of one tile for input x, for the renderer. */
  detail(tileIndex: number, x: ArrayLike<number>): TileDetail;
}

function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class CpuCrossbar implements Crossbar {
  readonly tiles: TilePlacement[] = [];

  constructor(
    readonly name: string,
    W: Float32Array,
    readonly K: number,
    readonly N: number,
    readonly signedInputs: boolean,
    settings: CrossbarSettings,
  ) {
    const base = hashName(name) ^ settings.seed;
    let t = 0;
    for (let r0 = 0; r0 < K; r0 += TILE)
      for (let c0 = 0; c0 < N; c0 += TILE) {
        const k = Math.min(TILE, K - r0);
        const n = Math.min(TILE, N - c0);
        const block = new Float32Array(k * n);
        for (let i = 0; i < k; i++) for (let j = 0; j < n; j++) block[i * n + j] = W[(r0 + i) * N + c0 + j];
        const tile = new CrossbarTile(block, k, n, signedInputs, { ...settings, seed: (base + 7919 * ++t) >>> 0 });
        this.tiles.push({ r0, c0, tile });
      }
  }

  /** Commission every tile (solve the network per reservoir), yielding between tiles. */
  async commission(onTile?: () => void): Promise<void> {
    for (const p of this.tiles) {
      p.tile.commission();
      onTile?.();
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  commissionSync(): void {
    for (const p of this.tiles) p.tile.commission();
  }

  matvec(x: ArrayLike<number>, y = new Float32Array(this.N)): Float32Array {
    y.fill(0);
    for (const p of this.tiles) p.tile.matvecAdd(x, p.r0, y, p.c0);
    return y;
  }

  detail(tileIndex: number, x: ArrayLike<number>): TileDetail {
    const p = this.tiles[tileIndex];
    return p.tile.detail(x, p.r0);
  }

  /** The weights as actually set on the valves (quantised, before programming error). */
  weightsAsSet(): Float32Array {
    const out = new Float32Array(this.K * this.N);
    for (const { r0, c0, tile } of this.tiles)
      for (let i = 0; i < tile.k; i++)
        for (let j = 0; j < tile.n; j++) out[(r0 + i) * this.N + c0 + j] = tile.wSet[i * tile.n + j];
    return out;
  }
}

/** Exact digital y = x · W, the reference every water result is checked against. */
export function exactMatvec(W: ArrayLike<number>, K: number, N: number, x: ArrayLike<number>, y = new Float32Array(N)): Float32Array {
  y.fill(0);
  for (let i = 0; i < K; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const off = i * N;
    for (let j = 0; j < N; j++) y[j] += xi * W[off + j];
  }
  return y;
}
