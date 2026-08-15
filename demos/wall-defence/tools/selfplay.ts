// Self-play balance harness (project rule: balance claims come from bot
// stats, not vibes). Three assertions:
//   1. A tower-using bot reaches wave >= 3 median across seeds.
//   2. A tower-using bot wins at least once — the game is winnable.
//   3. A no-tower bot never wins and loses by wave <= 7 on every seed — the
//      structural guarantee that the TD layer is mandatory.

import { CELLS } from '../src/sim/constants'
import { step } from '../src/sim/sim'
import { createState, PLAYING, WON, type GameState } from '../src/sim/state'
import { Bot } from './bot'

const MAX_TICKS = 25000

interface RunResult {
  wave: number
  pct: number
  won: boolean
  ticks: number
}

function run(seed: number, useTowers: boolean): RunResult {
  const s: GameState = createState(seed)
  const bot = new Bot(seed, { useTowers })
  let guard = 0
  while (s.status === PLAYING && s.tick < MAX_TICKS && guard < MAX_TICKS * 2) {
    guard++
    step(s, bot.act(s))
  }
  return {
    wave: s.wave,
    pct: Math.floor((s.claimedCells * 100) / CELLS),
    won: s.status === WON,
    ticks: s.tick,
  }
}

const seeds = [1, 42, 777, 20260815, 987654]

console.log('— with towers —')
const withTowers = seeds.map((seed) => {
  const r = run(seed, true)
  console.log(`seed=${seed}: wave=${r.wave} pct=${r.pct}% won=${r.won} ticks=${r.ticks}`)
  return r
})

console.log('— no towers —')
const noTowers = seeds.map((seed) => {
  const r = run(seed, false)
  console.log(`seed=${seed}: wave=${r.wave} pct=${r.pct}% won=${r.won} ticks=${r.ticks}`)
  return r
})

const sortedWaves = withTowers.map((r) => r.wave).sort((a, b) => a - b)
const median = sortedWaves[Math.floor(sortedWaves.length / 2)]
let failed = false
if (median < 3) {
  console.error(`FAIL: tower-bot median wave ${median} < 3`)
  failed = true
} else {
  console.log(`OK: tower-bot median wave ${median} >= 3`)
}
const wins = withTowers.filter((r) => r.won).length
if (wins < 1) {
  console.error('FAIL: tower-bot never wins — game may be unwinnable')
  failed = true
} else {
  console.log(`OK: tower-bot wins ${wins}/${seeds.length}`)
}
const maxNoTower = Math.max(...noTowers.map((r) => (r.won ? 99 : r.wave)))
if (maxNoTower > 7) {
  console.error(`FAIL: no-tower bot survived past wave 7 (max ${maxNoTower})`)
  failed = true
} else {
  console.log(`OK: no-tower bot never wins, always dead by wave ${maxNoTower} <= 7`)
}
if (failed) process.exit(1)
