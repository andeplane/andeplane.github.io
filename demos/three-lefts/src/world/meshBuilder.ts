import * as THREE from 'three'

export type Vec3 = [number, number, number]

/**
 * Accumulates triangles for one material family into flat arrays, so a whole
 * cell collapses to a handful of draw calls.
 *
 * Colour is baked per-vertex: albedo tint multiplied by ambient occlusion.
 * That is deliberate — SPEC §6 forbids screen-space AO because it would leak
 * across portal boundaries, so corner darkening has to live in the geometry.
 */
export class MeshBuilder {
  private pos: number[] = []
  private nrm: number[] = []
  private col: number[] = []

  get isEmpty() {
    return this.pos.length === 0
  }

  /**
   * A subdivided quad. `p(u,v)` maps the unit square to a position, so this
   * handles flat walls, sloped floors, and door reveals with the same code.
   * Subdivision exists so vertex AO has somewhere to live.
   */
  surface(
    nu: number,
    nv: number,
    p: (u: number, v: number) => Vec3,
    normal: Vec3 | ((u: number, v: number) => Vec3),
    color: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Vec3,
  ) {
    const nrmAt = typeof normal === 'function' ? normal : () => normal
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u0 = i / nu
        const u1 = (i + 1) / nu
        const v0 = j / nv
        const v1 = (j + 1) / nv
        const a = p(u0, v0)
        const b = p(u1, v0)
        const c = p(u1, v1)
        const d = p(u0, v1)
        const na = nrmAt(u0, v0)
        const nb = nrmAt(u1, v0)
        const nc = nrmAt(u1, v1)
        const nd = nrmAt(u0, v1)
        this.tri(a, b, c, na, nb, nc, color)
        this.tri(a, c, d, na, nc, nd, color)
      }
    }
  }

  tri(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    na: Vec3,
    nb: Vec3,
    nc: Vec3,
    color: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Vec3,
  ) {
    // Wind the triangle to agree with the shading normal we were handed.
    //
    // The surface parametrisations in this file are a mix of handednesses —
    // a floor and a ceiling traced with the same (u, v) sweep have opposite
    // geometric orientations — so rather than getting the vertex order right
    // at forty call sites, derive it here once. Getting this backwards is
    // invisible in the data and fatal on screen: every affected face is simply
    // culled, and the room renders as nothing at all.
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    const agree = fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2])

    const verts: Vec3[] = agree < 0 ? [a, c, b] : [a, b, c]
    const norms: Vec3[] = agree < 0 ? [na, nc, nb] : [na, nb, nc]
    for (let k = 0; k < 3; k++) {
      const v = verts[k]
      const n = norms[k]
      this.pos.push(v[0], v[1], v[2])
      this.nrm.push(n[0], n[1], n[2])
      const rgb = color(v[0], v[1], v[2], n[0], n[1], n[2])
      this.col.push(rgb[0], rgb[1], rgb[2])
    }
  }

  /** Axis-aligned box, all six faces outward. */
  box(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    color: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Vec3,
    sub = 1,
  ) {
    const faces: { n: Vec3; o: Vec3; u: Vec3; v: Vec3 }[] = [
      { n: [1, 0, 0], o: [hx, -hy, hz], u: [0, 0, -2 * hz], v: [0, 2 * hy, 0] },
      { n: [-1, 0, 0], o: [-hx, -hy, -hz], u: [0, 0, 2 * hz], v: [0, 2 * hy, 0] },
      { n: [0, 1, 0], o: [-hx, hy, hz], u: [2 * hx, 0, 0], v: [0, 0, -2 * hz] },
      { n: [0, -1, 0], o: [-hx, -hy, -hz], u: [2 * hx, 0, 0], v: [0, 0, 2 * hz] },
      { n: [0, 0, 1], o: [-hx, -hy, hz], u: [2 * hx, 0, 0], v: [0, 2 * hy, 0] },
      { n: [0, 0, -1], o: [hx, -hy, -hz], u: [-2 * hx, 0, 0], v: [0, 2 * hy, 0] },
    ]
    for (const f of faces) {
      this.surface(
        sub,
        sub,
        (u, v) => [
          cx + f.o[0] + f.u[0] * u + f.v[0] * v,
          cy + f.o[1] + f.u[1] * u + f.v[1] * v,
          cz + f.o[2] + f.u[2] * u + f.v[2] * v,
        ],
        f.n,
        color,
      )
    }
  }

  /** Vertical cylinder, optionally fluted (a column). */
  cylinder(
    cx: number,
    cz: number,
    y0: number,
    y1: number,
    radius: number,
    segments: number,
    color: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Vec3,
    flutes = 0,
    rows = 6,
  ) {
    const rAt = (a: number) => (flutes > 0 ? radius * (1 - 0.045 * (0.5 - 0.5 * Math.cos(a * flutes))) : radius)
    this.surface(
      segments,
      rows,
      (u, v) => {
        const a = u * Math.PI * 2
        const r = rAt(a)
        return [cx + Math.cos(a) * r, y0 + (y1 - y0) * v, cz + Math.sin(a) * r]
      },
      (u) => {
        const a = u * Math.PI * 2
        return [Math.cos(a), 0, Math.sin(a)]
      },
      color,
    )
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    return g
  }
}

/** Convert a 0xRRGGBB literal into linear-space RGB for vertex colours. */
export function linearRGB(hex: number): Vec3 {
  const c = new THREE.Color(hex)
  c.convertSRGBToLinear()
  return [c.r, c.g, c.b]
}
