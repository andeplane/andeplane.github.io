import * as THREE from 'three'
import { buildCell, type BuiltCell, type BuiltDoor } from './buildCell'
import type { LevelSpec, LoopAssertion } from './types'

export interface Portal {
  id: string
  fromCell: string
  fromDoor: string
  toCell: string
  toDoor: string
  /** Maps `fromCell` local coordinates to `toCell` local coordinates. */
  transform: THREE.Matrix4
  door: BuiltDoor
}

const ROT_PI_Y = new THREE.Matrix4().makeRotationY(Math.PI)

/**
 * The portal transform.
 *
 *     T[A→B] = F_B · R_y(π) · F_A⁻¹
 *
 * The half turn is the turn-around: you approach A facing its +Z, and you leave
 * B facing *away* from its +Z, i.e. into B's cell. Because R_y(π)⁻¹ = R_y(π),
 * the inverse comes out symmetric for free, which is what makes portals two-way
 * with no special case (SPEC §2.3).
 */
export function portalTransform(a: BuiltDoor, b: BuiltDoor): THREE.Matrix4 {
  return new THREE.Matrix4().multiplyMatrices(b.frame, ROT_PI_Y).multiply(a.frameInv)
}

export class World {
  readonly scene = new THREE.Scene()
  readonly cells = new Map<string, BuiltCell>()
  readonly portals = new Map<string, Portal[]>()
  /** Keyed by "cellId.doorId". */
  private readonly portalByDoor = new Map<string, Portal>()

  constructor(readonly spec: LevelSpec) {
    for (const cs of spec.cells) {
      const built = buildCell(cs)
      built.group.visible = false
      this.cells.set(cs.id, built)
      this.portals.set(cs.id, [])
      this.scene.add(built.group)
    }

    for (const ps of spec.portals) {
      const [ca, da] = splitRef(ps.a)
      const [cb, db] = splitRef(ps.b)
      const doorA = this.door(ca, da)
      const doorB = this.door(cb, db)
      // Mismatched openings would make the floor jump as you step through, and
      // the seam would be visible before you even got there. Catch it here
      // rather than letting a level ship with a two-centimetre lie in it.
      if (
        Math.abs(doorA.width - doorB.width) > 1e-6 ||
        Math.abs(doorA.height - doorB.height) > 1e-6 ||
        Math.abs(doorA.sillRel - doorB.sillRel) > 1e-6
      ) {
        throw new Error(
          `Portal ${ps.a} ↔ ${ps.b}: openings differ ` +
            `(${doorA.width}×${doorA.height}@${doorA.sillRel} vs ${doorB.width}×${doorB.height}@${doorB.sillRel})`,
        )
      }
      if (doorA.passable !== doorB.passable) {
        throw new Error(`Portal ${ps.a} ↔ ${ps.b}: one side is a grille and the other is not`)
      }
      this.link(ca, doorA, cb, doorB)
      this.link(cb, doorB, ca, doorA)
    }

    // Every door must lead somewhere, or the player walks into a hole.
    for (const cell of this.cells.values()) {
      for (const door of cell.doors.values()) {
        if (!this.portalByDoor.has(`${cell.spec.id}.${door.id}`)) {
          throw new Error(`Door ${cell.spec.id}.${door.id} has no portal`)
        }
      }
    }
  }

  private link(fromCell: string, from: BuiltDoor, toCell: string, to: BuiltDoor) {
    const portal: Portal = {
      id: `${fromCell}.${from.id}→${toCell}.${to.id}`,
      fromCell,
      fromDoor: from.id,
      toCell,
      toDoor: to.id,
      transform: portalTransform(from, to),
      door: from,
    }
    this.portals.get(fromCell)!.push(portal)
    this.portalByDoor.set(`${fromCell}.${from.id}`, portal)
  }

  private door(cellId: string, doorId: string): BuiltDoor {
    const cell = this.cells.get(cellId)
    if (!cell) throw new Error(`Unknown cell "${cellId}"`)
    const door = cell.doors.get(doorId)
    if (!door) throw new Error(`Unknown door "${doorId}" in cell "${cellId}"`)
    return door
  }

  cell(id: string): BuiltCell {
    const c = this.cells.get(id)
    if (!c) throw new Error(`Unknown cell "${id}"`)
    return c
  }

  portalsOf(cellId: string): Portal[] {
    return this.portals.get(cellId) ?? []
  }

  portalThrough(cellId: string, doorId: string): Portal | undefined {
    return this.portalByDoor.get(`${cellId}.${doorId}`)
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  }

  /**
   * Composes the holonomy of a named loop and compares it against what the
   * level author declared.
   *
   * This is how "the house never lies" (PRD P1) stays true mechanically: a door
   * nudged two centimetres shows up here as a failed assertion rather than as a
   * mystery the player is expected to reason about.
   */
  /** Cells the player can actually walk to, ignoring anything barred. */
  walkableFrom(start: string): Set<string> {
    const seen = new Set([start])
    const stack = [start]
    while (stack.length > 0) {
      const id = stack.pop()!
      for (const portal of this.portalsOf(id)) {
        if (!portal.door.passable || seen.has(portal.toCell)) continue
        seen.add(portal.toCell)
        stack.push(portal.toCell)
      }
    }
    return seen
  }

  checkAssertions(): { ok: boolean; report: string[] } {
    const report: string[] = []
    let ok = true

    // A level built largely out of grilles is how an unwinnable one ships: the
    // objective is visible from six rooms and connected to none of them. The
    // holonomy checks below prove the house is honest; this proves it is
    // finishable, which is a different claim and just as easy to get wrong.
    const walkable = this.walkableFrom(this.spec.spawn.cell)
    for (const goal of this.spec.goals ?? []) {
      const reachable = walkable.has(goal.cell)
      if (!reachable) ok = false
      report.push(
        `${reachable ? '✓' : '✗'} goal "${goal.cell}" is ${reachable ? '' : 'NOT '}` +
          `walkable from spawn "${this.spec.spawn.cell}"`,
      )
    }

    for (const a of this.spec.assertions ?? []) {
      const result = this.holonomy(a)
      if (!result) {
        ok = false
        report.push(`✗ ${a.name}: path leaves the graph or ends in the wrong cell`)
        continue
      }
      const tol = a.tolerance ?? 1e-3
      const yawErr = Math.abs(angleDiff(result.yawDeg, a.expectYawDeg))
      // Translation is only checked when the author declared one; for many
      // loops the yaw is the interesting invariant and the offset is whatever
      // the room dimensions make it.
      let posErr = 0
      if (a.expectTranslation) {
        posErr = Math.hypot(
          result.translation.x - a.expectTranslation[0],
          result.translation.y - a.expectTranslation[1],
          result.translation.z - a.expectTranslation[2],
        )
      }
      const good = yawErr < Math.max(tol, 0.05) && posErr < Math.max(tol, 0.02)
      if (!good) ok = false
      report.push(
        `${good ? '✓' : '✗'} ${a.name}: yaw ${result.yawDeg.toFixed(2)}° ` +
          `(want ${a.expectYawDeg}°), translation ` +
          `(${result.translation.x.toFixed(3)}, ${result.translation.y.toFixed(3)}, ${result.translation.z.toFixed(3)})`,
      )
    }
    return { ok, report }
  }

  holonomy(loop: LoopAssertion): { yawDeg: number; translation: THREE.Vector3 } | null {
    let cellId = loop.cell
    const H = new THREE.Matrix4().identity()
    for (const doorId of loop.doors) {
      const portal = this.portalThrough(cellId, doorId)
      if (!portal) return null
      H.premultiply(portal.transform)
      cellId = portal.toCell
    }
    if (cellId !== (loop.expectEndCell ?? loop.cell)) return null
    // For R_y(θ), three.js stores n13 = sin θ at elements[8] and n33 = cos θ at
    // elements[10], so this recovers θ itself rather than its negation.
    const e = H.elements
    const yaw = Math.atan2(e[8], e[10])
    return {
      yawDeg: (yaw * 180) / Math.PI,
      translation: new THREE.Vector3(e[12], e[13], e[14]),
    }
  }
}

function splitRef(ref: string): [string, string] {
  const i = ref.indexOf('.')
  if (i < 0) throw new Error(`Bad door reference "${ref}", expected "cell.door"`)
  return [ref.slice(0, i), ref.slice(i + 1)]
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
