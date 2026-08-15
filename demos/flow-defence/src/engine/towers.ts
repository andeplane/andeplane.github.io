// Towers exist only as this CPU list; the GPU sees them as splatted fields
// (damage rates, body forces, drag, sonar coverage). Which fields a tower
// splats comes from TOWER_DEFS — this module never switches on tower ids.
// Pure module.

import { CONFIG } from '../config'
import { CELL } from '../sim/core/constants'
import type { DomainMap } from './map'
import { TOWER_DEFS, type TowerId } from './towerDefs'

export type TowerType = TowerId

export interface Tower {
  id: number
  type: TowerType
  x: number
  y: number
  /** Thrust direction (radians) for aimable towers; 0 otherwise. */
  angle: number
}

export function towerCost(type: TowerType): number {
  return TOWER_DEFS[type].cost
}

/** Can a tower stand here? Open water, inside the domain, and clear of other
 *  towers by `build.towerSpacing` — defenses claim territory, no stacking. */
export function canPlace(map: DomainMap, x: number, y: number, towers: readonly Tower[]): boolean {
  if (x < 2 || x >= map.width - 2 || y < 2 || y >= map.height - 2) return false
  if (map.cellType[y * map.width + x] !== CELL.OPEN) return false
  const s = CONFIG.build.towerSpacing
  return towers.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= s * s)
}

export interface TowerFields {
  /** Continuous kill rate per cell (neutralizers). */
  damage: Float32Array
  /** Body force on the water, vec2 interleaved (impellers, vortexes). */
  force: Float32Array
  /** Spore velocity damping 0..1 per cell (congealers). */
  drag: Float32Array
  /** Sonar coverage per cell (1 = phantoms revealed and killable here). */
  sonar: Float32Array
}

/** Splat every field tower into per-cell fields, driven purely by the defs. */
export function splatTowerFields(map: DomainMap, towers: readonly Tower[]): TowerFields {
  const n = map.width * map.height
  const fields: TowerFields = {
    damage: new Float32Array(n),
    force: new Float32Array(n * 2),
    drag: new Float32Array(n),
    sonar: new Float32Array(n),
  }
  for (const t of towers) {
    const def = TOWER_DEFS[t.type]
    if (def.damageRate !== undefined) {
      const rate = def.damageRate
      stampDisc(map, t, def.radius, (idx, f) => {
        fields.damage[idx] = Math.max(fields.damage[idx], rate * f)
      })
    }
    if (def.drag !== undefined) {
      const drag = def.drag
      stampDisc(map, t, def.radius, (idx, f) => {
        fields.drag[idx] = Math.min(0.85, Math.max(fields.drag[idx], drag * f))
      })
    }
    if (def.sonar) {
      stampDisc(map, t, def.radius, (idx) => {
        fields.sonar[idx] = 1
      })
    }
    if (def.force?.kind === 'directed') {
      const fx = Math.cos(t.angle) * def.force.strength
      const fy = Math.sin(t.angle) * def.force.strength
      stampDisc(map, t, def.radius, (idx, f) => {
        fields.force[idx * 2] += fx * f
        fields.force[idx * 2 + 1] += fy * f
      })
    } else if (def.force?.kind === 'vortex') {
      // Tangential swirl + slight inward pull: a whirlpool that TRAPS —
      // spores circle it instead of passing through.
      const strength = def.force.strength
      stampDisc(map, t, def.radius, (idx, f) => {
        const x = idx % map.width
        const y = Math.floor(idx / map.width)
        const dx = x - t.x
        const dy = y - t.y
        const d = Math.max(1, Math.hypot(dx, dy))
        const tx = -dy / d
        const ty = dx / d
        fields.force[idx * 2] += (tx - 0.35 * (dx / d)) * strength * f
        fields.force[idx * 2 + 1] += (ty - 0.35 * (dy / d)) * strength * f
      })
    }
  }
  return fields
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
