import { CpuCrossbar } from '../../crossbar/matrix.ts'
import { LatticeBackend } from '../../crossbar/lattice.ts'
import { IDEAL, type CrossbarSettings } from '../../crossbar/tile.ts'
import type { Backend } from '../../engine/backend.ts'
import { argmax, BigForward } from '../forward.ts'
import type { ModelConfig } from '../model.ts'
import { tinyConfig, tinyModel } from '../synthetic.ts'
import { GpuMachine, readBuffer } from './machine.ts'

/**
 * In-browser check of the WebGPU machine against the CPU water, needing no weight files:
 *  1. one matrix (3 × 5 tiles with ragged edges) against CpuCrossbar itself;
 *  2. every op of a one-layer random model (embedding + Q·K·V, attention over 70 cached
 *     positions, output head) against LatticeBackend, CpuCrossbar's fast twin;
 *  3. whole two-layer random models (GPT-2 and GPT-Neo with a local window), 80 positions.
 * Run from the page with `await __hall.selftest()`.
 */

const S = (s: CrossbarSettings): CrossbarSettings => ({ ...s, errors: 'hash', ir: 'first-order' })

export const CHECK_MACHINES: [string, CrossbarSettings][] = [
  ['ideal', IDEAL],
  ['museum (6 bit, 0.5%, λ 3e-5)', { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1 }],
  ['stops only (4 bit)', { bits: 4, noise: 0, lambda: 0, seed: 1 }],
  ['errors only (2%)', { bits: null, noise: 0.02, lambda: 0, seed: 3 }],
  ['manifold only (λ 1e-4)', { bits: null, noise: 0, lambda: 1e-4, seed: 1 }],
  ['leaky (4 bit, 2%, λ 1e-4)', { bits: 4, noise: 0.02, lambda: 1e-4, seed: 5 }],
]

function rel(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let e = 0
  let n = 0
  for (let i = 0; i < b.length; i++) {
    e += (a[i] - b[i]) ** 2
    n += b[i] ** 2
  }
  return Math.sqrt(e / Math.max(n, 1e-30))
}

function build(device: GPUDevice, cfg: ModelConfig, seed: number) {
  let machine: GpuMachine | null = null
  const { w } = tinyModel(cfg, seed, { half: true, f32: false }, (wt) => {
    machine = new GpuMachine(device, wt, S(IDEAL))
    wt.onBand = (e) => machine!.uploadBand(e)
  })
  const m = machine as unknown as GpuMachine
  m.finalize()
  return { w, m, specs: w.weightSpecs(true) }
}

/** 1. The output head of a one-layer model is exactly one crossbar: compare it with CpuCrossbar. */
async function matrixCheck(device: GPUDevice): Promise<Record<string, unknown>> {
  const cfg = tinyConfig('gpt2', { d: 192, nHead: 3, nLayer: 1, vocab: 300, nCtx: 8 })
  const { m, specs } = build(device, cfg, 11)
  const lm = specs.find((s) => s.name === 'lm_head')!
  const out: Record<string, unknown> = { check: `${lm.K} × ${lm.N} crossbar vs CpuCrossbar (relative RMS)` }
  for (const [name, s0] of CHECK_MACHINES) {
    const s = S(s0)
    m.setPhysics(s)
    const gpu = await m.step([5, 17])
    const a = await m.read('a')
    const ref = new CpuCrossbar('lm_head', lm.W, lm.K, lm.N, true, s).matvec(a.subarray(0, lm.K))
    out[name] = rel(gpu, ref)
  }
  m.destroy()
  return out
}

/** 2. Op by op on a one-layer model, 70 positions (two attention tiles). */
async function opCheck(device: GPUDevice): Promise<Record<string, unknown>[]> {
  const cfg = tinyConfig('gpt2', { d: 128, nHead: 2, nLayer: 1, nCtx: 160, vocab: 211, windows: [null] })
  const { w, m, specs } = build(device, cfg, 7)
  const hd = cfg.d / cfg.nHead
  const ids = Array.from({ length: 70 }, (_, i) => (i * 37 + 11) % cfg.vocab)
  const res: Record<string, unknown>[] = []
  for (const [name, s0] of CHECK_MACHINES) {
    const s = S(s0)
    m.setPhysics(s)
    const lat = new LatticeBackend(specs, s)
    const rec: Record<string, Float32Array> = {}
    const att = new Float32Array(cfg.d)
    const be: Backend = {
      kind: 'water',
      trace: null,
      linear: (n, x) => (rec[n] = lat.linear(n, x)),
      column: (n, j) => lat.column(n, j),
      scores: (t, q, k) => lat.scores(t, q, k),
      mix: (t, p, v) => {
        const y = lat.mix(t, p, v)
        att.set(y, Number(/h(\d+)/.exec(t)![1]) * hd)
        rec[`${t}:p`] = p.slice()
        return y
      },
    }
    const seq = new BigForward(cfg, (k) => w.v(k), be)
    for (const t of ids) seq.step(t)
    await m.step(ids)
    const qkv = await m.read('qkv')
    const attG = await m.read('att')
    const logits = await m.read('logits')
    const probs = await readBuffer(device, m.debugScores)
    let p = 0
    for (let h = 0; h < cfg.nHead; h++) p = Math.max(p, rel(probs.subarray(h * m.ctx, h * m.ctx + ids.length), rec[`l0.h${h}.av:p`]))
    res.push({
      check: `ops at position ${ids.length} (relative RMS)`,
      machine: name,
      'embedding + Q·K·V': rel(qkv.subarray(0, 3 * cfg.d), rec['L0.qkv']),
      'QKᵀ + softmax': p,
      'attention·V': rel(attG.subarray(0, cfg.d), att),
      'output head': rel(logits, rec['lm_head']),
    })
  }
  m.destroy()
  return res
}

/** 3. Whole models, 80 positions. */
async function modelCheck(device: GPUDevice): Promise<Record<string, unknown>[]> {
  const res: Record<string, unknown>[] = []
  for (const arch of ['gpt2', 'neo'] as const) {
    const cfg = tinyConfig(arch, { d: 128, nHead: arch === 'gpt2' ? 2 : 4, nCtx: 160, vocab: 211, windows: arch === 'gpt2' ? [null, null] : [null, 70] })
    const { w, m, specs } = build(device, cfg, 7)
    const ids = Array.from({ length: 80 }, (_, i) => (i * 37 + 11) % cfg.vocab)
    for (const [name, s0] of CHECK_MACHINES) {
      const s = S(s0)
      m.setPhysics(s)
      const seq = new BigForward(cfg, (k) => w.v(k), new LatticeBackend(specs, s))
      let worst = 0
      let sum = 0
      let agree = 0
      for (let t = 0; t < ids.length; t++) {
        const cpu = seq.step(ids[t])
        const gpu = await m.step(ids.slice(0, t + 1))
        const r = rel(gpu, cpu)
        worst = Math.max(worst, r)
        sum += r
        if (argmax(gpu) === argmax(cpu)) agree++
      }
      res.push({ check: `${arch} model, logits over ${ids.length} positions (relative RMS)`, machine: name, mean: sum / ids.length, worst, argmaxAgree: agree / ids.length })
    }
    m.destroy()
  }
  return res
}

export async function gpuSelfTest(device: GPUDevice): Promise<Record<string, unknown>[]> {
  return [await matrixCheck(device), ...(await opCheck(device)), ...(await modelCheck(device))]
}
