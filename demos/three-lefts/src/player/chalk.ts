import * as THREE from 'three'
import type { World } from '../world/world'
import type { Player } from './controller'
import { chalkMaterial, registerMaterial } from '../render/materials'

const REACH = 3.2
const SIZE = 0.34

/**
 * Chalk (PRD §4.2).
 *
 * The player's first tool for testing the house, and the one that turns a
 * suspicion into a fact. Marks are numbered, so they are not just "I was here"
 * but "I was here *fourth*" — which is the difference between noticing a loop
 * and being able to say how long it was.
 *
 * Marks live in cell-local coordinates like everything else, so a mark made
 * before walking three lefts is genuinely the same mark you find afterwards.
 */
export class Chalk {
  private count = 0
  private readonly textures = new Map<number, THREE.Texture>()
  private readonly geometry = new THREE.PlaneGeometry(SIZE, SIZE)
  private readonly raycaster = new THREE.Raycaster()
  private readonly origin = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly basisX = new THREE.Vector3()
  private readonly basisY = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly altUp = new THREE.Vector3(0, 0, 1)

  constructor() {
    this.raycaster.far = REACH
  }

  get marksMade() {
    return this.count
  }

  reset() {
    this.count = 0
  }

  /** Returns a short message for the HUD, or null if nothing was in reach. */
  mark(world: World, player: Player): string | null {
    const cell = world.cell(player.cellId)
    const m = player.cameraMatrix
    this.origin.setFromMatrixPosition(m)
    this.dir.set(-m.elements[8], -m.elements[9], -m.elements[10]).normalize()
    this.raycaster.set(this.origin, this.dir)

    const hits = this.raycaster.intersectObjects(cell.group.children, false)
    const hit = hits.find((h) => h.face)
    if (!hit || !hit.face) return null

    const normal = hit.face.normal
    // Build a frame on the surface. Near-vertical faces need a different
    // reference axis or the cross product degenerates.
    const ref = Math.abs(normal.y) > 0.9 ? this.altUp : this.up
    this.basisX.crossVectors(ref, normal).normalize()
    this.basisY.crossVectors(normal, this.basisX).normalize()

    this.count++
    const material = chalkMaterial.clone()
    material.map = this.texture(this.count)
    // Run-time materials still need the portal pass's stencil state.
    registerMaterial(material)

    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.matrixAutoUpdate = false
    mesh.matrix.makeBasis(this.basisX, this.basisY, normal)
    // Lift it clear of the surface so it does not fight for depth.
    mesh.matrix.setPosition(
      hit.point.x + normal.x * 0.012,
      hit.point.y + normal.y * 0.012,
      hit.point.z + normal.z * 0.012,
    )
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    cell.group.add(mesh)

    return this.count === 1 ? 'Chalk mark 1. Now go and find it again.' : `Chalk mark ${this.count}.`
  }

  private texture(n: number): THREE.Texture {
    const cached = this.textures.get(n)
    if (cached) return cached

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 128, 128)
    ctx.strokeStyle = 'rgba(238,236,226,0.92)'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'

    // Tally marks: four uprights and a diagonal through each group of five.
    const groups = Math.ceil(n / 5)
    const perGroup = 128 / groups
    for (let g = 0; g < groups; g++) {
      const inGroup = Math.min(5, n - g * 5)
      const x0 = g * perGroup + perGroup * 0.18
      const w = perGroup * 0.64
      const uprights = Math.min(inGroup, 4)
      for (let i = 0; i < uprights; i++) {
        const x = x0 + (w * (i + 0.5)) / 4
        ctx.beginPath()
        ctx.moveTo(x, 24 + (i % 2) * 3)
        ctx.lineTo(x + 4, 104 - (i % 2) * 4)
        ctx.stroke()
      }
      if (inGroup === 5) {
        ctx.beginPath()
        ctx.moveTo(x0 - 4, 100)
        ctx.lineTo(x0 + w + 6, 28)
        ctx.stroke()
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    this.textures.set(n, tex)
    return tex
  }
}
