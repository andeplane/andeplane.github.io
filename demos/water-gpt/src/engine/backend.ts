/**
 * The arithmetic a model mode asks for, behind one interface, so the same forward pass runs
 * either exactly (digital float32) or on simulated hydraulic crossbars.
 *
 *  - linear:  y = x · W for a named weight matrix (the valves were set once, at the factory);
 *  - scores:  s_j = q · k_j  (attention scores; valves set on the fly from the keys);
 *  - mix:     o = Σ_j p_j v_j (attention-weighted values; valves set from the values).
 *
 * Every call can be traced, which is how the renderer knows what flowed where.
 */
import { CpuCrossbar, exactMatvec, type Crossbar } from '../crossbar/matrix.ts';
import type { CrossbarSettings } from '../crossbar/tile.ts';

export interface WeightSpec {
  name: string;
  /** Short label for the exhibit, e.g. "layer 1 · MLP up". */
  label: string;
  K: number;
  N: number;
  W: Float32Array;
  /** False when the inputs are never negative (after a ReLU), so no x⁻ reservoirs exist. */
  signedInputs: boolean;
}

export type OpKind = 'linear' | 'scores' | 'mix';

export interface TraceEvent {
  kind: OpKind;
  /** Weight name for linear; e.g. "l0.h2.qk" for attention products. */
  name: string;
  label: string;
  x: Float32Array;
  y: Float32Array;
  /** The crossbar that did it (water backend only). */
  crossbar?: Crossbar;
}

export interface Backend {
  readonly kind: 'exact' | 'water';
  linear(name: string, x: Float32Array): Float32Array;
  scores(tag: string, q: Float32Array, keys: Float32Array[]): Float32Array;
  mix(tag: string, p: Float32Array, values: Float32Array[]): Float32Array;
  /**
   * Optional: column j of a weight crossbar, read backwards (drive one collector pair, read
   * the reservoirs). The big models use it for the token embedding, which is tied to the
   * output head.
   */
  column?(name: string, j: number): Float32Array;
  trace: ((e: TraceEvent) => void) | null;
}

function keysMatrix(keys: Float32Array[]): { W: Float32Array; K: number; N: number } {
  // W[d][j] = k_j[d], so q · W = (q·k_0, q·k_1, …)
  const N = keys.length;
  const K = keys[0].length;
  const W = new Float32Array(K * N);
  for (let j = 0; j < N; j++) for (let d = 0; d < K; d++) W[d * N + j] = keys[j][d];
  return { W, K, N };
}

function valuesMatrix(values: Float32Array[]): { W: Float32Array; K: number; N: number } {
  const K = values.length;
  const N = values[0].length;
  const W = new Float32Array(K * N);
  for (let j = 0; j < K; j++) W.set(values[j], j * N);
  return { W, K, N };
}

export class ExactBackend implements Backend {
  readonly kind = 'exact';
  trace: ((e: TraceEvent) => void) | null = null;
  private specs = new Map<string, WeightSpec>();

  constructor(specs: WeightSpec[]) {
    for (const s of specs) this.specs.set(s.name, s);
  }

  linear(name: string, x: Float32Array): Float32Array {
    const s = this.specs.get(name)!;
    const y = exactMatvec(s.W, s.K, s.N, x);
    this.trace?.({ kind: 'linear', name, label: s.label, x, y });
    return y;
  }

  column(name: string, j: number): Float32Array {
    const s = this.specs.get(name)!;
    const out = new Float32Array(s.K);
    for (let i = 0; i < s.K; i++) out[i] = s.W[i * s.N + j];
    return out;
  }

  scores(tag: string, q: Float32Array, keys: Float32Array[]): Float32Array {
    const { W, K, N } = keysMatrix(keys);
    const y = exactMatvec(W, K, N, q);
    this.trace?.({ kind: 'scores', name: tag, label: tag, x: q, y });
    return y;
  }

  mix(tag: string, p: Float32Array, values: Float32Array[]): Float32Array {
    const { W, K, N } = valuesMatrix(values);
    const y = exactMatvec(W, K, N, p);
    this.trace?.({ kind: 'mix', name: tag, label: tag, x: p, y });
    return y;
  }
}

export class WaterBackend implements Backend {
  readonly kind = 'water';
  trace: ((e: TraceEvent) => void) | null = null;
  readonly crossbars = new Map<string, CpuCrossbar>();
  private attnCount = 0;

  constructor(
    specs: WeightSpec[],
    readonly settings: CrossbarSettings,
    /** Also run attention products (QKᵀ, A·V) on crossbars set from the activations. */
    readonly waterAttention = true,
  ) {
    for (const s of specs) this.crossbars.set(s.name, new CpuCrossbar(s.name, s.W, s.K, s.N, s.signedInputs, settings));
  }

  get tileCount(): number {
    let n = 0;
    for (const c of this.crossbars.values()) n += c.tiles.length;
    return n;
  }

  /** Commission every weight tile (calibrate + transfer matrix), yielding between tiles. */
  async commission(onProgress?: (done: number, total: number) => void): Promise<void> {
    const total = this.tileCount;
    let done = 0;
    for (const c of this.crossbars.values()) await c.commission(() => onProgress?.(++done, total));
  }

  commissionSync(): void {
    for (const c of this.crossbars.values()) c.commissionSync();
  }

  linear(name: string, x: Float32Array): Float32Array {
    const c = this.crossbars.get(name)!;
    const y = c.matvec(x);
    this.trace?.({ kind: 'linear', name, label: name, x, y, crossbar: c });
    return y;
  }

  private transient(tag: string, W: Float32Array, K: number, N: number, signed: boolean): CpuCrossbar {
    const s = { ...this.settings, seed: (this.settings.seed * 31 + ++this.attnCount) >>> 0 };
    return new CpuCrossbar(tag, W, K, N, signed, s);
  }

  scores(tag: string, q: Float32Array, keys: Float32Array[]): Float32Array {
    const { W, K, N } = keysMatrix(keys);
    if (!this.waterAttention) {
      const y = exactMatvec(W, K, N, q);
      this.trace?.({ kind: 'scores', name: tag, label: tag, x: q, y });
      return y;
    }
    const c = this.transient(tag, W, K, N, true);
    const y = c.matvec(q);
    this.trace?.({ kind: 'scores', name: tag, label: tag, x: q, y, crossbar: c });
    return y;
  }

  mix(tag: string, p: Float32Array, values: Float32Array[]): Float32Array {
    const { W, K, N } = valuesMatrix(values);
    if (!this.waterAttention) {
      const y = exactMatvec(W, K, N, p);
      this.trace?.({ kind: 'mix', name: tag, label: tag, x: p, y });
      return y;
    }
    const c = this.transient(tag, W, K, N, false);
    const y = c.matvec(p);
    this.trace?.({ kind: 'mix', name: tag, label: tag, x: p, y, crossbar: c });
    return y;
  }
}
