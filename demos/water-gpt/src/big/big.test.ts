/**
 * Fast tests for the big models (run in the build; need no weight files):
 *  - weight-file readers (safetensors, PyTorch zip + pickle) on synthetic files, fed in
 *    random-sized chunks like a network stream; BPE round trips;
 *  - tile storage (half floats, tile scales) for both checkpoint layouts;
 *  - the forward pass (GPT-2 and GPT-Neo flavours, KV cache) on the exact backend against an
 *    independent full-sequence float implementation, and on the water (lattice) backend.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BpeTokenizer, type TokenizerJson } from './bpe.ts'
import { geluNew, type ModelConfig } from './model.ts'
import { BigForward } from './forward.ts'
import { fromHalf, TileGrid, toHalf } from './grid.ts'
import { lcg as rng, randn, tinyConfig, tinyModel } from './synthetic.ts'
import { ByteReader, type TensorBand } from './weights/bytereader.ts'
import { readSafetensors } from './weights/safetensors.ts'
import { readTorchZip } from './weights/torchzip.ts'
import { ExactBackend } from '../engine/backend.ts'
import { LatticeBackend } from '../crossbar/lattice.ts'
import { IDEAL } from '../crossbar/tile.ts'
import { BIG_WATER } from './mode.ts'

const WEIGHTS_DIR = process.env.WATER_GPT_WEIGHTS ?? '/home/claude/model-weights'
const assert = {
  equal: (a: unknown, b: unknown) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown) => expect(a).toEqual(b),
  ok: (v: unknown, msg?: string) => expect(v, msg).toBeTruthy(),
}
const test = it


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

describe('weight files and tokenizer', () => {
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
  if (!existsSync(tokPath)) return
  const tok = new BpeTokenizer(JSON.parse(readFileSync(tokPath, 'utf8')))
  assert.deepEqual(tok.encode('Hello, my name is'), [15496, 11, 616, 1438, 318])
  const s = " It's 3.14 o'clock —  naïve façade\n\nok"
  assert.equal(tok.decode(tok.encode(s)), s)
})

})

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


function logitsOf(seq: BigForward, ids: number[]): Float32Array[] {
  return ids.map((t) => seq.step(t))
}

function maxAbs(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('tile storage', () => {
  it('half floats round to nearest even, like the GPU', () => {
    for (const v of [0, 1, -1, 0.1, 65504, 1e-5, 6e-8, -3.14159, 2049, 2051, 1 / 3]) {
      const h = fromHalf(toHalf(v))
      expect(Math.abs(h - v)).toBeLessThanOrEqual(Math.max(Math.abs(v) * 2 ** -11, 2 ** -25))
    }
    expect(toHalf(2049)).toBe(toHalf(2048)) // tie to even
    expect(fromHalf(toHalf(2051))).toBe(2052)
  })

  it('out_in programming equals in_out programming (values and tile scales)', () => {
    const r = rng(3)
    const w = Float32Array.from({ length: 100 * 70 }, () => randn(r) * 0.05)
    const a = new TileGrid(0, 'a', 100, 70, { half: true, f32: true })
    a.programBand(w.subarray(0, 64 * 70), 0, 64, 70, 'in_out', 0)
    a.programBand(w.subarray(64 * 70), 64, 36, 70, 'in_out', 0)
    const t = new Float32Array(100 * 70)
    for (let i = 0; i < 100; i++) for (let j = 0; j < 70; j++) t[j * 100 + i] = w[i * 70 + j]
    const b = new TileGrid(1, 'b', 100, 70, { half: true, f32: true })
    b.programBand(t, 0, 64, 100, 'out_in', 0)
    b.programBand(t.subarray(64 * 100), 64, 6, 100, 'out_in', 0)
    expect(Array.from(b.half!)).toEqual(Array.from(a.half!))
    expect(Array.from(b.wmax)).toEqual(Array.from(a.wmax))
    expect(Array.from(b.f32!)).toEqual(Array.from(w))
  })
})

describe('forward pass', () => {
  for (const arch of ['gpt2', 'neo'] as const) {
    it(`${arch}: exact backend + KV cache matches an independent float reference`, () => {
      const cfg = tinyConfig(arch)
      const { w, raw } = tinyModel(cfg, arch === 'gpt2' ? 21 : 22)
      const ids = [3, 50, 7, 7, 91, 12, 0, 44]
      const got = logitsOf(new BigForward(cfg, (k) => w.v(k), new ExactBackend(w.weightSpecs())), ids)
      for (let t = 1; t <= ids.length; t++) {
        const ref = referenceLogits(cfg, raw, ids.slice(0, t))
        assert.ok(maxAbs(got[t - 1], ref) < 2e-4, `position ${t}`)
      }
    })

    it(`${arch}: water with an ideal machine equals the exact backend`, () => {
      const cfg = tinyConfig(arch)
      const { w } = tinyModel(cfg, 5)
      const ids = [3, 50, 7, 7, 91, 12]
      const specs = w.weightSpecs()
      const a = logitsOf(new BigForward(cfg, (k) => w.v(k), new ExactBackend(specs)), ids)
      const b = logitsOf(new BigForward(cfg, (k) => w.v(k), new LatticeBackend(specs, IDEAL)), ids)
      for (let t = 0; t < ids.length; t++) expect(maxAbs(a[t], b[t])).toBeLessThan(1e-4)
    })
  }

  it('the big models’ water stays close to ideal on a tiny model', () => {
    const cfg = tinyConfig('gpt2')
    const { w } = tinyModel(cfg, 23)
    const ids = [5, 9, 31, 2, 77, 64]
    const specs = w.weightSpecs()
    const ideal = logitsOf(new BigForward(cfg, (k) => w.v(k), new ExactBackend(specs)), ids).at(-1)!
    const water = logitsOf(new BigForward(cfg, (k) => w.v(k), new LatticeBackend(specs, BIG_WATER)), ids).at(-1)!
    let num = 0
    let den = 0
    for (let i = 0; i < cfg.vocab; i++) {
      num += (water[i] - ideal[i]) ** 2
      den += ideal[i] ** 2
    }
    const rel = Math.sqrt(num / den)
    expect(rel).toBeGreaterThan(1e-3)
    expect(rel).toBeLessThan(0.25)
  })
})
