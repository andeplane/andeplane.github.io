/**
 * calc-gpt's forward pass, ported for inference.
 *
 * Ported from Anders Hafreager's calc-gpt (https://github.com/andeplane/calc-gpt,
 * src/engine/model.ts, `CalcGPT.forward`): token + position embeddings, two pre-LayerNorm
 * transformer blocks (4-head causal self-attention, ReLU MLP of width 4C), a final LayerNorm
 * and a linear head with no bias. The arithmetic is the same; what changed is that it runs one
 * position at a time with a key/value cache (so a new character costs one column of work),
 * and every matrix product goes through a `Backend` — exact, or the water crossbars.
 */
import type { ModelConfig } from '../../calcgpt/model.ts';
import type { Backend, WeightSpec } from '../../engine/backend.ts';

export type Params = Map<string, Float32Array>;

export function layerNorm(x: Float32Array, g: Float32Array, b: Float32Array): Float32Array {
  const C = x.length;
  let mean = 0;
  for (let c = 0; c < C; c++) mean += x[c];
  mean /= C;
  let v = 0;
  for (let c = 0; c < C; c++) v += (x[c] - mean) ** 2;
  const inv = 1 / Math.sqrt(v / C + 1e-5);
  const out = new Float32Array(C);
  for (let c = 0; c < C; c++) out[c] = (x[c] - mean) * inv * g[c] + b[c];
  return out;
}

export function softmax(s: Float32Array): Float32Array {
  let m = -Infinity;
  for (const v of s) m = Math.max(m, v);
  const out = new Float32Array(s.length);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += out[i] = Math.exp(s[i] - m);
  for (let i = 0; i < s.length; i++) out[i] /= sum;
  return out;
}

const LAYER_LABELS: Record<string, string> = {
  wqkv: 'attention Q·K·V',
  wproj: 'attention output',
  w1: 'MLP up',
  w2: 'MLP down',
};

/** The five kinds of weight matrix that become crossbars (biases and LayerNorms stay digital). */
export function weightSpecs(cfg: ModelConfig, p: Params): WeightSpec[] {
  const C = cfg.nEmbd;
  const V = cfg.vocabSize;
  const T = cfg.blockSize;
  // The embedding lookup is a crossbar too: one reservoir per character and one per position.
  // Opening exactly two of them (heads 1) pours wte[token] + wpe[position] into the collectors.
  const emb = new Float32Array((V + T) * C);
  emb.set(p.get('wte')!, 0);
  emb.set(p.get('wpe')!, V * C);
  const out: WeightSpec[] = [
    { name: 'embed', label: 'embedding', K: V + T, N: C, W: emb, signedInputs: false },
  ];
  for (let l = 0; l < cfg.nLayer; l++) {
    const dims: Record<string, [number, number]> = { wqkv: [C, 3 * C], wproj: [C, C], w1: [C, 4 * C], w2: [4 * C, C] };
    for (const [k, [K, N]] of Object.entries(dims))
      out.push({
        name: `l${l}.${k}`,
        label: `layer ${l + 1} · ${LAYER_LABELS[k]}`,
        K,
        N,
        W: p.get(`l${l}.${k}`)!,
        signedInputs: k !== 'w2',
      });
  }
  out.push({ name: 'wout', label: 'output head', K: C, N: cfg.vocabSize, W: p.get('wout')!, signedInputs: true });
  return out;
}

/** Incremental (KV-cached) forward pass for one sequence. */
export class CalcForward {
  private keys: Float32Array[][][];
  private values: Float32Array[][][];
  pos = 0;

  constructor(
    readonly cfg: ModelConfig,
    readonly p: Params,
    readonly backend: Backend,
  ) {
    this.keys = Array.from({ length: cfg.nLayer }, () => Array.from({ length: cfg.nHead }, () => []));
    this.values = Array.from({ length: cfg.nLayer }, () => Array.from({ length: cfg.nHead }, () => []));
  }

  /** Feed one token at the next position; returns the logits for the following token. */
  step(token: number): Float32Array {
    const { nEmbd: C, nHead: H, nLayer } = this.cfg;
    const hs = C / H;
    const scale = 1 / Math.sqrt(hs);
    const p = this.p;
    const t = this.pos++;
    if (t >= this.cfg.blockSize) throw new Error('sequence exceeds block size');
    const V = this.cfg.vocabSize;
    const onehot = new Float32Array(V + this.cfg.blockSize);
    onehot[token] = 1;
    onehot[V + t] = 1;
    let h = this.backend.linear('embed', onehot);

    for (let l = 0; l < nLayer; l++) {
      const g = (k: string) => p.get(`l${l}.${k}`)!;
      const n1 = layerNorm(h, g('ln1g'), g('ln1b'));
      const qkv = this.backend.linear(`l${l}.wqkv`, n1);
      const bqkv = g('bqkv');
      for (let j = 0; j < 3 * C; j++) qkv[j] += bqkv[j];
      const att = new Float32Array(C);
      for (let head = 0; head < H; head++) {
        const q = qkv.slice(head * hs, head * hs + hs);
        this.keys[l][head].push(qkv.slice(C + head * hs, C + head * hs + hs));
        this.values[l][head].push(qkv.slice(2 * C + head * hs, 2 * C + head * hs + hs));
        const s = this.backend.scores(`l${l}.h${head}.qk`, q, this.keys[l][head]);
        for (let j = 0; j < s.length; j++) s[j] *= scale;
        const probs = softmax(s);
        const o = this.backend.mix(`l${l}.h${head}.av`, probs, this.values[l][head]);
        att.set(o, head * hs);
      }
      const proj = this.backend.linear(`l${l}.wproj`, att);
      const bproj = g('bproj');
      const hMid = new Float32Array(C);
      for (let c = 0; c < C; c++) hMid[c] = h[c] + proj[c] + bproj[c];
      const n2 = layerNorm(hMid, g('ln2g'), g('ln2b'));
      const pre = this.backend.linear(`l${l}.w1`, n2);
      const b1 = g('b1');
      for (let j = 0; j < pre.length; j++) pre[j] = Math.max(0, pre[j] + b1[j]);
      const mlp = this.backend.linear(`l${l}.w2`, pre);
      const b2 = g('b2');
      const hOut = new Float32Array(C);
      for (let c = 0; c < C; c++) hOut[c] = hMid[c] + mlp[c] + b2[c];
      h = hOut;
    }
    const nf = layerNorm(h, p.get('lnf.g')!, p.get('lnf.b')!);
    return this.backend.linear('wout', nf);
  }
}

export function argmax(a: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
}
