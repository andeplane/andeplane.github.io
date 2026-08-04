import * as THREE from 'three'
import { MeshBuilder, linearRGB, type Vec3 } from './meshBuilder'
import { AOField } from './ao'
import { STYLES, type CellSpec, type Wall, type Prop } from './types'
import { materials } from '../render/materials'
import { clamp } from '../core/util'

/** How far the doorway tunnel extends past the interior wall face. */
export const REVEAL = 0.22

const DEFAULT_DOOR_W = 1.25
const DEFAULT_DOOR_H = 2.25

export interface BuiltDoor {
  id: string
  cellId: string
  /** Cell-local frame: origin at the door centre, +Z = inward normal. */
  frame: THREE.Matrix4
  frameInv: THREE.Matrix4
  width: number
  height: number
  center: THREE.Vector3
  /** Inward normal (points into this cell). */
  normal: THREE.Vector3
  /** Frame X axis, along the door's width. */
  right: THREE.Vector3
  /** Absolute height of the opening's lower edge in cell coordinates. */
  sill: number
  /**
   * Height of the sill above the local floor. Two doors can be glued together
   * only if these match — their *absolute* sills are free to differ, and on a
   * staircase they must, since that difference is what puts the rise into the
   * portal transform.
   */
  sillRel: number
  /** Grilles render as portals but block movement. */
  passable: boolean
}

export interface Segment2 {
  x1: number
  z1: number
  x2: number
  z2: number
}

export interface CellCollision {
  segments: Segment2[]
  posts: { x: number; z: number; r: number }[]
  boxes: { x: number; z: number; hx: number; hz: number; top: number }[]
}

export interface CellLightRig {
  skyColor: number
  groundColor: number
  ambient: number
  keyDir: THREE.Vector3
  keyColor: number
  keyIntensity: number
  points: { pos: THREE.Vector3; color: number; intensity: number; distance: number }[]
}

export interface GoalMarker {
  x: number
  z: number
  label: string
  item: 'lantern' | 'key' | 'none'
}

export interface BuiltCell {
  spec: CellSpec
  group: THREE.Group
  doors: Map<string, BuiltDoor>
  collision: CellCollision
  lights: CellLightRig
  goals: GoalMarker[]
  floorY(x: number, z: number): number
  ceilY(x: number, z: number): number
}

// ---------------------------------------------------------------------------
// Wall coordinate helpers.
//
// Every wall is described in (t, y, q): t runs along the wall, y is height, and
// q is distance measured *inward* from the wall plane. Negative q is inside the
// doorway tunnel; the portal plane sits at q = -REVEAL.
// ---------------------------------------------------------------------------

interface WallAxes {
  /** Inward normal. */
  n: Vec3
  /** Half-length of the wall along t. */
  half: number
  toLocal(t: number, y: number, q: number): Vec3
  /** Half-extents of an axis-aligned box given (t, y, q) half sizes. */
  halfExtents(ht: number, hy: number, hq: number): Vec3
  /** Unit vector along +t, in cell-local space. */
  alongAxis: Vec3
}

function wallAxes(wall: Wall, size: [number, number, number]): WallAxes {
  const [w, , d] = size
  switch (wall) {
    case 'N':
      return {
        n: [0, 0, 1],
        half: w / 2,
        toLocal: (t, y, q) => [t, y, -d / 2 + q],
        halfExtents: (ht, hy, hq) => [ht, hy, hq],
        alongAxis: [1, 0, 0],
      }
    case 'S':
      return {
        n: [0, 0, -1],
        half: w / 2,
        toLocal: (t, y, q) => [t, y, d / 2 - q],
        halfExtents: (ht, hy, hq) => [ht, hy, hq],
        alongAxis: [1, 0, 0],
      }
    case 'E':
      return {
        n: [-1, 0, 0],
        half: d / 2,
        toLocal: (t, y, q) => [w / 2 - q, y, t],
        halfExtents: (ht, hy, hq) => [hq, hy, ht],
        alongAxis: [0, 0, 1],
      }
    case 'W':
      return {
        n: [1, 0, 0],
        half: d / 2,
        toLocal: (t, y, q) => [-w / 2 + q, y, t],
        halfExtents: (ht, hy, hq) => [hq, hy, ht],
        alongAxis: [0, 0, 1],
      }
  }
}

interface Opening {
  t0: number
  t1: number
  y0: (t: number) => number
  y1: (t: number) => number
  kind: 'door' | 'window'
  door?: { id: string; width: number; height: number; offset: number; passable: boolean; sillRel: number }
  window?: { color: number }
}

// ---------------------------------------------------------------------------

export function buildCell(spec: CellSpec): BuiltCell {
  const [w, h, d] = spec.size
  const style = STYLES[spec.style]
  const props = spec.props ?? []

  // --- floor shape -------------------------------------------------------
  const fl = spec.floor ?? { kind: 'flat' as const }
  const rampAxis = fl.axis ?? 'z'
  const low = fl.low ?? 0
  const high = fl.high ?? 0
  const floorY = (x: number, z: number): number => {
    if (fl.kind !== 'ramp') return 0
    const t = rampAxis === 'x' ? (x + w / 2) / w : (z + d / 2) / d
    return low + (high - low) * clamp(t, 0, 1)
  }
  const ceilY = (x: number, z: number) => floorY(x, z) + h

  const floorAtWall = (wall: Wall, t: number) => {
    const ax = wallAxes(wall, spec.size)
    const p = ax.toLocal(t, 0, 0)
    return floorY(p[0], p[2])
  }

  // --- ambient occlusion field ------------------------------------------
  const ao = new AOField()
  ao.addPlane([0, 0, -d / 2], [0, 0, 1])
  ao.addPlane([0, 0, d / 2], [0, 0, -1])
  ao.addPlane([w / 2, 0, 0], [-1, 0, 0])
  ao.addPlane([-w / 2, 0, 0], [1, 0, 0])
  // Floor and ceiling planes are handled at the mean height; on a ramp the
  // error is under a step and invisible once the AO is this soft.
  const meanFloor = (floorY(-w / 2, -d / 2) + floorY(w / 2, d / 2)) / 2
  ao.addPlane([0, meanFloor, 0], [0, 1, 0], 1.1, 0.7)
  ao.addPlane([0, meanFloor + h, 0], [0, -1, 0], 1.1, 0.7)

  for (const p of props) {
    if (p.kind === 'column') {
      const r = p.radius ?? 0.32
      const y0 = floorY(p.x, p.z)
      ao.addPost(p.x, p.z, y0, y0 + h, r, 0.85, 0.9)
    } else if (p.kind === 'crate') {
      const s = p.size ?? 0.6
      const y0 = floorY(p.x, p.z)
      ao.addPost(p.x, p.z, y0, y0 + (p.height ?? s), s * 0.75, 0.5, 0.8)
    } else if (p.kind === 'pedestal') {
      const y0 = floorY(p.x, p.z)
      ao.addPost(p.x, p.z, y0, y0 + 1.0, 0.28, 0.45, 0.8)
    }
  }

  // --- builders per material family --------------------------------------
  const plaster = new MeshBuilder()
  const wood = new MeshBuilder()
  const stone = new MeshBuilder()
  const glow = new MeshBuilder()

  const cWall = ao.tinted(linearRGB(style.wall))
  const cCeil = ao.tinted(linearRGB(style.ceiling))
  const cFloor = ao.tinted(linearRGB(style.floor))
  const cTrim = ao.tinted(linearRGB(style.trim))
  const cAccent = ao.tinted(linearRGB(style.accent))
  const floorBuilder = style.floorMat === 'stone' ? stone : wood

  // --- gather wall openings ---------------------------------------------
  const openingsByWall = new Map<Wall, Opening[]>()
  const pushOpening = (wall: Wall, o: Opening) => {
    const list = openingsByWall.get(wall) ?? []
    list.push(o)
    openingsByWall.set(wall, list)
  }

  for (const dsp of spec.doors ?? []) {
    const grille = dsp.kind === 'grille'
    const dw = dsp.width ?? (grille ? 1.15 : DEFAULT_DOOR_W)
    const dh = dsp.height ?? (grille ? 1.4 : DEFAULT_DOOR_H)
    const sill = dsp.sill ?? (grille ? 0.95 : 0)
    const off = dsp.offset ?? 0
    // The opening itself is level even where the floor is not: a door frame in
    // a real building is plumb, and a sloped one would leave a wedge-shaped
    // gap between the reveal and the wall patch around it.
    const base = floorAtWall(dsp.wall, off) + sill
    pushOpening(dsp.wall, {
      t0: off - dw / 2,
      t1: off + dw / 2,
      y0: () => base,
      y1: () => base + dh,
      kind: 'door',
      door: { id: dsp.id, width: dw, height: dh, offset: off, passable: !grille, sillRel: sill },
    })
  }
  for (const p of props) {
    if (p.kind !== 'window') continue
    const ww = p.width ?? 1.1
    const wh = p.height ?? 1.6
    const sill = p.sill ?? 1.0
    const off = p.offset ?? 0
    const base = floorAtWall(p.wall, off) + sill
    pushOpening(p.wall, {
      t0: off - ww / 2,
      t1: off + ww / 2,
      y0: () => base,
      y1: () => base + wh,
      kind: 'window',
      window: { color: p.color ?? 0x9fc4e8 },
    })
  }

  // --- walls -------------------------------------------------------------
  const collision: CellCollision = { segments: [], posts: [], boxes: [] }
  const doors = new Map<string, BuiltDoor>()
  const lightPoints: CellLightRig['points'] = []

  const WALLS: Wall[] = ['N', 'S', 'E', 'W']
  for (const wall of WALLS) {
    const ax = wallAxes(wall, spec.size)
    const openings = (openingsByWall.get(wall) ?? []).slice().sort((a, b) => a.t0 - b.t0)

    // Solid strips between openings, full height.
    const cuts: number[] = [-ax.half]
    for (const o of openings) cuts.push(o.t0, o.t1)
    cuts.push(ax.half)
    for (let i = 0; i < cuts.length; i += 2) {
      const t0 = cuts[i]
      const t1 = cuts[i + 1]
      if (t1 - t0 < 1e-4) continue
      addWallPatch(plaster, ax, t0, t1, (t) => floorAtWall(wall, t), (t) => floorAtWall(wall, t) + h, cWall)
    }

    // Lintel above, and an apron below anything with a raised sill.
    for (const o of openings) {
      addWallPatch(plaster, ax, o.t0, o.t1, o.y1, (t) => floorAtWall(wall, t) + h, cWall)
      if (o.y0(o.t0) > floorAtWall(wall, o.t0) + 1e-4) {
        addWallPatch(plaster, ax, o.t0, o.t1, (t) => floorAtWall(wall, t), o.y0, cWall)
      }
    }

    // Skirting and collision follow only the openings that actually reach the
    // floor. A window or a grille interrupts the wall halfway up but leaves
    // its base solid, so it must neither break the skirting run nor open a gap
    // you can walk through.
    const floorCuts: number[] = [-ax.half]
    for (const o of openings) {
      if (o.kind !== 'door' || !o.door!.passable) continue
      if (o.y0(o.t0) > floorAtWall(wall, o.t0) + 0.02) continue
      floorCuts.push(o.t0, o.t1)
    }
    floorCuts.push(ax.half)

    for (let i = 0; i < floorCuts.length; i += 2) {
      const t0 = floorCuts[i]
      const t1 = floorCuts[i + 1]
      if (t1 - t0 < 1e-4) continue
      addSkirting(wood, ax, t0, t1, (t) => floorAtWall(wall, t), cTrim)
      const a = ax.toLocal(t0, 0, 0)
      const b = ax.toLocal(t1, 0, 0)
      collision.segments.push({ x1: a[0], z1: a[2], x2: b[0], z2: b[2] })
    }

    // Openings: reveals, frames, glazing, and the door records themselves.
    for (const o of openings) {
      const sill = o.y0(0)
      const head = o.y1(0)
      const fullHeight = o.kind === 'door' && o.door!.passable
      addReveal(plaster, ax, o.t0, o.t1, sill, head, cWall)
      addArchitrave(wood, ax, o.t0, o.t1, sill, head, cTrim, fullHeight)

      if (o.kind === 'window' && o.window) {
        // The glazing is a bright emissive panel at the far end of the reveal.
        // Vertex colours above 1.0 push it into bloom (SPEC §6.4).
        const c = new THREE.Color(o.window.color)
        c.convertSRGBToLinear()
        const boost = 4.2
        addFlatPanel(
          glow,
          ax,
          o.t0 + 0.03,
          o.t1 - 0.03,
          sill + 0.03,
          head - 0.03,
          -REVEAL * 0.85,
          () => [c.r * boost, c.g * boost, c.b * boost] as Vec3,
        )
        const mid = ax.toLocal((o.t0 + o.t1) / 2, (sill + head) / 2, -0.1)
        lightPoints.push({
          pos: new THREE.Vector3(mid[0], mid[1], mid[2]),
          color: o.window.color,
          intensity: 14,
          distance: 11,
        })
      }

      if (o.kind === 'door' && o.door) {
        const dw = o.door.width
        const dh = o.door.height
        const cx = (o.t0 + o.t1) / 2
        const origin = ax.toLocal(cx, sill + dh / 2, -REVEAL)
        const zAxis = new THREE.Vector3(ax.n[0], ax.n[1], ax.n[2])
        const yAxis = new THREE.Vector3(0, 1, 0)
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize()
        const frame = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
        frame.setPosition(origin[0], origin[1], origin[2])

        doors.set(o.door.id, {
          id: o.door.id,
          cellId: spec.id,
          frame,
          frameInv: frame.clone().invert(),
          width: dw,
          height: dh,
          center: new THREE.Vector3(origin[0], origin[1], origin[2]),
          normal: zAxis.clone(),
          right: xAxis.clone(),
          sill,
          sillRel: o.door.sillRel,
          passable: o.door.passable,
        })

        if (o.door.passable) {
          // The tunnel's side walls are solid, so the portal plane at its far
          // end is the only way out.
          const s0a = ax.toLocal(o.t0, 0, 0)
          const s0b = ax.toLocal(o.t0, 0, -REVEAL)
          const s1a = ax.toLocal(o.t1, 0, 0)
          const s1b = ax.toLocal(o.t1, 0, -REVEAL)
          collision.segments.push({ x1: s0a[0], z1: s0a[2], x2: s0b[0], z2: s0b[2] })
          collision.segments.push({ x1: s1a[0], z1: s1a[2], x2: s1b[0], z2: s1b[2] })
        } else {
          // Bars, so it reads as something you look through rather than walk
          // through. They sit inside the reveal and so occlude the portal quad
          // naturally, without any special case in the renderer.
          const nBars = Math.max(2, Math.round(dw / 0.26))
          for (let i = 1; i < nBars; i++) {
            const t = o.t0 + ((o.t1 - o.t0) * i) / nBars
            const p0 = ax.toLocal(t, 0, -REVEAL * 0.45)
            wood.cylinder(p0[0], p0[2], sill, head, 0.022, 5, cAccent)
          }
        }
      }
    }
  }

  // --- floor and ceiling -------------------------------------------------
  const nx = Math.max(2, Math.round(w / 0.6))
  const nz = Math.max(2, Math.round(d / 0.6))

  if (fl.kind === 'ramp' && (fl.steps ?? 0) > 0) {
    addSteps(floorBuilder, spec.size, rampAxis, low, high, fl.steps!, cFloor, cTrim)
  } else {
    floorBuilder.surface(
      nx,
      nz,
      (u, v) => {
        const x = -w / 2 + w * u
        const z = -d / 2 + d * v
        return [x, floorY(x, z), z]
      },
      [0, 1, 0],
      cFloor,
    )
  }

  plaster.surface(
    nx,
    nz,
    (u, v) => {
      const x = -w / 2 + w * u
      const z = -d / 2 + d * v
      return [x, ceilY(x, z), z]
    },
    [0, -1, 0],
    cCeil,
  )

  // Cornice where wall meets ceiling — cheap, and it reads as craftsmanship.
  for (const wall of WALLS) {
    const ax = wallAxes(wall, spec.size)
    wood.surface(
      Math.max(2, Math.round((ax.half * 2) / 0.6)),
      1,
      (u, v) => {
        const t = -ax.half + ax.half * 2 * u
        const base = floorAtWall(wall, t) + h
        return ax.toLocal(t, base - 0.13 + 0.13 * v, 0.09 * (1 - v))
      },
      [0, -0.6, 0],
      cTrim,
    )
  }

  // --- props -------------------------------------------------------------
  for (const p of props) {
    addProp(p, spec, { plaster, wood, stone, glow }, { cWall, cTrim, cAccent, cFloor }, ao, floorY, collision, lightPoints)
  }

  // --- assemble ----------------------------------------------------------
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  const add = (b: MeshBuilder, m: THREE.Material) => {
    if (b.isEmpty) return
    const mesh = new THREE.Mesh(b.build(), m)
    mesh.matrixAutoUpdate = false
    mesh.frustumCulled = false
    group.add(mesh)
  }
  add(plaster, materials.plaster)
  add(wood, materials.wood)
  add(stone, materials.stone)
  add(glow, materials.glow)

  const lightSpec = spec.light ?? {}
  const keyDir = lightSpec.key?.dir ?? [0.4, 0.85, 0.3]
  const lights: CellLightRig = {
    skyColor: lightSpec.skyColor ?? 0xbfd4e8,
    groundColor: lightSpec.groundColor ?? 0x4a3a2c,
    ambient: lightSpec.ambient ?? 0.55,
    keyDir: new THREE.Vector3(keyDir[0], keyDir[1], keyDir[2]).normalize(),
    keyColor: lightSpec.key?.color ?? 0xfff0d8,
    keyIntensity: lightSpec.key?.intensity ?? 0.9,
    points: lightPoints.sort((a, b) => b.intensity - a.intensity).slice(0, 4),
  }

  const goals: GoalMarker[] = props
    .filter((p): p is Extract<Prop, { kind: 'pedestal' }> => p.kind === 'pedestal')
    .map((p) => ({ x: p.x, z: p.z, label: p.label ?? '', item: p.item ?? 'lantern' }))

  return { spec, group, doors, collision, lights, goals, floorY, ceilY }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Vec3

function addWallPatch(
  mb: MeshBuilder,
  ax: WallAxes,
  t0: number,
  t1: number,
  yLo: (t: number) => number,
  yHi: (t: number) => number,
  color: ColorFn,
) {
  const span = t1 - t0
  if (span < 1e-4) return
  const nu = Math.max(1, Math.round(span / 0.55))
  const meanH = Math.max(0.01, (yHi(t0) + yHi(t1)) / 2 - (yLo(t0) + yLo(t1)) / 2)
  const nv = Math.max(1, Math.round(meanH / 0.55))
  mb.surface(
    nu,
    nv,
    (u, v) => {
      const t = t0 + span * u
      return ax.toLocal(t, yLo(t) + (yHi(t) - yLo(t)) * v, 0)
    },
    ax.n,
    color,
  )
}

function addSkirting(mb: MeshBuilder, ax: WallAxes, t0: number, t1: number, yLo: (t: number) => number, color: ColorFn) {
  const span = t1 - t0
  const nu = Math.max(1, Math.round(span / 0.8))
  const H = 0.14
  const D = 0.045
  // Face
  mb.surface(nu, 1, (u, v) => {
    const t = t0 + span * u
    return ax.toLocal(t, yLo(t) + H * v, D)
  }, ax.n, color)
  // Top bevel
  mb.surface(nu, 1, (u, v) => {
    const t = t0 + span * u
    return ax.toLocal(t, yLo(t) + H, D * (1 - v))
  }, [0, 1, 0], color)
}

/** The four faces lining a doorway or window tunnel. */
function addReveal(
  mb: MeshBuilder,
  ax: WallAxes,
  t0: number,
  t1: number,
  sill: number,
  head: number,
  color: ColorFn,
) {
  const nq = 1
  // Left jamb (normal points toward +t).
  mb.surface(nq, 2, (u, v) => ax.toLocal(t0, sill + (head - sill) * v, -REVEAL * u), ax.alongAxis, color)
  // Right jamb.
  mb.surface(
    nq,
    2,
    (u, v) => ax.toLocal(t1, sill + (head - sill) * v, -REVEAL * u),
    [-ax.alongAxis[0], -ax.alongAxis[1], -ax.alongAxis[2]],
    color,
  )
  // Head.
  mb.surface(Math.max(1, Math.round((t1 - t0) / 0.6)), nq, (u, v) => ax.toLocal(t0 + (t1 - t0) * u, head, -REVEAL * v), [0, -1, 0], color)
  // Threshold / sill.
  mb.surface(
    Math.max(1, Math.round((t1 - t0) / 0.6)),
    nq,
    (u, v) => ax.toLocal(t0 + (t1 - t0) * u, sill, -REVEAL * v),
    [0, 1, 0],
    color,
  )
}

/** A flat trim band around an opening, standing slightly proud of the wall. */
function addArchitrave(
  mb: MeshBuilder,
  ax: WallAxes,
  t0: number,
  t1: number,
  sill: number,
  head: number,
  color: ColorFn,
  full: boolean,
) {
  const W = 0.11
  const OUT = 0.035
  const bandFace = (a0: number, a1: number, b0: number, b1: number) => {
    mb.surface(1, 1, (u, v) => ax.toLocal(a0 + (a1 - a0) * u, b0 + (b1 - b0) * v, OUT), ax.n, color)
  }
  bandFace(t0 - W, t0, sill - (full ? 0 : W), head + W)
  bandFace(t1, t1 + W, sill - (full ? 0 : W), head + W)
  bandFace(t0 - W, t1 + W, head, head + W)
  if (!full) bandFace(t0 - W, t1 + W, sill - W, sill)
}

/** A panel parallel to a wall, at inward depth q. */
function addFlatPanel(
  mb: MeshBuilder,
  ax: WallAxes,
  t0: number,
  t1: number,
  y0: number,
  y1: number,
  q: number,
  color: ColorFn,
) {
  mb.surface(1, 1, (u, v) => ax.toLocal(t0 + (t1 - t0) * u, y0 + (y1 - y0) * v, q), ax.n, color)
}

function addSteps(
  mb: MeshBuilder,
  size: [number, number, number],
  axis: 'x' | 'z',
  low: number,
  high: number,
  steps: number,
  cTread: ColorFn,
  cRiser: ColorFn,
) {
  const [w, , d] = size
  const len = axis === 'x' ? w : d
  const halfCross = (axis === 'x' ? d : w) / 2
  const at = (a: number, cross: number): Vec3 =>
    axis === 'x' ? [-len / 2 + a, 0, cross] : [cross, 0, -len / 2 + a]

  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * len
    const a1 = ((i + 1) / steps) * len
    const yMid = low + (high - low) * ((i + 0.5) / steps)
    const yPrev = i === 0 ? low : low + (high - low) * ((i - 0.5) / steps)

    // Tread
    mb.surface(
      1,
      2,
      (u, v) => {
        const p = at(a0 + (a1 - a0) * u, -halfCross + halfCross * 2 * v)
        return [p[0], yMid, p[2]]
      },
      [0, 1, 0],
      cTread,
    )
    // Riser
    const riserN: Vec3 = axis === 'x' ? [-1, 0, 0] : [0, 0, -1]
    mb.surface(
      1,
      1,
      (u, v) => {
        const p = at(a0, -halfCross + halfCross * 2 * u)
        return [p[0], yPrev + (yMid - yPrev) * v, p[2]]
      },
      riserN,
      cRiser,
    )
  }
}

function addProp(
  p: Prop,
  spec: CellSpec,
  mb: { plaster: MeshBuilder; wood: MeshBuilder; stone: MeshBuilder; glow: MeshBuilder },
  cols: { cWall: ColorFn; cTrim: ColorFn; cAccent: ColorFn; cFloor: ColorFn },
  ao: AOField,
  floorY: (x: number, z: number) => number,
  collision: CellCollision,
  lights: CellLightRig['points'],
) {
  const [, h] = spec.size

  switch (p.kind) {
    case 'column': {
      const r = p.radius ?? 0.32
      const y0 = floorY(p.x, p.z)
      const top = y0 + h
      mb.stone.box(p.x, y0 + 0.09, p.z, r * 1.42, 0.09, r * 1.42, cols.cTrim, 2)
      mb.stone.cylinder(p.x, p.z, y0 + 0.18, top - 0.26, r, 20, cols.cAccent, p.style === 'plain' ? 0 : 16)
      mb.stone.box(p.x, top - 0.13, p.z, r * 1.5, 0.13, r * 1.5, cols.cTrim, 2)
      collision.posts.push({ x: p.x, z: p.z, r: r * 1.15 })
      break
    }
    case 'lamp': {
      const y = p.y ?? 2.15
      const color = p.color ?? 0xffc98a
      const c = new THREE.Color(color)
      c.convertSRGBToLinear()
      const boost = 5.5
      mb.wood.cylinder(p.x, p.z, y + 0.16, y + 0.5, 0.02, 6, cols.cTrim)
      mb.glow.cylinder(p.x, p.z, y - 0.1, y + 0.16, 0.15, 12, () => [c.r * boost, c.g * boost, c.b * boost] as Vec3)
      lights.push({
        pos: new THREE.Vector3(p.x, y, p.z),
        color,
        intensity: p.intensity ?? 9,
        distance: 9,
      })
      break
    }
    case 'crate': {
      const s = p.size ?? 0.62
      const hh = (p.height ?? s) / 2
      const y0 = floorY(p.x, p.z)
      mb.wood.box(p.x, y0 + hh, p.z, s / 2, hh, s / 2, cols.cTrim, 2)
      collision.boxes.push({ x: p.x, z: p.z, hx: s / 2, hz: s / 2, top: y0 + hh * 2 })
      break
    }
    case 'pedestal': {
      const y0 = floorY(p.x, p.z)
      mb.stone.box(p.x, y0 + 0.06, p.z, 0.34, 0.06, 0.34, cols.cTrim, 2)
      mb.stone.cylinder(p.x, p.z, y0 + 0.12, y0 + 0.9, 0.19, 14, cols.cAccent)
      mb.stone.box(p.x, y0 + 0.95, p.z, 0.3, 0.05, 0.3, cols.cTrim, 2)
      if ((p.item ?? 'lantern') !== 'none') {
        const c = new THREE.Color(p.item === 'key' ? 0xd8f0ff : 0xffd79a)
        c.convertSRGBToLinear()
        const boost = 7
        mb.glow.box(p.x, y0 + 1.12, p.z, 0.1, 0.12, 0.1, () => [c.r * boost, c.g * boost, c.b * boost] as Vec3, 1)
        lights.push({
          pos: new THREE.Vector3(p.x, y0 + 1.2, p.z),
          color: p.item === 'key' ? 0xbfe4ff : 0xffcf8a,
          intensity: 12,
          distance: 8,
        })
      }
      collision.posts.push({ x: p.x, z: p.z, r: 0.34 })
      break
    }
    case 'rug': {
      const y = floorY(p.x, p.z) + 0.012
      const c = ao.tinted(linearRGB(p.color ?? 0x7a3b3b))
      mb.wood.surface(
        Math.max(1, Math.round(p.w / 0.5)),
        Math.max(1, Math.round(p.d / 0.5)),
        (u, v) => [p.x - p.w / 2 + p.w * u, y, p.z - p.d / 2 + p.d * v],
        [0, 1, 0],
        c,
      )
      break
    }
    case 'painting': {
      const ax = wallAxes(p.wall, spec.size)
      const pw = p.w ?? 0.9
      const ph = p.h ?? 1.15
      const off = p.offset ?? 0
      const y = p.y ?? 1.65
      const c = ao.tinted(linearRGB(p.color ?? 0x2b3a2e))
      mb.wood.surface(1, 1, (u, v) => ax.toLocal(off - pw / 2 - 0.06 + (pw + 0.12) * u, y - ph / 2 - 0.06 + (ph + 0.12) * v, 0.03), ax.n, cols.cAccent)
      mb.wood.surface(1, 1, (u, v) => ax.toLocal(off - pw / 2 + pw * u, y - ph / 2 + ph * v, 0.05), ax.n, c)
      break
    }
    case 'bookshelf': {
      const ax = wallAxes(p.wall, spec.size)
      const bw = p.width ?? 1.6
      const off = p.offset ?? 0
      const n = Math.max(1, Math.round(bw / 0.4))
      for (let i = 0; i < n; i++) {
        const t = off - bw / 2 + (bw / n) * (i + 0.5)
        const localBase = ax.toLocal(t, 0, 0)
        const y0 = floorY(localBase[0], localBase[2])
        for (let s = 0; s < 4; s++) {
          const sy = y0 + 0.35 + s * 0.45
          mb.wood.surface(1, 1, (u, v) => ax.toLocal(t - bw / n / 2 + (bw / n) * u, sy + 0.34 * v, 0.28), ax.n, cols.cTrim)
        }
      }
      const a = ax.toLocal(off - bw / 2, 0, 0.3)
      const b = ax.toLocal(off + bw / 2, 0, 0.3)
      collision.segments.push({ x1: a[0], z1: a[2], x2: b[0], z2: b[2] })
      break
    }
    case 'banister': {
      const ax = wallAxes(p.wall, spec.size)
      const span = ax.half * 2
      const n = Math.max(3, Math.round(span / 0.52))
      for (let i = 0; i <= n; i++) {
        const t = -ax.half + (span / n) * i
        const base = ax.toLocal(t, 0, 0.2)
        const y0 = floorY(base[0], base[2])
        mb.wood.cylinder(base[0], base[2], y0, y0 + 0.9, 0.032, 6, cols.cTrim)
      }
      // A continuous handrail following the floor, which is what makes the
      // posts read as joinery rather than as a row of bollards.
      mb.wood.surface(
        n,
        1,
        (u, v) => {
          const t = -ax.half + span * u
          const base = ax.toLocal(t, 0, 0.2)
          const y = floorY(base[0], base[2]) + 0.9
          return ax.toLocal(t, y + 0.055 * v, 0.2 + 0.05 - 0.1 * v)
        },
        [0, 1, 0],
        cols.cTrim,
      )
      mb.wood.surface(
        n,
        1,
        (u, v) => {
          const t = -ax.half + span * u
          const base = ax.toLocal(t, 0, 0.2)
          const y = floorY(base[0], base[2]) + 0.9
          return ax.toLocal(t, y + 0.055 - 0.055 * v, 0.15)
        },
        ax.n,
        cols.cTrim,
      )
      break
    }
    case 'window':
      // Handled as a wall opening.
      break
  }
}
