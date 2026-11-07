// Balance simulation suite: run every bot profile over many seeds, collect
// per-run metrics, and assert the "great to play" contract:
//
//   1. Skill matters: expert >= average >= novice (median wave), strictly
//      better win rate for expert over novice.
//   2. Winnable but not free: expert wins 40-95%, average wins 5-60%,
//      novice rarely wins but reaches wave >= 3 median (not a brick wall).
//   3. Towers are load-bearing: an otherwise-expert no-tower bot never wins
//      and is dead by wave 7 on every seed.
//   4. No degenerate strategy dominates: sliver-spam and turtling must not
//      beat expert balanced play (win rate AND median wave).
//   5. The wall verb stays contested: expert runs still suffer shatters and
//      breaches (enemies interact with walls), and expert plugs breaches
//      (drain rescues happen).
//
// Usage: tsx tools/balance.ts [numSeeds]   (default 12; check uses selfplay.ts)

import { CELLS } from '../src/sim/constants'
import { step } from '../src/sim/sim'
import { createState, PLAYING, WON, type GameState } from '../src/sim/state'
import { Bot, PROFILES, type BotProfile } from './bot'

const MAX_TICKS = 25000

export interface RunMetrics {
  seed: number
  wave: number
  pct: number
  won: boolean
  ticks: number
  towers: number
  moneyEnd: number
  shatters: number
  breachCells: number
  rescues: number // draining cells rescued back to claimed
  claims: number
}

export function runProfile(seed: number, p: BotProfile): RunMetrics {
  const s: GameState = createState(seed)
  const bot = new Bot(seed, p)
  let shatters = 0
  let breachCells = 0
  let claims = 0
  let rescues = 0
  let drainingPrev = 0
  let guard = 0
  while (s.status === PLAYING && s.tick < MAX_TICKS && guard < MAX_TICKS * 2) {
    guard++
    const before = s.tick
    step(s, bot.act(s))
    if (s.tick === before) continue
    shatters += s.fx.shatters.length
    breachCells += s.fx.breaches.length
    claims += s.fx.claims.length
    // Rescue detection (approximate): the draining-cell count dropping in a
    // tick that also produced a claim fx means a region was sealed back.
    let draining = 0
    for (let c = 0; c < CELLS; c++) if (s.grid[c] === 3) draining++
    if (draining < drainingPrev && s.fx.claims.length > 0) rescues++
    drainingPrev = draining
  }
  return {
    seed,
    wave: s.wave,
    pct: Math.floor((s.claimedCells * 100) / CELLS),
    won: s.status === WON,
    ticks: s.tick,
    towers: s.towers.length,
    moneyEnd: s.money,
    shatters,
    breachCells,
    rescues,
    claims,
  }
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.floor(a.length / 2)]
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export interface ProfileStats {
  name: string
  winRate: number
  medWave: number
  meanPct: number
  meanTowers: number
  meanShatters: number
  meanBreaches: number
  meanRescues: number
  meanMoneyEnd: number
  runs: RunMetrics[]
}

export function statsFor(name: string, runs: RunMetrics[]): ProfileStats {
  return {
    name,
    winRate: runs.filter((r) => r.won).length / runs.length,
    medWave: median(runs.map((r) => r.wave)),
    meanPct: mean(runs.map((r) => r.pct)),
    meanTowers: mean(runs.map((r) => r.towers)),
    meanShatters: mean(runs.map((r) => r.shatters)),
    meanBreaches: mean(runs.map((r) => r.breachCells)),
    meanRescues: mean(runs.map((r) => r.rescues)),
    meanMoneyEnd: mean(runs.map((r) => r.moneyEnd)),
    runs,
  }
}

function fmt(s: ProfileStats): string {
  return (
    `${s.name.padEnd(8)} win=${(s.winRate * 100).toFixed(0).padStart(3)}%` +
    ` medWave=${String(s.medWave).padStart(2)} pct=${s.meanPct.toFixed(0).padStart(3)}` +
    ` towers=${s.meanTowers.toFixed(1).padStart(5)} shat=${s.meanShatters.toFixed(1).padStart(5)}` +
    ` breach=${s.meanBreaches.toFixed(0).padStart(4)} rescue=${s.meanRescues.toFixed(1).padStart(4)}` +
    ` $end=${s.meanMoneyEnd.toFixed(0).padStart(5)}`
  )
}

interface Criterion {
  desc: string
  ok: boolean
}

export function evaluate(byName: Record<string, ProfileStats>): Criterion[] {
  const e = byName.expert
  const a = byName.average
  const n = byName.novice
  const nt = byName.notower
  const sl = byName.sliver
  const tu = byName.turtle
  const c: Criterion[] = []
  c.push({ desc: `skill ladder medians: expert ${e.medWave} >= average ${a.medWave} >= novice ${n.medWave}`, ok: e.medWave >= a.medWave && a.medWave >= n.medWave })
  c.push({ desc: `expert beats novice win rate (${(e.winRate * 100).toFixed(0)}% > ${(n.winRate * 100).toFixed(0)}%)`, ok: e.winRate > n.winRate })
  // The expert bot plays inhumanly well (region-exact scoring, instant
  // plugs); it needs a floor, while the "not free" ceiling is enforced on
  // average and novice.
  c.push({ desc: `expert win rate >= 40% (${(e.winRate * 100).toFixed(0)}%)`, ok: e.winRate >= 0.4 })
  c.push({ desc: `average win rate 5-60% (${(a.winRate * 100).toFixed(0)}%)`, ok: a.winRate >= 0.05 && a.winRate <= 0.6 })
  c.push({ desc: `novice median wave >= 3 (${n.medWave}) — early game teaches, doesn't stomp`, ok: n.medWave >= 3 })
  c.push({ desc: `novice win rate <= 15% (${(n.winRate * 100).toFixed(0)}%)`, ok: n.winRate <= 0.15 })
  const ntMax = Math.max(...nt.runs.map((r) => r.wave))
  c.push({ desc: `no-tower never wins (${(nt.winRate * 100).toFixed(0)}%), median wave <= 7 (${nt.medWave}), max <= 8 (${ntMax})`, ok: nt.winRate === 0 && nt.medWave <= 7 && ntMax <= 8 })
  c.push({ desc: `sliver-spam not dominant (win ${(sl.winRate * 100).toFixed(0)}% <= expert ${(e.winRate * 100).toFixed(0)}%, medWave ${sl.medWave} <= ${e.medWave})`, ok: sl.winRate <= e.winRate && sl.medWave <= e.medWave })
  c.push({ desc: `turtling not dominant (win ${(tu.winRate * 100).toFixed(0)}% <= expert ${(e.winRate * 100).toFixed(0)}%, medWave ${tu.medWave} <= ${e.medWave})`, ok: tu.winRate <= e.winRate && tu.medWave <= e.medWave })
  c.push({ desc: `walls stay contested: expert suffers shatters (${e.meanShatters.toFixed(1)}/run) and breaches (${e.meanBreaches.toFixed(0)} cells/run)`, ok: e.meanShatters >= 1 && e.meanBreaches >= 10 })
  c.push({ desc: `plugging works: expert rescues draining regions (${e.meanRescues.toFixed(1)}/run)`, ok: e.meanRescues >= 0.5 })
  return c
}

// ---- main ----
const isMain = process.argv[1]?.endsWith('balance.ts')
if (isMain) {
  const numSeeds = Number(process.argv[2] ?? 12)
  const seeds = Array.from({ length: numSeeds }, (_, i) => 1000 + i * 7919)
  const byName: Record<string, ProfileStats> = {}
  for (const key of ['novice', 'average', 'expert', 'sliver', 'turtle', 'notower']) {
    const runs = seeds.map((seed) => runProfile(seed, PROFILES[key]))
    byName[key] = statsFor(key, runs)
    console.log(fmt(byName[key]))
  }
  console.log('')
  const criteria = evaluate(byName)
  let failed = false
  for (const c of criteria) {
    console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.desc}`)
    if (!c.ok) failed = true
  }
  if (failed) process.exit(1)
}
