/**
 * Fast self-tests for the hall of valves (run in the build; need no weight files).
 *  - weight-file readers (safetensors, PyTorch zip + pickle) on synthetic files, fed in
 *    random-sized chunks like a network stream
 *  - BPE round trips
 *  - the crossbar: ideal path bit-identical to a plain float matmul; quantisation error
 *    bounds; the first-order IR-drop model against an exact solve of the pipe network
 *  - the forward pass (GPT-2 and GPT-Neo flavours, KV cache) against an independent
 *    full-sequence float implementation on a tiny random model
 * Run: node --experimental-strip-types tools/test-big.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BpeTokenizer, type TokenizerJson } from '../src/big/bpe.ts'
import { CODE_MAX, crossbarMatmul, floatMatmul, IDEAL, TileGrid, type Physics } from '../src/big/crossbar.ts'
import { geluNew, ModelWeights, type ModelConfig } from '../src/big/model.ts'
import { CpuRunner } from '../src/big/runner-cpu.ts'
import { ByteReader, type TensorBand } from '../src/big/weights/bytereader.ts'
import { readSafetensors } from '../src/big/weights/safetensors.ts'
import { readTorchZip } from '../src/big/weights/torchzip.ts'
import { WEIGHTS_DIR } from './node-models.ts'

let failures = 0
const tests: [string, () => void | Promise<void>][] = []
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn])

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randn(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())
}

async function* chunked(bytes: Uint8Array, seed: number): AsyncGenerator<Uint8Array> {
  const r = rng(seed)
  for (let i = 0; i < bytes.length; ) {
    const n = 1 + Math.floor(r() * 97)
    yield bytes.subarray(i, i + n)
    i += n
  }
}

function collect(): { bands: TensorBand[]; handlers: { want: () => boolean; bandRows: () => number; band: (b: TensorBand) => void } } {
  const bands: TensorBand[] = []
  return { bands, handlers: { want: () => true, bandRows: () => 2, band: (b) => void bands.push({ ...b, data: b.data.slice() }) } }
}

function joinBands(bands: TensorBand[], name: string): Float32Array {
  const parts = bands.filter((b) => b.name === name)
  const n = parts.reduce((a, b) => a + b.data.length, 0)
  const out = new Float32Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p.data, o)
    o += p.data.length
  }
  return out
}

// ------------------------------------------------------------------ weight files
test('safetensors: streamed in odd-sized chunks, tensors out of name order', async () => {
  const a = Float32Array.from({ length: 15 }, (_, i) => i * 0.5 - 3)
  const b = Float32Array.from({ length: 4 }, (_, i) => -i)
  const header = JSON.stringify({
    __metadata__: { format: 'pt' },
    'z.weight': { dtype: 'F32', shape: [5, 3], data_offsets: [0, 60] },
    'a.bias': { dtype: 'F32', shape: [4], data_offsets: [60, 76] },
  })
  const hb = new TextEncoder().encode(header)
  const file = new Uint8Array(8 + hb.length + 76)
  new DataView(file.buffer).setBigUint64(0, BigInt(hb.length), true)
  file.set(hb, 8)
  file.set(new Uint8Array(a.buffer), 8 + hb.length)
  file.set(new Uint8Array(b.buffer), 8 + hb.length + 60)
  const { bands, handlers } = collect()
  const metas = await readSafetensors(new ByteReader(chunked(file, 7)), handlers)
  assert.deepEqual(metas.map((m) => m.name), ['z.weight', 'a.bias'])
  assert.deepEqual(Array.from(joinBands(bands, 'z.weight')), Array.from(a))
  assert.deepEqual(Array.from(joinBands(bands, 'a.bias')), Array.from(b))
  assert.equal(bands.filter((x) => x.name === 'z.weight').length, 3) // 5 rows in bands of 2
})

/** A PyTorch-style zip: stored entries, data descriptors, 64-byte aligned data. */
function torchZip(tensors: { name: string; key: string; shape: number[]; data: Float32Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const p: number[] = []
  const op = (...b: number[]) => p.push(...b)
  const u32 = (v: number) => op(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255)
  const str = (s: string) => {
    const b = enc.encode(s)
    op(0x58)
    u32(b.length)
    op(...b)
  }
  const glob = (m: string, n: string) => op(0x63, ...enc.encode(`${m}\n${n}\n`))
  const int = (v: number) => (v < 256 ? op(0x4b, v) : (op(0x4a), u32(v)))
  op(0x80, 2, 0x7d, 0x28) // PROTO 2, EMPTY_DICT, MARK
  for (const t of tensors) {
    str(t.name)
    glob('torch._utils', '_rebuild_tensor_v2')
    op(0x28) // MARK (args)
    op(0x28)
    str('storage')
    glob('torch', 'FloatStorage')
    str(t.key)
    str('cpu')
    int(t.data.length)
    op(0x74, 0x51) // TUPLE, BINPERSID
    int(0)
    op(0x28)
    for (const s of t.shape) int(s)
    op(0x74)
    op(0x28)
    let st = 1
    const strides: number[] = []
    for (let i = t.shape.length - 1; i >= 0; i--) {
      strides.unshift(st)
      st *= t.shape[i]
    }
    for (const s of strides) int(s)
    op(0x74, 0x89) // TUPLE, NEWFALSE
    glob('collections', 'OrderedDict')
    op(0x29, 0x52) // EMPTY_TUPLE, REDUCE
    op(0x74, 0x52) // TUPLE, REDUCE
  }
  op(0x75, 0x2e) // SETITEMS, STOP
  const entries: { name: string; data: Uint8Array }[] = [{ name: 'archive/data.pkl', data: new Uint8Array(p) }]
  for (const t of [...tensors].sort((x, y) => x.key.localeCompare(y.key))) entries.push({ name: `archive/data/${t.key}`, data: new Uint8Array(t.data.buffer) })
  entries.push({ name: 'archive/version', data: enc.encode('3\n') })
  const out: number[] = []
  for (const e of entries) {
    const name = enc.encode(e.name)
    const headerLen = 30 + name.length
    const pad = (64 - ((out.length + headerLen + 4) % 64)) % 64
    const extra = 4 + pad
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true)
    h.setUint16(6, 0x808, true) // data descriptor + utf8, sizes zero (like PyTorch)
    h.setUint16(26, name.length, true)
    h.setUint16(28, extra, true)
    out.push(...new Uint8Array(h.buffer), ...name, 0x46, 0x42, pad & 255, pad >> 8, ...new Array(pad).fill(0x5a))
    out.push(...e.data)
    const dd = new DataView(new ArrayBuffer(16))
    dd.setUint32(0, 0x08074b50, true)
    dd.setUint32(8, e.data.length, true)
    dd.setUint32(12, e.data.length, true)
    out.push(...new Uint8Array(dd.buffer))
  }
  const cd = new DataView(new ArrayBuffer(4))
  cd.setUint32(0, 0x02014b50, true)
  out.push(...new Uint8Array(cd.buffer), 0, 0, 0, 0)
  return new Uint8Array(out)
}

test('PyTorch zip + pickle: storages sized from the pickle, descriptors skipped', async () => {
  const w = Float32Array.from({ length: 6 }, (_, i) => i + 0.25)
  const v = Float32Array.from({ length: 300 }, (_, i) => Math.sin(i))
  const file = torchZip([
    { name: 'transformer.h.0.mlp.c_fc.weight', key: '0', shape: [2, 3], data: w },
    { name: 'transformer.wpe.weight', key: '10', shape: [100, 3], data: v },
  ])
  const { bands, handlers } = collect()
  const metas = await readTorchZip(new ByteReader(chunked(file, 3)), handlers)
  assert.equal(metas.length, 2)
  assert.deepEqual(Array.from(joinBands(bands, 'transformer.h.0.mlp.c_fc.weight')), Array.from(w))
  assert.deepEqual(Array.from(joinBands(bands, 'transformer.wpe.weight')), Array.from(v))
})

// ------------------------------------------------------------------ tokenizer
test('BPE: byte-level round trip on a tiny vocabulary', () => {
  // all 256 byte symbols + a couple of merges
  const vocab: Record<string, number> = {}
  const bs: number[] = []
  for (let i = 33; i <= 126; i++) bs.push(i)
  for (let i = 161; i <= 172; i++) bs.push(i)
  for (let i = 174; i <= 255; i++) bs.push(i)
  let n = 0
  const sym: string[] = new Array(256)
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) sym[b] = String.fromCharCode(256 + n++)
  for (const b of bs) sym[b] = String.fromCharCode(b)
  sym.forEach((s, i) => (vocab[s] = i))
  vocab['he'] = 256
  vocab['Ġw'] = 257
  vocab['Ġwa'] = 258
  const tok = new BpeTokenizer({ model: { vocab, merges: ['h e', 'Ġ w', 'Ġw a'] }, added_tokens: [{ id: 259, content: '<|endoftext|>' }] } as TokenizerJson)
  const text = 'he said: water wants ÆØÅ 🌊<|endoftext|>'
  const ids = tok.encode(text)
  assert.ok(ids.includes(256) && ids.includes(258) && ids.at(-1) === 259)
  assert.equal(tok.decode(ids), text)
})

const tokPath = join(WEIGHTS_DIR, 'gpt2-tokenizer.json')
test('BPE: GPT-2 ids for a known prompt (skipped without tokenizer.json)', () => {
  if (!existsSync(tokPath)) return console.log('    (skipped: no local tokenizer)')
  const tok = new BpeTokenizer(JSON.parse(readFileSync(tokPath, 'utf8')))
  assert.deepEqual(tok.encode('Hello, my name is'), [15496, 11, 616, 1438, 318])
  const s = " It's 3.14 o'clock —  naïve façade\n\nok"
  assert.equal(tok.decode(tok.encode(s)), s)
})

// ------------------------------------------------------------------ crossbar
function randomGrid(rows: number, cols: number, seed: number): { grid: TileGrid; w: Float32Array } {
  const r = rng(seed)
  const w = Float32Array.from({ length: rows * cols }, () => randn(r) * 0.05)
  const grid = new TileGrid(0, 'test', rows, cols, true)
  for (let r0 = 0; r0 < rows; r0 += 64) {
    const n = Math.min(64, rows - r0)
    grid.programBand(w.subarray(r0 * cols, (r0 + n) * cols), r0, n, cols, 'in_out', 0)
  }
  return { grid, w }
}

test('crossbar: ideal valves reproduce the float matmul bit for bit', () => {
  const { grid, w } = randomGrid(150, 130, 1)
  const r = rng(2)
  const x = Float32Array.from({ length: 150 }, () => randn(r))
  x[7] = 0
  const a = crossbarMatmul(grid, x, IDEAL, 1)
  const b = floatMatmul(w, 150, 130, x)
  assert.deepEqual(Array.from(a), Array.from(b))
})

test('crossbar: out_in programming equals in_out programming', () => {
  const { grid, w } = randomGrid(100, 70, 3)
  const t = new Float32Array(100 * 70)
  for (let i = 0; i < 100; i++) for (let j = 0; j < 70; j++) t[j * 100 + i] = w[i * 70 + j]
  const g2 = new TileGrid(1, 't', 100, 70, true)
  g2.programBand(t, 0, 64, 100, 'out_in', 0)
  g2.programBand(t.subarray(64 * 100), 64, 6, 100, 'out_in', 0)
  assert.deepEqual(Array.from(g2.codes), Array.from(grid.codes))
  assert.deepEqual(Array.from(g2.scale), Array.from(grid.scale))
})

test('crossbar: quantisation error shrinks ~2x per valve bit', () => {
  const { grid, w } = randomGrid(256, 96, 4)
  const r = rng(5)
  const x = Float32Array.from({ length: 256 }, () => randn(r))
  const ref = floatMatmul(w, 256, 96, x)
  const err = (bits: number) => {
    const p: Physics = { ideal: false, bits, inBits: 0, progNoise: 0, readNoise: 0, irDrop: 0, seed: 1 }
    const y = crossbarMatmul(grid, x, p, 1)
    let e = 0
    let n = 0
    for (let i = 0; i < 96; i++) {
      e += (y[i] - ref[i]) ** 2
      n += ref[i] ** 2
    }
    return Math.sqrt(e / n)
  }
  const e4 = err(4)
  const e7 = err(7)
  assert.ok(e7 < 0.01, `7-bit relative error ${e7}`)
  assert.ok(e4 / e7 > 5 && e4 / e7 < 14, `4→7 bit error ratio ${e4 / e7}`)
})

/** Exact steady state of one tile's pipe network (dense solve), for IR-drop checking. */
function exactTile(gs: number[][], x: number[], rho: number): number[] {
  // positions p = 2j (+ valve of column j) and 2j+1 (− valve); each position has its own
  // collector running down the rows to the outlet below the last row.
  const R = x.length
  const P = gs[0].length * 2
  const N = 2 * R * P
  const Hn = (r: number, p: number) => r * P + p
  const Cn = (r: number, p: number) => R * P + r * P + p
  const A = Array.from({ length: N }, () => new Float64Array(N + 1))
  const G = 1 / rho
  const add = (i: number, j: number | null, g: number, rhs = 0) => {
    A[i][i] += g
    if (j !== null) A[i][j] -= g
    A[i][N] += rhs * g
  }
  const gv = (r: number, p: number) => {
    const w = gs[r][p >> 1]
    return (p & 1) === 0 ? Math.max(w, 0) : Math.max(-w, 0)
  }
  for (let r = 0; r < R; r++) {
    for (let p = 0; p < P; p++) {
      const h = Hn(r, p)
      const c = Cn(r, p)
      if (p === 0) add(h, null, G, x[r])
      else add(h, Hn(r, p - 1), G)
      if (p < P - 1) add(h, Hn(r, p + 1), G)
      add(h, c, gv(r, p))
      add(c, h, gv(r, p))
      if (r > 0) add(c, Cn(r - 1, p), G)
      if (r < R - 1) add(c, Cn(r + 1, p), G)
      else add(c, null, G, 0)
    }
  }
  for (let i = 0; i < N; i++) {
    let piv = i
    for (let k = i + 1; k < N; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k
    ;[A[i], A[piv]] = [A[piv], A[i]]
    for (let k = i + 1; k < N; k++) {
      const f = A[k][i] / A[i][i]
      if (f === 0) continue
      for (let j = i; j <= N; j++) A[k][j] -= f * A[i][j]
    }
  }
  const v = new Float64Array(N)
  for (let i = N - 1; i >= 0; i--) {
    let s = A[i][N]
    for (let j = i + 1; j < N; j++) s -= A[i][j] * v[j]
    v[i] = s / A[i][i]
  }
  const y: number[] = []
  for (let j = 0; j < gs[0].length; j++) y.push(G * v[Cn(R - 1, 2 * j)] - G * v[Cn(R - 1, 2 * j + 1)])
  return y
}

test('crossbar: first-order IR drop captures the exact pipe-network solution', () => {
  const R = 12
  const C = 10
  const r = rng(9)
  const gs: number[][] = []
  const w = new Float32Array(R * C)
  for (let i = 0; i < R; i++) {
    gs.push([])
    for (let j = 0; j < C; j++) {
      // equal magnitudes (open at the 127 detent), alternating signs: the regime the
      // mean-field row model describes
      const v = (j % 2 === 0 ? 1 : -1) * (0.8 + 0.4 * (i === 0 ? 1 : 0.5))
      w[i * C + j] = v
    }
  }
  const grid = new TileGrid(0, 'ir', R, C, true)
  grid.programBand(w, 0, R, C, 'in_out', 0)
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) gs[i].push(grid.conductance(i, j, { ...IDEAL, ideal: false }))
  const x = Float32Array.from({ length: R }, () => 0.5 + 0.5 * r())
  const rho = 2e-3
  const p: Physics = { ideal: false, bits: 7, inBits: 0, progNoise: 0, readNoise: 0, irDrop: rho, seed: 1 }
  const sx = Math.max(...x)
  const yFirst = crossbarMatmul(grid, x, p, 1)
  const yIdeal = crossbarMatmul(grid, x, { ...p, irDrop: 0 }, 1)
  const yExact = exactTile(gs, Array.from(x, (v) => v / sx), rho)
  let effect = 0
  let resid = 0
  for (let j = 0; j < C; j++) {
    const s = grid.scale[j] * sx
    effect += (yIdeal[j] - yExact[j] * s) ** 2
    resid += (yFirst[j] - yExact[j] * s) ** 2
  }
  const captured = 1 - Math.sqrt(resid / effect)
  console.log(`    IR drop ${(Math.sqrt(effect) / Math.sqrt(yIdeal.reduce((a, b) => a + b * b, 0)) * 100).toFixed(2)}% of the output; first-order model captures ${(captured * 100).toFixed(1)}% of it`)
  assert.ok(captured > 0.8, `first-order captured only ${captured}`)
})

test('crossbar: valve conductance matches its code (7-bit exact)', () => {
  const { grid } = randomGrid(64, 64, 11)
  const p: Physics = { ideal: false, bits: 7, inBits: 0, progNoise: 0, readNoise: 0, irDrop: 0, seed: 1 }
  for (let k = 0; k < 50; k++) {
    const r0 = (k * 7) % 64
    const c0 = (k * 13) % 64
    const q = grid.codes[grid.index(r0, c0)]
    assert.equal(grid.conductance(r0, c0, p), q / CODE_MAX)
  }
})

// ------------------------------------------------------------------ forward pass
function tinyConfig(arch: 'gpt2' | 'neo'): ModelConfig {
  return {
    arch,
    nLayer: 2,
    nHead: 4,
    d: 64,
    nCtx: 32,
    vocab: 97,
    eps: 1e-5,
    attnScale: arch === 'gpt2' ? 1 / 4 : 1,
    windows: arch === 'gpt2' ? [null, null] : [null, 3],
  }
}

/** Random weights delivered through the same band interface as a checkpoint. */
function tinyModel(cfg: ModelConfig, seed: number): { w: ModelWeights; raw: Map<string, Float32Array> } {
  const w = new ModelWeights(cfg, true)
  const r = rng(seed)
  const raw = new Map<string, Float32Array>()
  const put = (name: string, shape: number[], scale: number, offset = 0) => {
    const n = shape.reduce((a, b) => a * b, 1)
    const data = Float32Array.from({ length: n }, () => offset + randn(r) * scale)
    raw.set(name, data)
    const meta = { name, dtype: 'F32', shape }
    if (!w.want(meta)) return
    const rows = shape[0]
    const br = w.bandRows(meta)
    const rowLen = n / rows
    for (let s = 0; s < rows; s += br) {
      const k = Math.min(br, rows - s)
      w.band({ name, shape, rowStart: s, rows: k, data: data.slice(s * rowLen, (s + k) * rowLen) })
    }
  }
  const d = cfg.d
  const pre = cfg.arch === 'neo' ? 'transformer.' : ''
  put(`${pre}wte.weight`, [cfg.vocab, d], 0.3)
  put(`${pre}wpe.weight`, [cfg.nCtx, d], 0.1)
  for (let l = 0; l < cfg.nLayer; l++) {
    const P = `${pre}h.${l}.`
    put(P + 'ln_1.weight', [d], 0.1, 1)
    put(P + 'ln_1.bias', [d], 0.05)
    put(P + 'ln_2.weight', [d], 0.1, 1)
    put(P + 'ln_2.bias', [d], 0.05)
    if (cfg.arch === 'gpt2') {
      put(P + 'attn.c_attn.weight', [d, 3 * d], 0.15)
      put(P + 'attn.c_attn.bias', [3 * d], 0.05)
      put(P + 'attn.c_proj.weight', [d, d], 0.1)
      put(P + 'attn.c_proj.bias', [d], 0.05)
      put(P + 'mlp.c_fc.weight', [d, 4 * d], 0.1)
      put(P + 'mlp.c_fc.bias', [4 * d], 0.05)
      put(P + 'mlp.c_proj.weight', [4 * d, d], 0.08)
      put(P + 'mlp.c_proj.bias', [d], 0.05)
    } else {
      for (const k of ['q', 'k', 'v']) put(P + `attn.attention.${k}_proj.weight`, [d, d], 0.15)
      put(P + 'attn.attention.out_proj.weight', [d, d], 0.1)
      put(P + 'attn.attention.out_proj.bias', [d], 0.05)
      put(P + 'mlp.c_fc.weight', [4 * d, d], 0.1)
      put(P + 'mlp.c_fc.bias', [4 * d], 0.05)
      put(P + 'mlp.c_proj.weight', [d, 4 * d], 0.08)
      put(P + 'mlp.c_proj.bias', [d], 0.05)
    }
  }
  put(`${pre}ln_f.weight`, [d], 0.1, 1)
  put(`${pre}ln_f.bias`, [d], 0.05)
  w.validate()
  return { w, raw }
}

/** Independent float reference: full sequence, no cache, straight from the raw tensors. */
function referenceLogits(cfg: ModelConfig, raw: Map<string, Float32Array>, ids: number[]): Float32Array {
  const d = cfg.d
  const T = ids.length
  const hd = d / cfg.nHead
  const pre = cfg.arch === 'neo' ? 'transformer.' : ''
  const g = (k: string) => raw.get(pre + k)!
  const lin = (x: Float32Array, W: Float32Array, inn: number, out: number, b: Float32Array | null, outIn: boolean) => {
    const y = new Float32Array(out)
    for (let o = 0; o < out; o++) {
      let s = 0
      for (let i = 0; i < inn; i++) s += x[i] * (outIn ? W[o * inn + i] : W[i * out + o])
      y[o] = s + (b ? b[o] : 0)
    }
    return y
  }
  const ln = (x: Float32Array, gm: Float32Array, bt: Float32Array) => {
    const m = x.reduce((a, b) => a + b, 0) / x.length
    const v = x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length
    return x.map((t, i) => ((t - m) / Math.sqrt(v + cfg.eps)) * gm[i] + bt[i])
  }
  let xs = ids.map((t, p) => {
    const e = new Float32Array(d)
    for (let i = 0; i < d; i++) e[i] = g('wte.weight')[t * d + i] + g('wpe.weight')[p * d + i]
    return e
  })
  for (let l = 0; l < cfg.nLayer; l++) {
    const P = `h.${l}.`
    const a = xs.map((x) => ln(x, g(P + 'ln_1.weight'), g(P + 'ln_1.bias')))
    let q: Float32Array[], k: Float32Array[], v: Float32Array[]
    if (cfg.arch === 'gpt2') {
      const qkv = a.map((x) => lin(x, g(P + 'attn.c_attn.weight'), d, 3 * d, g(P + 'attn.c_attn.bias'), false))
      q = qkv.map((z) => z.slice(0, d))
      k = qkv.map((z) => z.slice(d, 2 * d))
      v = qkv.map((z) => z.slice(2 * d))
    } else {
      q = a.map((x) => lin(x, g(P + 'attn.attention.q_proj.weight'), d, d, null, true))
      k = a.map((x) => lin(x, g(P + 'attn.attention.k_proj.weight'), d, d, null, true))
      v = a.map((x) => lin(x, g(P + 'attn.attention.v_proj.weight'), d, d, null, true))
    }
    const att = xs.map(() => new Float32Array(d))
    for (let t = 0; t < T; t++) {
      for (let h = 0; h < cfg.nHead; h++) {
        const win = cfg.windows[l]
        const js = [...Array(t + 1).keys()].filter((j) => !win || j > t - win)
        const sc = js.map((j) => {
          let s = 0
          for (let i = 0; i < hd; i++) s += q[t][h * hd + i] * k[j][h * hd + i]
          return s * cfg.attnScale
        })
        const mx = Math.max(...sc)
        const e = sc.map((s) => Math.exp(s - mx))
        const z = e.reduce((x, y) => x + y, 0)
        js.forEach((j, n) => {
          for (let i = 0; i < hd; i++) att[t][h * hd + i] += (e[n] / z) * v[j][h * hd + i]
        })
      }
    }
    const proj = cfg.arch === 'gpt2'
      ? att.map((x) => lin(x, g(P + 'attn.c_proj.weight'), d, d, g(P + 'attn.c_proj.bias'), false))
      : att.map((x) => lin(x, g(P + 'attn.attention.out_proj.weight'), d, d, g(P + 'attn.attention.out_proj.bias'), true))
    xs = xs.map((x, t) => x.map((val, i) => val + proj[t][i]))
    const a2 = xs.map((x) => ln(x, g(P + 'ln_2.weight'), g(P + 'ln_2.bias')))
    const outIn = cfg.arch === 'neo'
    const hmid = a2.map((x) => lin(x, g(P + 'mlp.c_fc.weight'), d, 4 * d, g(P + 'mlp.c_fc.bias'), outIn).map(geluNew))
    const mo = hmid.map((x) => lin(x, g(P + 'mlp.c_proj.weight'), 4 * d, d, g(P + 'mlp.c_proj.bias'), outIn))
    xs = xs.map((x, t) => x.map((val, i) => val + mo[t][i]))
  }
  const last = ln(xs[T - 1], g('ln_f.weight'), g('ln_f.bias'))
  return lin(last, g('wte.weight'), d, cfg.vocab, null, true)
}

for (const arch of ['gpt2', 'neo'] as const) {
  test(`forward (${arch}): ideal crossbar + KV cache matches an independent float reference`, () => {
    const cfg = tinyConfig(arch)
    const { w, raw } = tinyModel(cfg, arch === 'gpt2' ? 21 : 22)
    const run = new CpuRunner(w, IDEAL)
    const ids = [3, 50, 7, 7, 91, 12, 0, 44]
    for (let t = 1; t <= ids.length; t++) {
      const got = run.step(ids.slice(0, t))
      const ref = referenceLogits(cfg, raw, ids.slice(0, t))
      let m = 0
      for (let i = 0; i < cfg.vocab; i++) m = Math.max(m, Math.abs(got[i] - ref[i]))
      assert.ok(m < 2e-4, `position ${t}: max |Δlogit| ${m}`)
    }
  })
}

test('forward: water physics stays close to ideal on the tiny model', () => {
  const cfg = tinyConfig('gpt2')
  const { w } = tinyModel(cfg, 23)
  const ids = [5, 9, 31, 2, 77, 64]
  const ideal = new CpuRunner(w, IDEAL).step(ids).slice()
  const water = new CpuRunner(w, { ideal: false, bits: 7, inBits: 10, progNoise: 0.005, readNoise: 0.002, irDrop: 2e-6, seed: 1 }).step(ids)
  let num = 0
  let den = 0
  for (let i = 0; i < cfg.vocab; i++) {
    num += (water[i] - ideal[i]) ** 2
    den += ideal[i] ** 2
  }
  assert.ok(Math.sqrt(num / den) < 0.05, `relative logit error ${Math.sqrt(num / den)}`)
})

// ------------------------------------------------------------------ run
for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures++
    console.log(`  FAIL ${name}\n       ${(err as Error).message}`)
  }
}
if (failures) {
  console.log(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log(`\nall ${tests.length} hall-of-valves tests passed`)
