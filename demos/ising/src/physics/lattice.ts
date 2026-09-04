/**
 * Lattice geometries.
 *
 * All three live on the same L×L index grid; a geometry is just a neighbor stencil, a
 * coloring that partitions the grid into independent update sets, and a basis that maps
 * indices to positions in the plane for honest rendering.
 *
 * The coloring is the load-bearing part. Cells of one color must never be neighbors,
 * or two threads flip both ends of a bond in the same pass and detailed balance is
 * gone — silently wrong physics, not a crash. The square and honeycomb lattices are
 * bipartite, so the checkerboard parity (x+y) mod 2 works. The triangular lattice is
 * NOT bipartite (its elementary triangles are odd cycles): it needs (x+y) mod 3, which
 * separates all six neighbors because the offsets (1,0), (0,1), (1,1) each change
 * (x+y) mod 3. Both colorings wrap consistently on the torus only when L ≡ 0 mod 6,
 * which is why the size ladder avoids powers of two.
 */

export type GeometryKey = 'square' | 'triangular' | 'honeycomb';

export interface Geometry {
  key: GeometryKey;
  label: string;
  /** Independent update passes per sweep. */
  colors: number;
  /** Coordination number (neighbors per site). */
  z: number;
  /** Exact critical temperature in units of J/k_B. */
  Tc: number;
  /** Render-shader geometry id. */
  geomId: number;
  /**
   * WGSL statements computing `nsum: i32`, the sum of the site's neighbor spins.
   * In scope: x, y (u32 site coords), L (u32), xp/xm/yp/ym (wrapped x±1, y±1) and
   * spin_at(x, y) -> i32 returning ±1.
   */
  wgslNeighborSum: string;
  /**
   * WGSL statements computing `bsum: i32`, the sum of s_i·s_j over the site's
   * "forward" bonds only, so that summing bsum over all sites counts each bond once.
   */
  wgslBondSum: string;
  /** Forward bonds per site (average), for sanity checks: z / 2. */
  bondsPerSite: number;
}

const SQUARE_NEIGHBORS = /* wgsl */ `
  var nsum: i32 = spin_at(xp, y) + spin_at(xm, y) + spin_at(x, yp) + spin_at(x, ym);
`;

const SQUARE_BONDS = /* wgsl */ `
  let s = spin_at(x, y);
  var bsum: i32 = s * (spin_at(xp, y) + spin_at(x, yp));
`;

// Triangular = square grid plus the (+1,+1)/(−1,−1) diagonal: the standard oblique
// embedding with basis vectors at 60°, coordination 6.
const TRI_NEIGHBORS = /* wgsl */ `
  var nsum: i32 = spin_at(xp, y) + spin_at(xm, y) + spin_at(x, yp) + spin_at(x, ym)
                + spin_at(xp, yp) + spin_at(xm, ym);
`;

const TRI_BONDS = /* wgsl */ `
  let s = spin_at(x, y);
  var bsum: i32 = s * (spin_at(xp, y) + spin_at(x, yp) + spin_at(xp, yp));
`;

// Honeycomb in the brick-wall representation: east + west, plus one vertical neighbor
// whose direction alternates with sublattice parity. Coordination 3, still bipartite.
const HEX_NEIGHBORS = /* wgsl */ `
  let vy = select(ym, yp, ((x + y) & 1u) == 0u);
  var nsum: i32 = spin_at(xp, y) + spin_at(xm, y) + spin_at(x, vy);
`;

// Forward bonds: east always; the vertical bond is owned by its (x+y)-even end.
const HEX_BONDS = /* wgsl */ `
  let s = spin_at(x, y);
  var bsum: i32 = s * spin_at(xp, y);
  if (((x + y) & 1u) == 0u) {
    bsum += s * spin_at(x, yp);
  }
`;

export const GEOMETRIES: Record<GeometryKey, Geometry> = {
  square: {
    key: 'square',
    label: 'Square',
    colors: 2,
    z: 4,
    Tc: 2 / Math.log(1 + Math.SQRT2), // 2.269185…
    geomId: 0,
    wgslNeighborSum: SQUARE_NEIGHBORS,
    wgslBondSum: SQUARE_BONDS,
    bondsPerSite: 2,
  },
  triangular: {
    key: 'triangular',
    label: 'Triangular',
    colors: 3,
    z: 6,
    Tc: 4 / Math.log(3), // 3.640957…
    geomId: 1,
    wgslNeighborSum: TRI_NEIGHBORS,
    wgslBondSum: TRI_BONDS,
    bondsPerSite: 3,
  },
  honeycomb: {
    key: 'honeycomb',
    label: 'Honeycomb',
    colors: 2,
    z: 3,
    Tc: 2 / Math.log(2 + Math.sqrt(3)), // 1.518651…
    geomId: 2,
    wgslNeighborSum: HEX_NEIGHBORS,
    wgslBondSum: HEX_BONDS,
    bondsPerSite: 1.5,
  },
};

/**
 * Site position in the plane, in units of the lattice spacing. Must match the WGSL in
 * render.wgsl.ts and the brush math in pointer.ts.
 */
export function sitePosition(g: GeometryKey, i: number, j: number): [number, number] {
  switch (g) {
    case 'square':
      return [i, j];
    case 'triangular':
      // Basis a1 = (1, 0), a2 = (1/2, √3/2).
      return [i + 0.5 * j, (Math.sqrt(3) / 2) * j];
    case 'honeycomb': {
      // Brick-wall embedding: every neighbor pair sits at distance 1.
      const x = i * (Math.sqrt(3) / 2);
      const y = j * 1.5 + ((i + j) % 2 === 0 ? 0.25 : -0.25);
      return [x, y];
    }
  }
}

/** Lattice sizes: all ≡ 0 mod 6 so both colorings wrap on the torus. */
export const SIZES = [510, 1020, 2046, 4092] as const;

export function spinCountLabel(L: number): string {
  const n = L * L;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`;
}
