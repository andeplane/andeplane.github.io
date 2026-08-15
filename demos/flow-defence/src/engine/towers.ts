// Towers exist only as this CPU list; the GPU sees them as splatted fields
// (biomass decay rates, body forces). Pure module.

import { CONFIG } from '../config'
import { CELL } from '../sim/core/constants'
import type { DomainMap } from './map'

export type TowerType = 'neutralizer' | 'impeller'

export interface Tower {
  id: number
  type: TowerType
  x: number
  y: number
  /** Impeller thrust direction (radians); unused for neutralizers. */
  angle: number
}

export function towerCost(type: TowerType): number {
  return CONFIG.towers[type].cost
}

/** Can a tower stand here? Open water only, fully inside the domain. */
export function canPlace(map: DomainMap, x: number, y: number): boolean {
  if (x < 2 || x >= map.width - 2 || y < 2 || y >= map.height - 2) return false
  return map.cellType[y * map.width + x] === CELL.OPEN
}

/** Splat neutralizer decay rates into a per-cell field. */
export function buildTowerField(map: DomainMap, towers: Tower[]): Float32Array {
  const field = new Float32Array(map.width * map.height)
  const { radius, rate } = CONFIG.towers.neutralizer
  for (const t of towers) {
    if (t.type !== 'neutralizer') continue
    stampDisc(map, t, radius, (idx, falloff) => {
      field[idx] = Math.max(field[idx], rate * falloff)
    })
  }
  return field
}

/** Splat impeller body forces (vec2 per cell, interleaved). */
export function buildForceField(map: DomainMap, towers: Tower[]): Float32Array {
  const field = new Float32Array(map.width * map.height * 2)
  const { radius, force } = CONFIG.towers.impeller
  for (const t of towers) {
    if (t.type !== 'impeller') continue
    const fx = Math.cos(t.angle) * force
    const fy = Math.sin(t.angle) * force
    stampDisc(map, t, radius, (idx, falloff) => {
      field[idx * 2] += fx * falloff
      field[idx * 2 + 1] += fy * falloff
    })
  }
  return field
}

function stampDisc(
  map: DomainMap,
  t: Tower,
  radius: number,
  apply: (idx: number, falloff: number) => void,
): void {
  for (let y = Math.max(0, t.y - radius); y <= Math.min(map.height - 1, t.y + radius); y++) {
    for (let x = Math.max(0, t.x - radius); x <= Math.min(map.width - 1, t.x + radius); x++) {
      const d = Math.hypot(x - t.x, y - t.y)
      if (d > radius) continue
      const idx = y * map.width + x
      if (map.cellType[idx] !== CELL.OPEN) continue
      // Smooth quadratic falloff.
      const f = 1 - (d / radius) * (d / radius)
      apply(idx, f)
    }
  }
}
