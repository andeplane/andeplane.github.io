import * as THREE from 'three'
import type { World, Portal } from '../world/world'
import type { BuiltCell } from '../world/buildCell'
import {
  setSceneStencil,
  portalMarkMaterial,
  portalUnmarkMaterial,
  portalDepthMaterial,
  portalFallbackMaterial,
  depthResetMaterial,
} from './materials'

const MAX_POINT_LIGHTS = 4
/** Stencil is 8-bit, but we are limited by cost long before that. */
export const HARD_MAX_DEPTH = 4

export interface RenderStats {
  cellDraws: number
  portalDraws: number
  depth: number
  msaa: boolean
}

/**
 * Recursive stencil portal renderer (SPEC §6.1).
 *
 * Per cell, in order:
 *   1. draw the cell where stencil == level
 *   2. for each visible portal:
 *      a. INCR stencil where the portal passes the depth test — this region is
 *         exactly "the portal, where it is actually visible from here"
 *      b. reset depth to far inside that region
 *      c. recurse with the camera pushed through the portal transform
 *      d. stamp the portal's own depth back over the region, so the destination
 *         room's depths do not leak into this cell's sorting
 *      e. DECR the stencil back
 */
export class PortalRenderer {
  readonly camera: THREE.PerspectiveCamera
  maxDepth = 3
  /**
   * Solid angle below which a portal is filled flat instead of recursed into.
   * Raised by adaptive quality (see render/quality.ts) — culling a doorway that
   * is six pixels across costs nothing visually and saves a whole cell draw.
   */
  distantCull = 0.0025
  readonly stats: RenderStats = { cellDraws: 0, portalDraws: 0, depth: 3, msaa: true }

  private readonly renderer: THREE.WebGLRenderer
  private readonly camMatrices: THREE.Matrix4[] = []
  private readonly clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5)

  private readonly quadMesh: THREE.Mesh
  private readonly quadScene = new THREE.Scene()
  private readonly fsScene = new THREE.Scene()

  private readonly lightRig = new THREE.Group()
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5)
  private readonly key = new THREE.DirectionalLight(0xffffff, 1)
  /**
   * A dim light from the opposite side of the key.
   *
   * There is no global illumination here — SPEC §6 bans screen-space methods
   * because they leak across portals, and per-cell bounce is out of budget —
   * so surfaces facing away from the key would otherwise receive nothing but
   * hemisphere fill and read as black. This stands in for the bounce.
   */
  private readonly fill = new THREE.DirectionalLight(0xffffff, 0.3)
  private readonly points: THREE.PointLight[] = []

  private boundWorld: World | null = null
  private readonly scratch = {
    m: new THREE.Matrix4(),
    v: new THREE.Vector3(),
    corner: new THREE.Vector3(),
    camPos: new THREE.Vector3(),
    proj: new THREE.Matrix4(),
  }

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.02, 200)
    this.camera.matrixAutoUpdate = false

    for (let i = 0; i <= HARD_MAX_DEPTH + 1; i++) this.camMatrices.push(new THREE.Matrix4())

    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), portalMarkMaterial)
    this.quadMesh.matrixAutoUpdate = false
    this.quadMesh.frustumCulled = false
    this.quadScene.add(this.quadMesh)

    const fs = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthResetMaterial)
    fs.frustumCulled = false
    this.fsScene.add(fs)

    this.key.target.position.set(0, 0, 0)
    this.fill.target.position.set(0, 0, 0)
    this.lightRig.add(this.hemi, this.key, this.key.target, this.fill, this.fill.target)
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 10, 2)
      this.points.push(p)
      this.lightRig.add(p)
    }

    // Exactly one clipping plane, always. Letting the count vary would make
    // three.js recompile shaders mid-traversal (SPEC §6.2).
    renderer.clippingPlanes = [this.clipPlane]
    renderer.localClippingEnabled = false
  }

  bind(world: World) {
    if (this.boundWorld === world) return
    this.boundWorld = world
    world.scene.add(this.lightRig)
  }

  setViewport(width: number, height: number, fov: number) {
    this.camera.aspect = width / height
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }

  /**
   * Draws the world as seen from `camMatrix`, expressed in `startCell`'s local
   * coordinates. The caller has already put us in the right render target.
   */
  render(world: World, startCell: string, camMatrix: THREE.Matrix4) {
    this.bind(world)
    this.stats.cellDraws = 0
    this.stats.portalDraws = 0
    this.stats.depth = this.maxDepth
    this.camMatrices[0].copy(camMatrix)
    this.renderCell(world, startCell, 0, 0, null)
  }

  private renderCell(world: World, cellId: string, level: number, camSlot: number, fromDoor: string | null) {
    const cell = world.cell(cellId)
    const camMatrix = this.camMatrices[camSlot]

    this.useCamera(camMatrix)
    this.showOnly(world, cell)
    this.configureLights(cell)
    setSceneStencil(level)
    this.renderer.render(world.scene, this.camera)
    this.stats.cellDraws++

    const atLimit = level >= this.maxDepth
    this.scratch.camPos.setFromMatrixPosition(camMatrix)
    const portals = world.portalsOf(cellId)

    for (const portal of portals) {
      if (portal.fromDoor === fromDoor) continue
      const vis = this.portalVisibility(portal, camMatrix)
      if (vis === 'hidden') continue

      this.setQuadTo(portal)

      if (atLimit || vis === 'distant') {
        // At the recursion limit, or too small to be worth one: fill it with
        // darkness rather than leaving a hole through to the clear colour.
        this.drawQuad(portalFallbackMaterial, level)
        continue
      }

      // (a) mark
      this.drawQuad(portalMarkMaterial, level)
      // (b) clear depth inside the marked region
      this.drawFullscreen(level + 1)
      // (c) recurse
      const childSlot = camSlot + 1
      this.camMatrices[childSlot].multiplyMatrices(portal.transform, camMatrix)
      const savedClip = this.clipPlane.clone()
      this.setClipFor(world.cell(portal.toCell), portal.toDoor)
      this.renderCell(world, portal.toCell, level + 1, childSlot, portal.toDoor)
      this.clipPlane.copy(savedClip)
      this.stats.portalDraws++

      // Restore our own camera and cell before the closing draws.
      this.useCamera(camMatrix)
      this.setQuadTo(portal)
      // (d) stamp the portal's depth back
      this.drawQuad(portalDepthMaterial, level + 1)
      // (e) unmark
      this.drawQuad(portalUnmarkMaterial, level + 1)
    }
  }

  private useCamera(m: THREE.Matrix4) {
    this.camera.matrix.copy(m)
    this.camera.matrixWorldNeedsUpdate = true
    this.camera.updateMatrixWorld(true)
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert()
  }

  private showOnly(world: World, cell: BuiltCell) {
    for (const c of world.cells.values()) c.group.visible = c === cell
  }

  private setClipFor(cell: BuiltCell, doorId: string) {
    const door = cell.doors.get(doorId)!
    // Keep the half-space in front of the door, which includes its own reveal.
    this.clipPlane.normal.copy(door.normal)
    this.clipPlane.constant = -door.normal.dot(door.center) + 0.004
  }

  private clearClip() {
    this.clipPlane.normal.set(0, 1, 0)
    this.clipPlane.constant = 1e5
  }

  private setQuadTo(portal: Portal) {
    const d = portal.door
    this.scratch.m.makeScale(d.width, d.height, 1)
    this.quadMesh.matrix.multiplyMatrices(d.frame, this.scratch.m)
    this.quadMesh.matrixWorldNeedsUpdate = true
  }

  private drawQuad(material: THREE.Material, stencilRef: number) {
    ;(material as THREE.Material & { stencilRef: number }).stencilRef = stencilRef
    this.quadMesh.material = material
    this.renderer.render(this.quadScene, this.camera)
  }

  private drawFullscreen(stencilRef: number) {
    depthResetMaterial.stencilRef = stencilRef
    this.renderer.render(this.fsScene, this.camera)
  }

  /**
   * Cheapest-first rejection: behind us, off screen, or too small to matter.
   */
  private portalVisibility(portal: Portal, camMatrix: THREE.Matrix4): 'visible' | 'distant' | 'hidden' {
    const d = portal.door
    const cam = this.scratch.camPos.setFromMatrixPosition(camMatrix)

    // Backface: the camera must be on the inward side of the door plane.
    const side = this.scratch.v.copy(cam).sub(d.center).dot(d.normal)
    if (side <= 0.001) return 'hidden'

    this.scratch.proj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let anyInFront = false

    for (let i = 0; i < 4; i++) {
      const sx = i === 0 || i === 3 ? -0.5 : 0.5
      const sy = i < 2 ? -0.5 : 0.5
      this.scratch.corner
        .set(sx * d.width, sy * d.height, 0)
        .applyMatrix4(d.frame)
        .applyMatrix4(this.scratch.proj)
      // applyMatrix4 on Vector3 already performs the perspective divide, but
      // it does so even when w < 0, which mirrors points behind the camera.
      const w = this.perspectiveW(d, sx, sy)
      if (w > 0.0001) {
        anyInFront = true
        minX = Math.min(minX, this.scratch.corner.x)
        maxX = Math.max(maxX, this.scratch.corner.x)
        minY = Math.min(minY, this.scratch.corner.y)
        maxY = Math.max(maxY, this.scratch.corner.y)
      }
    }

    if (!anyInFront) return 'hidden'
    // Any corner behind the camera means the quad straddles the near plane;
    // the screen bounds are unreliable, so be conservative and keep it.
    const straddles = minX === Infinity
    if (!straddles) {
      if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return 'hidden'
      const area = Math.min(maxX, 1.2) - Math.max(minX, -1.2)
      const areaY = Math.min(maxY, 1.2) - Math.max(minY, -1.2)
      if (area * areaY < this.distantCull) return 'distant'
    }
    return 'visible'
  }

  private perspectiveW(d: { frame: THREE.Matrix4; width: number; height: number }, sx: number, sy: number): number {
    const v = this.scratch.v.set(sx * d.width, sy * d.height, 0).applyMatrix4(d.frame)
    const e = this.camera.matrixWorldInverse.elements
    // View-space z, negated, is the perspective w.
    return -(e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14])
  }

  private configureLights(cell: BuiltCell) {
    const L = cell.lights
    this.hemi.color.setHex(L.skyColor)
    this.hemi.groundColor.setHex(L.groundColor)
    this.hemi.intensity = L.ambient

    this.key.color.setHex(L.keyColor)
    this.key.intensity = L.keyIntensity
    this.key.position.copy(L.keyDir).multiplyScalar(40)

    // Opposite the key, tinted towards the room's ground colour so the bounce
    // reads as coming off the floor rather than from a second sun.
    this.fill.color.setHex(L.groundColor)
    this.fill.intensity = L.keyIntensity * 0.55 + L.ambient * 0.35
    this.fill.position.copy(L.keyDir).multiplyScalar(-40)
    this.fill.position.y = Math.abs(this.fill.position.y) * 0.35

    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const p = this.points[i]
      const src = L.points[i]
      if (src) {
        p.position.copy(src.pos)
        p.color.setHex(src.color)
        p.intensity = src.intensity
        p.distance = src.distance
      } else {
        p.intensity = 0
      }
    }
    this.lightRig.updateMatrixWorld(true)
  }

  /** Called once per frame before rendering, to reset the root clip plane. */
  beginFrame() {
    this.clearClip()
  }
}
