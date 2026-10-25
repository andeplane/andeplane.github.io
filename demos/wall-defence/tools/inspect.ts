// Scratch: replay a recorded log to a tick and dump cell-state counts.
// Usage: tsx tools/inspect.ts <logPath> <tick>

import { readFileSync } from 'node:fs'
import { step } from '../src/sim/sim'
import { createState } from '../src/sim/state'
import type { LoggedEvent, SimEvent } from '../src/sim/events'

const rec = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  seed: number
  log: LoggedEvent[]
}
const target = Number(process.argv[3] ?? 12600)
const s = createState(rec.seed)
let li = 0
while (s.tick < target && s.status === 0) {
  const events: SimEvent[] = []
  while (li < rec.log.length && rec.log[li].tick === s.tick) events.push(rec.log[li++].e)
  step(s, events)
}
let open = 0
let wall = 0
let claimed = 0
let drain = 0
for (const v of s.grid) {
  if (v === 0) open++
  else if (v === 1) wall++
  else if (v === 2) claimed++
  else drain++
}
console.log({
  tick: s.tick,
  wave: s.wave,
  balls: s.balls.length,
  open,
  wall,
  claimed,
  drain,
  claimedCells: s.claimedCells,
  towers: s.towers.length,
  money: s.money,
})
