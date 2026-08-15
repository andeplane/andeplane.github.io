// Tower placement, tiers, and firing. Turrets are hitscan; slow fields are
// passive (applied in balls.ts). A tower is powered only while its cell is
// CLAIMED; on breach/unclaim it goes inert (never destroyed, never solid).

import {
  Q,
  SELL_REFUND_DEN,
  SELL_REFUND_NUM,
  SLOW_COST,
  TURRET_COST,
  TURRET_DMG,
  TURRET_PERIOD,
  TURRET_RANGE,
  TowerType,
} from './constants'
import { damageBall } from './balls'
import { CLAIMED, cellX, cellY, type GameState } from './state'

export function towerCost(type: TowerType, tier: number): number {
  return type === TowerType.Turret ? TURRET_COST[tier] : SLOW_COST[tier]
}

export function placeTower(s: GameState, cell: number, type: TowerType): boolean {
  if (s.grid[cell] !== CLAIMED) return false
  if (s.towers.some((t) => t.cell === cell)) return false
  const cost = towerCost(type, 0)
  if (s.money < cost) return false
  s.money -= cost
  s.towers.push({ id: s.nextId++, type, tier: 0, cell, nextFireAt: s.tick, spent: cost })
  return true
}

export function upgradeTower(s: GameState, id: number): boolean {
  const t = s.towers.find((t) => t.id === id)
  if (!t || t.tier >= 2) return false
  const cost = towerCost(t.type, t.tier + 1)
  if (s.money < cost) return false
  s.money -= cost
  t.spent += cost
  t.tier++
  return true
}

export function sellTower(s: GameState, id: number): boolean {
  const idx = s.towers.findIndex((t) => t.id === id)
  if (idx < 0) return false
  const t = s.towers[idx]
  s.money += Math.floor((t.spent * SELL_REFUND_NUM) / SELL_REFUND_DEN)
  s.towers.splice(idx, 1)
  return true
}

export function fireTowers(s: GameState): void {
  for (const t of s.towers) {
    if (t.type !== TowerType.Turret) continue
    if (s.grid[t.cell] !== CLAIMED) continue // powered down
    if (s.tick < t.nextFireAt) continue
    const px = cellX(t.cell) * Q + Q / 2
    const py = cellY(t.cell) * Q + Q / 2
    const range = TURRET_RANGE[t.tier]
    let target = -1
    let bestD = range * range
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i]
      const dx = b.x - px
      const dy = b.y - py
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        target = i
      }
    }
    if (target >= 0) {
      const b = s.balls[target]
      damageBall(s, b, TURRET_DMG[t.tier])
      s.fx.beams.push({ x1: px, y1: py, x2: b.x, y2: b.y, kind: 0 })
      t.nextFireAt = s.tick + TURRET_PERIOD[t.tier]
    }
  }
}
