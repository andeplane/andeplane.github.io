// Zap towers (arc chains, harpoon bolts, depth charges): the CPU picks
// targets from the (readback-lagged, velocity-extrapolated) enemy positions
// on a per-tower cooldown, and the hits are stamped into a transient damage
// field the enemy kernel adds to towerField for one tick. Pure module —
// no DOM, no GPU — so targeting is unit-testable.

import type { Tower } from './towers'
import { TOWER_DEFS } from './towerDefs'

export interface ZapTarget {
  x: number
  y: number
}

export interface ZapEvent {
  tower: Tower
  kind: 'chain' | 'snipe' | 'mortar'
  /** Chain order matters: overlay draws tower -> t0 -> t1 -> ... */
  targets: ZapTarget[]
  damage: number
  /** Blast radius for mortar (cells); point hits use a small stamp. */
  blast: number
  color: string
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

export class ZapController {
  /** tower.id -> earliest tick it may fire again. */
  private readonly ready = new Map<number, number>()

  /**
   * Fire every off-cooldown zap tower that has a target. `enemies` are live
   * spore positions in sim cells; phantoms must already be filtered out by
   * the caller unless sonar covers them.
   */
  tick(tick: number, towers: readonly Tower[], enemies: readonly ZapTarget[]): ZapEvent[] {
    const events: ZapEvent[] = []
    if (enemies.length === 0) return events
    for (const tower of towers) {
      const def = TOWER_DEFS[tower.type as keyof typeof TOWER_DEFS]
      const zap = def?.zap
      if (!zap) continue
      if ((this.ready.get(tower.id) ?? 0) > tick) continue
      const targets = this.pickTargets(tower, zap.kind, enemies)
      if (targets.length === 0) continue
      this.ready.set(tower.id, tick + zap.cooldown)
      events.push({
        tower,
        kind: zap.kind,
        targets,
        damage: zap.damage,
        blast: zap.blast ?? 3.5,
        color: def.color,
      })
    }
    return events
  }

  private pickTargets(tower: Tower, kind: string, enemies: readonly ZapTarget[]): ZapTarget[] {
    const def = TOWER_DEFS[tower.type as keyof typeof TOWER_DEFS]
    const zap = def.zap!
    const inRange = enemies.filter((e) => dist(e.x, e.y, tower.x, tower.y) <= zap.range)
    if (inRange.length === 0) return []

    if (kind === 'snipe') {
      // The spore closest to the outlet (largest x) — the panic button.
      return [inRange.reduce((a, b) => (b.x > a.x ? b : a))]
    }

    if (kind === 'mortar') {
      // Densest cluster: the in-range spore with the most neighbors in blast radius.
      const blast = zap.blast ?? 10
      let best = inRange[0]
      let bestCount = -1
      for (const c of inRange) {
        const count = enemies.reduce((n, e) => n + (dist(e.x, e.y, c.x, c.y) <= blast ? 1 : 0), 0)
        if (count > bestCount) {
          bestCount = count
          best = c
        }
      }
      return [best]
    }

    // chain: nearest first, then greedy nearest-unvisited within chainRange.
    const chainRange = zap.chainRange ?? 14
    const jumps = zap.chain ?? 3
    // Jumps may extend beyond the tower's own range — the water conducts.
    const remaining = new Set<ZapTarget>(enemies)
    let current = inRange.reduce((a, b) =>
      dist(b.x, b.y, tower.x, tower.y) < dist(a.x, a.y, tower.x, tower.y) ? b : a,
    )
    const chain: ZapTarget[] = [current]
    remaining.delete(current)
    for (let j = 0; j < jumps; j++) {
      let next: ZapTarget | null = null
      let bestD = chainRange
      for (const e of remaining) {
        const d = dist(e.x, e.y, current.x, current.y)
        if (d <= bestD) {
          bestD = d
          next = e
        }
      }
      if (!next) break
      chain.push(next)
      remaining.delete(next)
      current = next
    }
    return chain
  }
}

/**
 * Stamp one tick's zap events into the transient damage field (same units as
 * towerField: enemy kernel applies hp -= field × towerDamage). The caller
 * clears the field before stamping and re-uploads it when dirty.
 */
export function stampZaps(
  field: Float32Array,
  width: number,
  height: number,
  events: readonly ZapEvent[],
  towerDamage: number,
): boolean {
  let dirty = false
  for (const ev of events) {
    // One tick must deliver the full hit: field × towerDamage = damage.
    const rate = ev.damage / towerDamage
    for (const t of ev.targets) {
      const r = ev.kind === 'mortar' ? ev.blast : 3.5
      const r2 = r * r
      const x0 = Math.max(0, Math.floor(t.x - r))
      const x1 = Math.min(width - 1, Math.ceil(t.x + r))
      const y0 = Math.max(0, Math.floor(t.y - r))
      const y1 = Math.min(height - 1, Math.ceil(t.y + r))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = (x - t.x) * (x - t.x) + (y - t.y) * (y - t.y)
          if (d2 > r2) continue
          field[y * width + x] += rate * (ev.kind === 'mortar' ? Math.max(0.35, 1 - d2 / r2) : 1)
          dirty = true
        }
      }
    }
  }
  return dirty
}
