import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { SeededRng } from '../core/rng'
import type { ObservableSnapshot } from '../sim/types'
import { buildMap } from './map'
import { Engine, type EngineCallbacks, type LevelConfig } from './Engine'

const level: LevelConfig = {
  name: 'test',
  description: '',
  lives: 3,
  startingGold: 100,
  waves: [
    { count: 2, hp: 1, interval: 2, arms: [0] },
    { count: 2, hp: 1, interval: 2, arms: [1], surge: true },
  ],
}

function makeEngine(): { engine: Engine; events: string[] } {
  const events: string[] = []
  const callbacks: EngineCallbacks = {
    onGameOver: (w) => events.push(`over:${w}`),
    onBreach: () => events.push('breach'),
    onBuildRejected: (r) => events.push(`rejected:${r}`),
    onWaveStart: (w, surge) => events.push(`wave:${w}${surge ? ':surge' : ''}`),
    onWaveCleared: (w) => events.push(`cleared:${w}`),
  }
  const engine = new Engine(buildMap(CONFIG.sim.width, CONFIG.sim.height), callbacks, new SeededRng(7).stream('spawn'), level)
  return { engine, events }
}

const obs = (tick: number, kills: number, escapes: number, outletFlux = tick * 14): ObservableSnapshot => ({
  tick,
  breachCount: 0,
  kills,
  suffocated: 0,
  escapes,
  outletFlux,
  outletInflux: 0,
})

describe('Engine waves', () => {
  it('runs waves to a defender win, paying bounty and clear bonuses', () => {
    const { engine, events } = makeEngine()
    engine.start()
    expect(engine.phase).toBe('wave')
    expect(events).toContain('wave:1')

    // Let wave 1 spawn out.
    for (let t = 0; t < 10; t++) engine.tick(null)
    expect(engine.drainSpawns().length).toBe(2)
    expect(engine.spawnedTotal).toBe(2)

    // All spawned spores die → wave cleared, back to build.
    const goldBefore = engine.gold
    engine.tick(obs(100, 2, 0))
    expect(engine.killsTotal).toBe(2)
    expect(engine.gold).toBeGreaterThanOrEqual(
      goldBefore + 2 * CONFIG.enemies.bounty + CONFIG.match.clearBonusBase,
    )
    expect(events).toContain('cleared:1')
    expect(engine.phase).toBe('build')

    // Wave 2 (surge), same story → defender wins.
    engine.start()
    expect(events).toContain('wave:2:surge')
    expect(engine.surging).toBe(true)
    for (let t = 0; t < 10; t++) engine.tick(null)
    engine.tick(obs(200, 4, 0))
    expect(engine.winner).toBe('defender')
    expect(events).toContain('over:defender')
    expect(engine.surging).toBe(false)
  })

  it('escaped spores drain lives to an attacker win', () => {
    const { engine, events } = makeEngine()
    engine.start()
    for (let t = 0; t < 10; t++) engine.tick(null)
    engine.tick(obs(100, 0, 2))
    expect(engine.lives).toBe(1)
    // 2 of 2 spawned are gone → the wave counts as cleared even though it hurt.
    expect(engine.phase).toBe('build')
    engine.tick(obs(101, 0, 3))
    expect(engine.lives).toBe(0)
    expect(engine.winner).toBe('attacker')
    expect(events).toContain('over:attacker')
  })

  it('a strangled river makes the base thirst and bleed lives', () => {
    const { engine } = makeEngine()
    engine.start()
    // Zero net volume across a full measurement window → intake 0 → thirsting.
    engine.tick(obs(10, 0, 0, 100))
    expect(engine.thirsting).toBe(false) // window not filled yet
    engine.tick(obs(1000, 0, 0, 100))
    expect(engine.thirsting).toBe(true)
    const before = engine.lives
    const drainTicks = CONFIG.match.thirstGraceTicks + CONFIG.match.thirstLifeTicks * 2 + 2
    for (let t = 0; t < drainTicks; t++) engine.tick(null)
    expect(engine.lives).toBeLessThanOrEqual(before - 2)
    // And the river escalates: flood pressure ramps while starved.
    expect(engine.floodPressure).toBeGreaterThan(0.2)
    expect(engine.inletStates[0].flood).toBe(engine.floodPressure)
    // Restore the flow → thirst recovers, no further bleeding.
    engine.tick(obs(4000, 0, 0, 100 + 14 * 3980))
    expect(engine.thirsting).toBe(false)
  })

  it('auto-starts the wave when the build countdown expires', () => {
    const { engine } = makeEngine()
    for (let t = 0; t < CONFIG.match.buildTicks + 1; t++) engine.tick(null)
    expect(engine.phase).toBe('wave')
  })
})
