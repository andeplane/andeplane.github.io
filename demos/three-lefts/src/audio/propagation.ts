import * as THREE from 'three'
import type { World } from '../world/world'

/**
 * Where a cell *sounds* like it is.
 *
 * Sound does not travel through walls here; it travels through the portal
 * graph, exactly like the player does. So the acoustic image of a room is found
 * by walking the graph and composing portal transforms — the same arithmetic
 * that draws the room through a doorway (SPEC §6) and the same arithmetic that
 * moves the player through one (SPEC §5).
 *
 * The consequence is the point: around a ring with non-trivial holonomy, a
 * sound two rooms away arrives from the direction the *ring* says, which is not
 * the direction the player's gut says. Audio becomes a second channel for the
 * house to be wrong through, and unlike the view it works when you are facing
 * the other way (PRD §8).
 */
export interface CellImage {
  cellId: string
  /** Maps that cell's local coordinates into the listener's cell coordinates. */
  toListener: THREE.Matrix4
  /**
   * Length of the shortest walk from the listener to this cell, measured
   * doorway to doorway. This is a real path length, not the straight-line
   * distance to the image — a room can be acoustically far and geometrically
   * close, and in these houses it routinely is.
   */
  pathLength: number
  /** The last doorway centre on that walk, in listener-cell coordinates. */
  gate: THREE.Vector3
  hops: number
  /** False if any doorway on the path is barred; a grille muffles more. */
  openPath: boolean
}

export interface PropagationOptions {
  maxHops?: number
  maxDistance?: number
}

/**
 * Dijkstra over the portal graph, ordered by acoustic path length.
 *
 * A cell can be reachable by several routes with genuinely different images —
 * the shrine in Three Lefts is behind three separate grilles. Keeping only the
 * shortest is both cheapest and correct: you hear a room through whichever of
 * its openings is nearest, and walking the ring makes the source swing round to
 * the next grille as that one takes over. Nothing about that is a trick; it is
 * what one room with three windows sounds like.
 */
export function propagate(
  world: World,
  listenerCell: string,
  listenerPos: THREE.Vector3,
  opts: PropagationOptions = {},
): Map<string, CellImage> {
  const maxHops = opts.maxHops ?? 4
  const maxDistance = opts.maxDistance ?? 46

  const start: CellImage = {
    cellId: listenerCell,
    toListener: new THREE.Matrix4(),
    pathLength: 0,
    gate: listenerPos.clone(),
    hops: 0,
    openPath: true,
  }

  const best = new Map<string, CellImage>([[listenerCell, start]])
  const queue: CellImage[] = [start]
  const settled = new Set<string>()
  const at = new THREE.Vector3()

  while (queue.length > 0) {
    // These graphs are a dozen cells wide. A linear scan beats a binary heap
    // here and is one line instead of forty.
    let pick = 0
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].pathLength < queue[pick].pathLength) pick = i
    }
    const node = queue.splice(pick, 1)[0]
    if (settled.has(node.cellId)) continue
    settled.add(node.cellId)
    if (node.hops >= maxHops) continue

    for (const portal of world.portalsOf(node.cellId)) {
      // The doorway we would leave through, seen from the listener's chart.
      at.copy(portal.door.center).applyMatrix4(node.toListener)
      const pathLength = node.pathLength + at.distanceTo(node.gate)
      if (pathLength > maxDistance) continue

      const known = best.get(portal.toCell)
      if (known && known.pathLength <= pathLength) continue

      // The portal back, which maps the neighbour's chart into this one; then
      // this one into the listener's.
      const back = world.portalThrough(portal.toCell, portal.toDoor)!
      const next: CellImage = {
        cellId: portal.toCell,
        toListener: new THREE.Matrix4().multiplyMatrices(node.toListener, back.transform),
        pathLength,
        gate: at.clone(),
        hops: node.hops + 1,
        openPath: node.openPath && portal.door.passable,
      }
      best.set(portal.toCell, next)
      queue.push(next)
    }
  }

  return best
}
