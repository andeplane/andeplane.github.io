import { describe, expect, it } from 'vitest'
import { CELL } from './constants'
import { LbmRef } from './lbmRef'

/** Closed box: bedrock border all around. */
function makeClosedBox(w: number, h: number, tau0 = 0.8): LbmRef {
  const sim = new LbmRef({ width: w, height: h, params: { tau0, smagorinsky: 0 } })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        sim.cellType[sim.idx(x, y)] = CELL.BEDROCK
      }
    }
  }
  return sim
}

/** Periodic-x channel: bedrock top and bottom rows, driven by body force gx. */
function makeChannel(w: number, fluidRows: number, gx: number, tau0: number): LbmRef {
  const h = fluidRows + 2
  const sim = new LbmRef({
    width: w,
    height: h,
    periodicX: true,
    params: { tau0, smagorinsky: 0, gx },
  })
  for (let x = 0; x < w; x++) {
    sim.cellType[sim.idx(x, 0)] = CELL.BEDROCK
    sim.cellType[sim.idx(x, h - 1)] = CELL.BEDROCK
  }
  return sim
}

describe('LbmRef', () => {
  it('conserves mass in a closed box', () => {
    const sim = makeClosedBox(24, 24)
    sim.initEquilibrium((x, y) => 1 + 0.05 * Math.sin((x / 24) * Math.PI * 2) * Math.cos((y / 24) * Math.PI * 2))
    const m0 = sim.totalMass()
    for (let t = 0; t < 300; t++) sim.step()
    const m1 = sim.totalMass()
    expect(Math.abs(m1 - m0) / m0).toBeLessThan(1e-5)
  })

  it('stays quiescent with no forcing', () => {
    const sim = makeClosedBox(16, 16)
    for (let t = 0; t < 100; t++) sim.step()
    let maxU = 0
    for (let i = 0; i < sim.n; i++) maxU = Math.max(maxU, Math.hypot(sim.ux[i], sim.uy[i]))
    expect(maxU).toBeLessThan(1e-9)
  })

  it('produces no NaN under a hard density kick', () => {
    const sim = makeClosedBox(24, 24, 0.58)
    sim.initEquilibrium((x, y) => (x > 8 && x < 16 && y > 8 && y < 16 ? 1.3 : 1))
    for (let t = 0; t < 500; t++) sim.step()
    for (let i = 0; i < sim.n; i++) {
      expect(Number.isFinite(sim.rho[i])).toBe(true)
      expect(Number.isFinite(sim.ux[i])).toBe(true)
    }
  })

  it('converges to the analytic Poiseuille profile within 2%', () => {
    const H = 16 // fluid rows
    const tau0 = 0.8
    const gx = 1e-6
    const nu = (tau0 - 0.5) / 3
    const sim = makeChannel(8, H, gx, tau0)
    for (let t = 0; t < 8000; t++) sim.step()

    // Half-way bounce-back places walls half a cell beyond the outermost
    // fluid rows: y_wall = 0.5 and H + 0.5 (fluid rows are y = 1..H).
    let maxRelErr = 0
    for (let y = 1; y <= H; y++) {
      const analytic = ((gx / (2 * nu)) * (y - 0.5) * (H + 0.5 - y))
      const measured = sim.ux[sim.idx(4, y)]
      maxRelErr = Math.max(maxRelErr, Math.abs(measured - analytic) / analytic)
    }
    expect(maxRelErr).toBeLessThan(0.02)
  })

  it('partial bounce-back: flux through a porous plug decreases monotonically with solidity', () => {
    const fluxAt = (s: number): number => {
      const H = 10
      const sim = makeChannel(12, H, 5e-7, 0.8)
      // Porous plug column at x=6 across the whole channel.
      for (let y = 1; y <= H; y++) {
        const idx = sim.idx(6, y)
        sim.cellType[idx] = CELL.WALL
        sim.solidity[idx] = s
      }
      for (let t = 0; t < 4000; t++) sim.step()
      let flux = 0
      for (let y = 1; y <= H; y++) flux += sim.ux[sim.idx(2, y)] * sim.rho[sim.idx(2, y)]
      return flux
    }
    const f0 = fluxAt(0)
    const f04 = fluxAt(0.4)
    const f08 = fluxAt(0.8)
    const f1 = fluxAt(1)
    expect(f04).toBeLessThan(f0)
    expect(f08).toBeLessThan(f04)
    expect(f1).toBeLessThan(f08)
    expect(f1).toBeLessThan(f0 * 0.05) // a solid plug essentially stops the flow
  })

  it('inlet/outlet: sustains a steady flux through an open domain', { timeout: 120_000 }, () => {
    const w = 48
    const h = 20
    const sim = new LbmRef({ width: w, height: h, params: { tau0: 0.58, smagorinsky: 0.12 } })
    for (let x = 0; x < w; x++) {
      sim.cellType[sim.idx(x, 0)] = CELL.BEDROCK
      sim.cellType[sim.idx(x, h - 1)] = CELL.BEDROCK
    }
    for (let y = 1; y < h - 1; y++) {
      sim.cellType[sim.idx(0, y)] = CELL.INLET
      sim.cellType[sim.idx(w - 1, y)] = CELL.OUTLET
      sim.inletRho[y] = 1.02
      sim.inletU[y] = 0.06
    }
    for (let t = 0; t < 3000; t++) sim.step()
    // Flux at mid-domain should be positive, finite, and of the inlet's order.
    let flux = 0
    for (let y = 1; y < h - 1; y++) flux += sim.ux[sim.idx(w >> 1, y)] * sim.rho[sim.idx(w >> 1, y)]
    const perRow = flux / (h - 2)
    expect(Number.isFinite(perRow)).toBe(true)
    expect(perRow).toBeGreaterThan(0.02)
    expect(perRow).toBeLessThan(0.2)
  })
})
