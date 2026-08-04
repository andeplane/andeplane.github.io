import { clamp, smoothstep } from '../core/util'
import type { Vec3 } from './meshBuilder'

interface PlaneOccluder {
  /** A point on the plane. */
  p: Vec3
  /** Normal pointing into the room. */
  n: Vec3
  radius: number
  strength: number
}

interface PostOccluder {
  x: number
  z: number
  y0: number
  y1: number
  radius: number
  reach: number
  strength: number
}

/**
 * Cheap analytic ambient occlusion, evaluated per vertex at cell-build time.
 *
 * This is the whole of our AO budget: SPEC §6 bans screen-space AO because it
 * samples neighbouring pixels, and across a portal edge the neighbouring pixel
 * is in a different room. Corner darkening is most of what sells an interior,
 * so it gets baked into vertex colours instead.
 */
export class AOField {
  private planes: PlaneOccluder[] = []
  private posts: PostOccluder[] = []

  addPlane(p: Vec3, n: Vec3, radius = 1.3, strength = 0.8) {
    this.planes.push({ p, n, radius, strength })
  }

  addPost(x: number, z: number, y0: number, y1: number, radius: number, reach = 0.7, strength = 0.85) {
    this.posts.push({ x, z, y0, y1, radius, reach, strength })
  }

  /** Returns a multiplier in roughly [0.2, 1]. */
  sample(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    let ao = 1

    for (const pl of this.planes) {
      const d = (x - pl.p[0]) * pl.n[0] + (y - pl.p[1]) * pl.n[1] + (z - pl.p[2]) * pl.n[2]
      if (d > pl.radius || d < -0.05) continue
      const facing = nx * pl.n[0] + ny * pl.n[1] + nz * pl.n[2]
      // A plane we are lying on cannot occlude us.
      if (facing > 0.95) continue
      const weight = clamp(0.5 + 0.5 * facing, 0, 1)
      const prox = 1 - smoothstep(0, pl.radius, Math.max(d, 0))
      ao *= 1 - prox * weight * pl.strength
    }

    for (const po of this.posts) {
      if (y < po.y0 - po.reach || y > po.y1 + po.reach) continue
      const dx = po.x - x
      const dz = po.z - z
      const horiz = Math.hypot(dx, dz)
      const d = horiz - po.radius
      if (d > po.reach) continue
      // Occlusion falls off above the post's top as well as away from it.
      const vertical = y > po.y1 ? 1 - smoothstep(0, po.reach, y - po.y1) : 1
      let facing = 0
      if (horiz > 1e-4) facing = (nx * dx + nz * dz) / horiz
      const weight = clamp(0.35 + 0.65 * facing, 0, 1)
      const prox = 1 - smoothstep(0, po.reach, Math.max(d, 0))
      ao *= 1 - prox * weight * vertical * po.strength
    }

    return clamp(ao, 0.2, 1)
  }

  /** Builds the per-vertex colour callback for one tint. */
  tinted(tint: Vec3, extra = 1) {
    return (x: number, y: number, z: number, nx: number, ny: number, nz: number): Vec3 => {
      const a = this.sample(x, y, z, nx, ny, nz) * extra
      return [tint[0] * a, tint[1] * a, tint[2] * a]
    }
  }
}
