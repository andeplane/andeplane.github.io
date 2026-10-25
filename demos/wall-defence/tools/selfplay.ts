// Fast balance gate for `npm run check` — a subset of tools/balance.ts
// (expert + no-tower over 5 seeds). Run `tsx tools/balance.ts` for the full
// profile × seed matrix with the complete criteria set.

import { PROFILES } from './bot'
import { runProfile, statsFor } from './balance'

const seeds = [1, 42, 777, 20260815, 987654]

const expert = statsFor('expert', seeds.map((seed) => runProfile(seed, PROFILES.expert)))
const notower = statsFor('notower', seeds.map((seed) => runProfile(seed, PROFILES.notower)))

for (const s of [expert, notower]) {
  for (const r of s.runs) {
    console.log(
      `${s.name} seed=${r.seed}: wave=${r.wave} pct=${r.pct}% won=${r.won} ticks=${r.ticks}`,
    )
  }
}

let failed = false
if (expert.medWave < 3) {
  console.error(`FAIL: expert median wave ${expert.medWave} < 3`)
  failed = true
} else {
  console.log(`OK: expert median wave ${expert.medWave} >= 3`)
}
if (expert.winRate < 0.2) {
  console.error('FAIL: expert never/rarely wins — game may be unwinnable')
  failed = true
} else {
  console.log(`OK: expert wins ${Math.round(expert.winRate * seeds.length)}/${seeds.length}`)
}
const maxNoTower = Math.max(...notower.runs.map((r) => (r.won ? 99 : r.wave)))
if (maxNoTower > 8 || notower.medWave > 7) {
  console.error(
    `FAIL: no-tower bot too strong (median ${notower.medWave} > 7 or max ${maxNoTower} > 8)`,
  )
  failed = true
} else {
  console.log(
    `OK: no-tower bot never wins (median wave ${notower.medWave}, max ${maxNoTower})`,
  )
}
if (failed) process.exit(1)
