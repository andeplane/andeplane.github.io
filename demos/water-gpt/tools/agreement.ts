/**
 * Water vs ideal: teacher-forced comparison over a passage.
 * Returns top-1 agreement, mean KL(ideal || water) in nats, and perplexities.
 */
import type { Physics } from '../src/big/crossbar.ts'
import type { ModelWeights } from '../src/big/model.ts'
import { argmax, CpuRunner, logSoftmax } from '../src/big/runner-cpu.ts'

export interface Agreement {
  tokens: number
  top1: number
  kl: number
  pplIdeal: number
  pplWater: number
}

export function perPositionLogprobs(w: ModelWeights, phys: Physics, ids: number[]): Float64Array[] {
  const run = new CpuRunner(w, phys)
  const out: Float64Array[] = []
  for (let t = 1; t <= ids.length; t++) out.push(logSoftmax(run.step(ids.slice(0, t))))
  return out
}

export function perplexity(lps: Float64Array[], ids: number[]): number {
  let nll = 0
  for (let t = 0; t < ids.length - 1; t++) nll -= lps[t][ids[t + 1]]
  return Math.exp(nll / (ids.length - 1))
}

export function compare(ideal: Float64Array[], water: Float64Array[], ids: number[]): Agreement {
  let agree = 0
  let kl = 0
  for (let t = 0; t < ideal.length; t++) {
    if (argmax(ideal[t]) === argmax(water[t])) agree++
    const a = ideal[t]
    const b = water[t]
    let s = 0
    for (let i = 0; i < a.length; i++) s += Math.exp(a[i]) * (a[i] - b[i])
    kl += s
  }
  return {
    tokens: ideal.length,
    top1: agree / ideal.length,
    kl: kl / ideal.length,
    pplIdeal: perplexity(ideal, ids),
    pplWater: perplexity(water, ids),
  }
}
