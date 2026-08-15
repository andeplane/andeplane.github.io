// Record a bot game's event log as JSON (stdout) for deterministic replay in
// the browser via window.__wd — used to stage the preview screenshot.
// Usage: tsx tools/record.ts <seed> [maxTicks]

import { step } from '../src/sim/sim'
import { createState, PLAYING } from '../src/sim/state'
import type { LoggedEvent } from '../src/sim/events'
import { Bot } from './bot'

const seed = Number(process.argv[2] ?? 1)
const maxTicks = Number(process.argv[3] ?? 25000)

const s = createState(seed)
const bot = new Bot(seed, { useTowers: true })
const log: LoggedEvent[] = []
let guard = 0
while (s.status === PLAYING && s.tick < maxTicks && guard < maxTicks * 2) {
  guard++
  const events = bot.act(s)
  for (const e of events) log.push({ tick: s.tick, e })
  step(s, events)
}
console.log(JSON.stringify({ seed, finalTick: s.tick, status: s.status, wave: s.wave, log }))
