// Determinism harness: play a bot game recording the event log, then replay
// the log against a fresh state and compare PER-TICK hash streams. Reports
// the first divergent tick. Exits non-zero on failure.

import { step } from '../src/sim/sim'
import { createState, hashState, PLAYING } from '../src/sim/state'
import type { LoggedEvent, SimEvent } from '../src/sim/events'
import { Bot } from './bot'

const MAX_TICKS = 25000

function playWithBot(seed: number): { log: LoggedEvent[]; hashes: number[] } {
  const s = createState(seed)
  const bot = new Bot(seed, { useTowers: true })
  const log: LoggedEvent[] = []
  const hashes: number[] = []
  let guard = 0
  while (s.status === PLAYING && guard < MAX_TICKS * 2) {
    guard++
    const events = bot.act(s)
    if (events.length > 0) {
      for (const e of events) log.push({ tick: s.tick, e })
    }
    const before = s.tick
    step(s, events)
    if (s.tick !== before) hashes.push(hashState(s))
    if (s.tick >= MAX_TICKS) break
  }
  return { log, hashes }
}

function replay(seed: number, log: LoggedEvent[], expected: number[]): number {
  const s = createState(seed)
  let li = 0
  let hi = 0
  let guard = 0
  while (hi < expected.length && guard < MAX_TICKS * 4) {
    guard++
    const events: SimEvent[] = []
    while (li < log.length && log[li].tick === s.tick) {
      events.push(log[li].e)
      li++
    }
    const before = s.tick
    step(s, events)
    if (s.tick !== before) {
      if (hashState(s) !== expected[hi]) return s.tick
      hi++
    }
    if (s.status !== PLAYING && li >= log.length) break
  }
  return hi === expected.length ? -1 : -2
}

let failed = false
for (const seed of [1, 42, 20260815]) {
  const { log, hashes } = playWithBot(seed)
  const result = replay(seed, log, hashes)
  if (result === -1) {
    console.log(`determinism seed=${seed}: OK (${hashes.length} ticks, ${log.length} events)`)
  } else if (result === -2) {
    console.error(`determinism seed=${seed}: FAIL — replay ended early`)
    failed = true
  } else {
    console.error(`determinism seed=${seed}: FAIL — first divergent tick ${result}`)
    failed = true
  }
}
if (failed) process.exit(1)
