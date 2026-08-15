import { describe, expect, it } from 'vitest'
import type { Tower } from './towers'
import { stampZaps, ZapController } from './zap'

const tower = (type: string, x: number, y: number, id = 1): Tower =>
  ({ id, type, x, y, angle: 0 }) as Tower

describe('ZapController targeting', () => {
  it('arc chains tower -> nearest -> greedy jumps within chain range', () => {
    const zc = new ZapController()
    const enemies = [
      { x: 30, y: 50 }, // nearest to tower
      { x: 40, y: 50 }, // 10 away — jump 1
      { x: 52, y: 50 }, // 12 away — jump 2
      { x: 90, y: 50 }, // out of chain range — never hit
    ]
    const events = zc.tick(0, [tower('arc', 20, 50)], enemies)
    expect(events).toHaveLength(1)
    expect(events[0].targets.map((t) => t.x)).toEqual([30, 40, 52])
  })

  it('respects cooldown between shots', () => {
    const zc = new ZapController()
    const enemies = [{ x: 30, y: 50 }]
    expect(zc.tick(0, [tower('arc', 20, 50)], enemies)).toHaveLength(1)
    expect(zc.tick(10, [tower('arc', 20, 50)], enemies)).toHaveLength(0)
    expect(zc.tick(500, [tower('arc', 20, 50)], enemies)).toHaveLength(1)
  })

  it('sniper picks the spore closest to the outlet, at any range', () => {
    const zc = new ZapController()
    const events = zc.tick(0, [tower('sniper', 10, 10)], [
      { x: 400, y: 200 },
      { x: 480, y: 30 },
      { x: 100, y: 10 },
    ])
    expect(events[0].targets).toEqual([{ x: 480, y: 30 }])
  })

  it('mortar aims at the densest cluster, not the nearest spore', () => {
    const zc = new ZapController()
    const cluster = [
      { x: 60, y: 40 },
      { x: 62, y: 42 },
      { x: 58, y: 44 },
    ]
    const loner = { x: 35, y: 40 } // nearer to the tower, but alone
    const events = zc.tick(0, [tower('mortar', 30, 40)], [loner, ...cluster])
    expect(events[0].targets[0].x).toBeGreaterThan(50)
  })

  it('holds fire with no target in range', () => {
    const zc = new ZapController()
    expect(zc.tick(0, [tower('arc', 20, 50)], [{ x: 300, y: 50 }])).toHaveLength(0)
  })
})

describe('stampZaps', () => {
  it('stamps damage so one tick delivers the full hit', () => {
    const w = 64
    const field = new Float32Array(w * w)
    const zc = new ZapController()
    const events = zc.tick(0, [tower('sniper', 5, 5)], [{ x: 20, y: 20 }])
    const dirty = stampZaps(field, w, w, events, 0.4)
    expect(dirty).toBe(true)
    // field × towerDamage at the target center == zap damage (3.5)
    expect(field[20 * w + 20] * 0.4).toBeCloseTo(3.5, 3)
  })
})
