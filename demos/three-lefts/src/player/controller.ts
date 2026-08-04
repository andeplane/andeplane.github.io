import * as THREE from 'three'
import type { World } from '../world/world'
import type { BuiltCell, Segment2 } from '../world/buildCell'
import type { Input } from '../core/input'
import { clamp, damp } from '../core/util'

const RADIUS = 0.3
const EYE = 1.62
const WALK = 2.55
const RUN = 4.2
const ACCEL = 22
const FRICTION = 14
const MAX_CROSSINGS = 6

export interface CrossingEvent {
  fromCell: string
  toCell: string
  doorId: string
}

/**
 * First-person controller that lives in the portal graph rather than in a
 * world space (SPEC §5).
 *
 * Position is always `(cell, local x/z)`. Nothing here can be compared against
 * a position in another cell, and no code path assumes it can.
 */
export class Player {
  cellId: string
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  pitch = 0

  /** Height the camera actually renders at, damped so stairs feel smooth. */
  private eyeY = EYE
  private bobPhase = 0
  private bobAmount = 0
  private roll = 0

  /**
   * Accumulated "unroll to the starting chart" transform: the developing map
   * (SPEC §3.4). `develop · p` is where a person dead-reckoning with a pencil
   * would think they are — which is exactly why it stops being true.
   */
  readonly develop = new THREE.Matrix4()
  /** Total left-turn count, purely for the HUD's benefit. */
  turnAccumulator = 0

  readonly cameraMatrix = new THREE.Matrix4()
  readonly trail: { x: number; z: number; cell: string }[] = []
  private trailTimer = 0

  /**
   * Fired when a foot lands, with 0..1 for how hard. Driven off the head bob
   * rather than off a timer so the sound and the picture cannot drift apart —
   * a footstep that lands off the bob reads as a bug, and a player who suspects
   * a bug stops suspecting the geometry (PRD P4).
   */
  onFootstep?: (intensity: number) => void

  private readonly tmp = {
    v: new THREE.Vector3(),
    v2: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    m: new THREE.Matrix4(),
    e: new THREE.Euler(0, 0, 0, 'YXZ'),
  }

  constructor(
    private readonly world: World,
    spawn: { cell: string; pos: [number, number]; yaw: number },
  ) {
    this.cellId = spawn.cell
    const cell = world.cell(spawn.cell)
    this.pos.set(spawn.pos[0], cell.floorY(spawn.pos[0], spawn.pos[1]), spawn.pos[1])
    this.yaw = (spawn.yaw * Math.PI) / 180
    this.eyeY = EYE
    this.develop.identity()
    this.pushTrail()
    this.updateCamera(0)
  }

  get cell(): BuiltCell {
    return this.world.cell(this.cellId)
  }

  look(dx: number, dy: number, sensitivity: number, invertY: boolean) {
    this.yaw -= dx * sensitivity
    this.pitch -= dy * sensitivity * (invertY ? -1 : 1)
    this.pitch = clamp(this.pitch, -1.45, 1.45)
  }

  step(dt: number, input: Input, onCross?: (e: CrossingEvent) => void) {
    // --- desired velocity ------------------------------------------------
    const strafe = input.axis('KeyA', 'KeyD')
    const forward = input.axis('KeyS', 'KeyW')
    const speed = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? RUN : WALK

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    // Forward is -Z rotated by yaw, matching three.js camera convention.
    let wx = -sin * forward + cos * strafe
    let wz = -cos * forward - sin * strafe
    const len = Math.hypot(wx, wz)
    if (len > 1e-4) {
      wx /= len
      wz /= len
    }

    const targetVX = wx * speed
    const targetVZ = wz * speed
    const rate = len > 1e-4 ? ACCEL : FRICTION
    this.vel.x += (targetVX - this.vel.x) * Math.min(1, rate * dt)
    this.vel.z += (targetVZ - this.vel.z) * Math.min(1, rate * dt)

    // --- integrate through the portal graph ------------------------------
    this.move(this.vel.x * dt, this.vel.z * dt, onCross)

    // --- head bob ---------------------------------------------------------
    const groundSpeed = Math.hypot(this.vel.x, this.vel.z)
    const wasPhase = this.bobPhase
    this.bobPhase += groundSpeed * dt * 2.6
    this.bobAmount = damp(this.bobAmount, Math.min(groundSpeed / RUN, 1), 0.12, dt)

    // The eye dips at the bottom of the bob — sin(2·phase) is least at
    // phase = −π/4 + kπ — and that is where the foot is on the floor.
    if (this.onFootstep && this.bobAmount > 0.08) {
      const beat = (p: number) => Math.floor((p + Math.PI / 4) / Math.PI)
      if (beat(this.bobPhase) !== beat(wasPhase)) {
        this.onFootstep(clamp(groundSpeed / RUN, 0.3, 1))
      }
    }

    this.trailTimer += dt
    if (this.trailTimer > 0.12) {
      this.trailTimer = 0
      this.pushTrail()
    }
  }

  /** Horizontal displacement, following portals as it goes. */
  private move(dx: number, dz: number, onCross?: (e: CrossingEvent) => void) {
    let remaining = 1
    for (let iter = 0; iter < MAX_CROSSINGS && remaining > 1e-6; iter++) {
      const cell = this.cell
      const stepX = dx * remaining
      const stepZ = dz * remaining

      const hit = this.findCrossing(cell, stepX, stepZ)
      if (!hit) {
        this.pos.x += stepX
        this.pos.z += stepZ
        this.resolveCollisions(cell)
        this.pos.y = cell.floorY(this.pos.x, this.pos.z)
        return
      }

      // Advance to the portal plane, then change coordinate system.
      const eps = 0.004
      const t = Math.max(0, hit.t)
      this.pos.x += stepX * t
      this.pos.z += stepZ * t

      const portal = this.world.portalThrough(cell.spec.id, hit.doorId)!
      const T = portal.transform

      this.pos.applyMatrix4(T)
      this.tmp.v.set(this.vel.x, 0, this.vel.z).transformDirection(T)
      this.vel.x = this.tmp.v.x
      this.vel.z = this.tmp.v.z

      // Re-derive yaw from the transformed forward vector rather than trying to
      // add angles: the vector cannot pick up a sign convention error.
      this.tmp.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).transformDirection(T)
      const newYaw = Math.atan2(-this.tmp.fwd.x, -this.tmp.fwd.z)
      this.turnAccumulator += shortestTurn(this.yaw, newYaw)
      this.yaw = newYaw

      // develop ← develop · T⁻¹ keeps mapping us back to the starting chart.
      this.tmp.m.copy(T).invert()
      this.develop.multiply(this.tmp.m)

      this.cellId = portal.toCell
      const dest = this.cell
      this.pos.y = dest.floorY(this.pos.x, this.pos.z)

      // Nudge clear of the plane so the next iteration does not re-detect it.
      const door = dest.doors.get(portal.toDoor)!
      this.pos.x += door.normal.x * eps
      this.pos.z += door.normal.z * eps

      // Direction is unchanged in the new chart's terms, so recompute the
      // remaining displacement from the transformed velocity.
      const speed = Math.hypot(dx, dz)
      const vlen = Math.hypot(this.vel.x, this.vel.z)
      if (vlen > 1e-6) {
        dx = (this.vel.x / vlen) * speed
        dz = (this.vel.z / vlen) * speed
      }
      remaining *= 1 - t

      onCross?.({ fromCell: cell.spec.id, toCell: portal.toCell, doorId: hit.doorId })
      this.pushTrail()
    }

    this.resolveCollisions(this.cell)
    this.pos.y = this.cell.floorY(this.pos.x, this.pos.z)
  }

  /**
   * The eye, not the body, decides when we change cells — otherwise the camera
   * sees through the wall for a frame (SPEC §5.2).
   */
  private findCrossing(cell: BuiltCell, dx: number, dz: number): { t: number; doorId: string } | null {
    const ex = this.pos.x
    const ez = this.pos.z
    const ey = this.pos.y + EYE
    let best: { t: number; doorId: string } | null = null

    for (const door of cell.doors.values()) {
      if (!door.passable) continue
      const n = door.normal
      const c = door.center
      const d0 = (ex - c.x) * n.x + (ey - c.y) * n.y + (ez - c.z) * n.z
      const d1 = (ex + dx - c.x) * n.x + (ey - c.y) * n.y + (ez + dz - c.z) * n.z
      if (d0 <= 0 || d1 > 0) continue

      const t = d0 / (d0 - d1)
      const qx = ex + dx * t
      const qz = ez + dz * t
      const lateral = (qx - c.x) * door.right.x + (qz - c.z) * door.right.z
      if (Math.abs(lateral) > door.width / 2) continue
      if (!best || t < best.t) best = { t, doorId: door.id }
    }
    return best
  }

  private resolveCollisions(cell: BuiltCell) {
    const col = cell.collision
    for (let pass = 0; pass < 3; pass++) {
      let moved = false
      for (const s of col.segments) {
        if (this.pushOutSegment(s)) moved = true
      }
      for (const p of col.posts) {
        if (this.pushOutCircle(p.x, p.z, p.r)) moved = true
      }
      for (const b of col.boxes) {
        if (this.pushOutBox(b.x, b.z, b.hx, b.hz)) moved = true
      }
      if (!moved) break
    }
  }

  private pushOutSegment(s: Segment2): boolean {
    const ax = s.x2 - s.x1
    const az = s.z2 - s.z1
    const len2 = ax * ax + az * az
    let t = 0
    if (len2 > 1e-9) {
      t = clamp(((this.pos.x - s.x1) * ax + (this.pos.z - s.z1) * az) / len2, 0, 1)
    }
    const cx = s.x1 + ax * t
    const cz = s.z1 + az * t
    let dx = this.pos.x - cx
    let dz = this.pos.z - cz
    let dist = Math.hypot(dx, dz)
    if (dist >= RADIUS) return false
    if (dist < 1e-5) {
      // Degenerate: push along the segment normal.
      dx = -az
      dz = ax
      dist = Math.hypot(dx, dz) || 1
    }
    const push = (RADIUS - dist) / dist
    this.pos.x += dx * push
    this.pos.z += dz * push
    return true
  }

  private pushOutCircle(x: number, z: number, r: number): boolean {
    const dx = this.pos.x - x
    const dz = this.pos.z - z
    const dist = Math.hypot(dx, dz)
    const min = r + RADIUS
    if (dist >= min) return false
    if (dist < 1e-5) {
      this.pos.x += min
      return true
    }
    const push = (min - dist) / dist
    this.pos.x += dx * push
    this.pos.z += dz * push
    return true
  }

  private pushOutBox(x: number, z: number, hx: number, hz: number): boolean {
    const dx = this.pos.x - x
    const dz = this.pos.z - z
    const ox = hx + RADIUS - Math.abs(dx)
    const oz = hz + RADIUS - Math.abs(dz)
    if (ox <= 0 || oz <= 0) return false
    if (ox < oz) this.pos.x += Math.sign(dx || 1) * ox
    else this.pos.z += Math.sign(dz || 1) * oz
    return true
  }

  private pushTrail() {
    const p = this.tmp.v2.set(this.pos.x, 0, this.pos.z).applyMatrix4(this.develop)
    const last = this.trail[this.trail.length - 1]
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < 0.18) return
    this.trail.push({ x: p.x, z: p.z, cell: this.cellId })
    if (this.trail.length > 4000) this.trail.shift()
  }

  updateCamera(dt: number) {
    const targetEye = this.pos.y + EYE
    this.eyeY = dt > 0 ? damp(this.eyeY, targetEye, 0.045, dt) : targetEye

    const bobY = Math.sin(this.bobPhase * 2) * 0.022 * this.bobAmount
    const bobRoll = Math.sin(this.bobPhase) * 0.0075 * this.bobAmount
    this.roll = dt > 0 ? damp(this.roll, bobRoll, 0.05, dt) : bobRoll

    this.tmp.e.set(this.pitch, this.yaw, this.roll, 'YXZ')
    this.tmp.q.setFromEuler(this.tmp.e)
    this.cameraMatrix.makeRotationFromQuaternion(this.tmp.q)
    this.cameraMatrix.setPosition(this.pos.x, this.eyeY + bobY, this.pos.z)
  }

  /** Where the player thinks they are, if they trusted flat geometry. */
  developedPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, 0, this.pos.z).applyMatrix4(this.develop)
  }

  developedYaw(): number {
    this.tmp.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).transformDirection(this.develop)
    return Math.atan2(-this.tmp.fwd.x, -this.tmp.fwd.z)
  }
}

function shortestTurn(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
