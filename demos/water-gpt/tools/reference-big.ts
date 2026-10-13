/**
 * The slow reference check for the big modes (not part of the build; needs the dev copies
 * of the checkpoints, see tools/node-models.ts, and skips a model whose files are absent).
 *
 *   npm run reference                      # both models, the museum machine
 *   npm run reference -- gpt2 --sweep      # also try other machines
 *
 * For each model:
 *  - ideal water (LatticeBackend with an ideal machine) against the plain float forward
 *    pass (ExactBackend): must agree to float rounding;
 *  - perplexity of the float model on a passage (GPT-2 should be well under 60);
 *  - water vs float, teacher-forced over the passage: top-1 agreement and KL(float‖water);
 *  - greedy samples from both;
 *  - CPU time per token.
 */
import { performance } from 'node:perf_hooks'
import { ExactBackend, type Backend } from '../src/engine/backend.ts'
import { LatticeBackend } from '../src/crossbar/lattice.ts'
import { IDEAL, type CrossbarSettings } from '../src/crossbar/tile.ts'
import { argmax, BigForward, logSoftmax } from '../src/big/forward.ts'
import { BIG_WATER } from '../src/big/mode.ts'
import type { ModelWeights } from '../src/big/model.ts'
import { haveWeights, loadModel, loadTokenizer } from './node-models.ts'

const PASSAGES = {
  gpt2:
    'The city council voted on Tuesday to approve a new budget for the coming year. The plan includes funding for road repairs, new buses and a second library branch on the east side of town. Several residents spoke at the meeting, and most of them supported the proposal, although some asked for more money for parks.',
  tinystories:
    'Once upon a time, there was a little girl named Lily. She loved to play outside in the sunshine. One day, she saw a big red ball in the park. She ran to the ball and kicked it high into the sky. Her friend Tom came to play with her, and they laughed all day.',
}
const PROMPTS = { gpt2: 'The museum of water computers opened its doors', tinystories: 'Once upon a time, there was a little boat made of' }

const args = process.argv.slice(2)
const models = (['gpt2', 'tinystories'] as const).filter((m) => !args.some((a) => a === 'gpt2' || a === 'tinystories') || args.includes(m))
const sweep = args.includes('--sweep')
const nGen = Number(args.find((a) => a.startsWith('--gen='))?.slice(6) ?? 24)

function seq(w: ModelWeights, be: Backend): BigForward {
  return new BigForward(w.cfg, (k) => w.v(k), be)
}

function teacherForced(w: ModelWeights, be: Backend, ids: number[]): { lps: Float64Array[]; ms: number } {
  const s = seq(w, be)
  const t0 = performance.now()
  const lps = ids.map((t) => logSoftmax(s.step(t)))
  return { lps, ms: (performance.now() - t0) / ids.length }
}

function greedy(w: ModelWeights, be: Backend, ids: number[], n: number): number[] {
  const s = seq(w, be)
  let logits: Float32Array = new Float32Array(0)
  for (const t of ids) logits = s.step(t)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = argmax(logits)
    out.push(t)
    logits = s.step(t)
  }
  return out
}

function stats(ideal: Float64Array[], water: Float64Array[], ids: number[]) {
  let agree = 0
  let kl = 0
  let nllI = 0
  let nllW = 0
  for (let t = 0; t < ideal.length; t++) {
    if (argmax(ideal[t]) === argmax(water[t])) agree++
    const a = ideal[t]
    const b = water[t]
    let s = 0
    for (let i = 0; i < a.length; i++) s += Math.exp(a[i]) * (a[i] - b[i])
    kl += s
    if (t + 1 < ids.length) {
      nllI -= a[ids[t + 1]]
      nllW -= b[ids[t + 1]]
    }
  }
  const n = ideal.length
  return { top1: agree / n, kl: kl / n, pplIdeal: Math.exp(nllI / (n - 1)), pplWater: Math.exp(nllW / (n - 1)) }
}

const tok = loadTokenizer()
for (const model of models) {
  if (!haveWeights(model)) {
    console.log(`${model}: weights not found, skipped`)
    continue
  }
  console.log(`\n=== ${model} ===`)
  let t0 = performance.now()
  const w = await loadModel(model)
  console.log(`loaded ${w.totalValves.toLocaleString('en-US')} valves in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  const specs = w.weightSpecs()
  const exact = new ExactBackend(specs)
  const ids = tok.encode(PASSAGES[model])
  const ref = teacherForced(w, exact, ids)
  console.log(`passage: ${ids.length} tokens · float model ${ref.ms.toFixed(0)} ms/token`)

  // ideal water = float
  const idealWater = new LatticeBackend(specs, IDEAL)
  const iw = teacherForced(w, idealWater, ids.slice(0, 8))
  let maxD = 0
  for (let t = 0; t < iw.lps.length; t++) for (let i = 0; i < iw.lps[t].length; i++) maxD = Math.max(maxD, Math.abs(iw.lps[t][i] - ref.lps[t][i]))
  console.log(`ideal water vs float: max |Δ log p| = ${maxD.toExponential(2)} over 8 positions`)

  const machines: [string, CrossbarSettings][] = [['museum', BIG_WATER]]
  if (sweep)
    machines.push(
      ['8-bit', { ...BIG_WATER, bits: 8 }],
      ['5-bit', { ...BIG_WATER, bits: 5 }],
      ['4-bit', { ...BIG_WATER, bits: 4 }],
      ['stops only (6-bit)', { ...IDEAL, bits: 6, errors: 'hash', ir: 'first-order' }],
      ['errors only (0.5%)', { ...IDEAL, noise: 0.005, errors: 'hash', ir: 'first-order' }],
      ['manifold only (3e-5)', { ...IDEAL, lambda: 3e-5, errors: 'hash', ir: 'first-order' }],
      ['1% errors', { ...BIG_WATER, noise: 0.01 }],
      ['λ = 1e-4', { ...BIG_WATER, lambda: 1e-4 }],
    )
  for (const [name, s] of machines) {
    t0 = performance.now()
    const water = new LatticeBackend(specs, s)
    water.commissionSync()
    const build = (performance.now() - t0) / 1000
    const wr = teacherForced(w, water, ids)
    const st = stats(ref.lps, wr.lps, ids)
    console.log(
      `${name.padEnd(22)} top-1 ${(st.top1 * 100).toFixed(1)}% · KL ${st.kl.toFixed(4)} nats · perplexity float ${st.pplIdeal.toFixed(2)} / water ${st.pplWater.toFixed(2)} · realise ${build.toFixed(0)} s · ${wr.ms.toFixed(0)} ms/token`,
    )
    if (name === 'museum') {
      const p = tok.encode(PROMPTS[model])
      const a = greedy(w, exact, p, nGen)
      const b = greedy(w, water, p, nGen)
      console.log(`  prompt: ${JSON.stringify(PROMPTS[model])}`)
      console.log(`  float : ${JSON.stringify(tok.decode(a))}`)
      console.log(`  water : ${JSON.stringify(tok.decode(b))}`)
      let same = 0
      while (same < a.length && a[same] === b[same]) same++
      console.log(`  identical for the first ${same} of ${nGen} tokens`)
    }
  }
}
