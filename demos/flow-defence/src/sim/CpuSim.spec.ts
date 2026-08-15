import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import type { DomainMap } from '../engine/map'
import { CpuSim } from './CpuSim'
import { CELL } from './core/constants'

/** Small hand-built domain: bedrock frame, one inlet segment, full outlet. */
function miniMap(width = 96, height = 48): DomainMap {
  const cellType = new Uint32Array(width * height)
  const solidity = new Float32Array(width * height)
  const idx = (x: number, y: number) => y * width + x
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < 3 || y >= height - 3) cellType[idx(x, y)] = CELL.BEDROCK
    }
  }
  const y0 = 8
  const y1 = height - 9
  for (let y = 3; y < height - 3; y++) {
    cellType[idx(0, y)] = y >= y0 && y <= y1 ? CELL.INLET : CELL.BEDROCK
    cellType[idx(width - 1, y)] = CELL.OUTLET
  }
  return {
    width,
    height,
    cellType,
    solidity,
    inletSegments: [{ index: 0, y0, y1 }],
    outletY0: 3,
    outletY1: height - 4,
  }
}

describe('CpuSim', () => {
  it('spores ride the current to the outlet', { timeout: 120_000 }, () => {
    const sim = new CpuSim(miniMap())
    sim.setInletStates([{ openness: 1, biomass: 0, surge: 0 }])
    for (let t = 0; t < 600; t++) sim.tick(true)
    for (let i = 0; i < 5; i++) sim.spawn(4, 14 + i * 4, 1, i / 5)
    let ticks = 0
    while (sim.aliveCount() > 0 && ticks < 4000) {
      sim.tick()
      ticks++
    }
    // Passive drifters with a swim bias: everyone reaches the outlet.
    expect(sim.escapesTotal).toBe(5)
    expect(sim.towerKillsTotal + sim.suffocatedTotal).toBe(0)
    expect(ticks).toBeGreaterThan(60) // travel takes real time — no teleporting
  })

  it('a neutralizer field in the channel kills spores before they escape', { timeout: 120_000 }, () => {
    const sim = new CpuSim(miniMap())
    sim.setInletStates([{ openness: 1, biomass: 0, surge: 0 }])
    for (let t = 0; t < 600; t++) sim.tick(true)
    // Splat a strong kill disc across the mid-channel (like one neutralizer).
    const { radius, rate } = CONFIG.towers.neutralizer
    const cx = 48
    const cy = 24
    for (let y = 0; y < sim.map.height; y++) {
      for (let x = 0; x < sim.map.width; x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d <= radius + 8) sim.towerField[y * sim.map.width + x] = rate
      }
    }
    for (let i = 0; i < 5; i++) sim.spawn(4, 18 + i * 3, 1, i / 5)
    let ticks = 0
    while (sim.aliveCount() > 0 && ticks < 4000) {
      sim.tick()
      ticks++
    }
    expect(sim.towerKillsTotal).toBe(5)
    expect(sim.escapesTotal).toBe(0)
  })

  it('walls under flow erode and eventually breach', { timeout: 120_000 }, () => {
    const sim = new CpuSim(miniMap())
    sim.setInletStates([{ openness: 1, biomass: 0, surge: 1 }])
    for (let t = 0; t < 400; t++) sim.tick(true)
    // A full dam across the channel.
    const x = 48
    for (let y = 3; y < sim.map.height - 3; y++) {
      const idx = y * sim.map.width + x
      sim.ref.cellType[idx] = CELL.WALL
      sim.ref.solidity[idx] = 1
    }
    let ticks = 0
    while (sim.breachCount === 0 && ticks < 6000) {
      sim.tick(true)
      ticks++
    }
    expect(sim.breachCount).toBeGreaterThan(0)
    expect(ticks).toBeGreaterThan(30) // not instant — the dam holds for a while
  })
})
