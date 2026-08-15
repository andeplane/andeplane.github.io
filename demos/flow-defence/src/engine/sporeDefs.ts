// The spore registry: every enemy type is pure data — movement personality,
// hp/bounty scaling, death behavior, visibility, toast copy. The GPU kernel
// receives these as per-type parameter tables indexed by typeIndex, so adding
// a spore means adding an entry here (the kernel code never changes).

export type SporeId = 'standard' | 'swimmer' | 'sinker' | 'splitter' | 'phantom'

export interface SporeDef {
  id: SporeId
  /** Stable index into the GPU per-type parameter tables (never reorder). */
  typeIndex: number
  name: string
  /** One-liner for the "new spore" toast. */
  desc: string
  /** Multiplies the wave's hp. */
  hpMul: number
  /** Gold paid per TOWER kill of this type. */
  bounty: number
  /** Fraction of local fluid velocity ridden (1 = passive drifter). */
  carry: number
  /** Constant downstream swim bias (lattice units). */
  swim: number
  /** Velocity smoothing toward the flow — low = heavy/inertial. */
  steer: number
  /** Glow stamp multiplier (0 = leaves no trail — phantoms). */
  glowMul: number
  /** Overlay dot radius multiplier. */
  sizeMul: number
  /** On death, burst into this many children of `child` type (recoil-flung). */
  split?: { count: number; child: SporeId; hpMul: number }
  /** Invisible outside sonar coverage: no dot, no trail, no tower damage. */
  invisible?: boolean
  /** First level (1-based) that fields this spore (drives the toast). */
  unlockLevel: number
}

export const SPORE_DEFS: Record<SporeId, SporeDef> = {
  standard: {
    id: 'standard',
    typeIndex: 0,
    name: 'Spore',
    desc: 'Rides the current toward your outlet. Every wall you draw re-routes it.',
    hpMul: 1,
    bounty: 3,
    carry: 1,
    swim: 0.018,
    steer: 0.3,
    glowMul: 1,
    sizeMul: 1,
    unlockLevel: 1,
  },
  swimmer: {
    id: 'swimmer',
    typeIndex: 1,
    name: 'Darter',
    desc: 'Actively swims for the outlet and cuts corners the current would not. Fragile.',
    hpMul: 0.6,
    bounty: 4,
    carry: 0.9,
    swim: 0.05,
    steer: 0.45,
    glowMul: 0.8,
    sizeMul: 0.8,
    unlockLevel: 2,
  },
  sinker: {
    id: 'sinker',
    typeIndex: 2,
    name: 'Barnacle',
    desc: 'Heavy and armored: shrugs off jets and pumps, soaks beams. Bring sustained fire.',
    hpMul: 3.2,
    bounty: 9,
    carry: 0.55,
    swim: 0.01,
    steer: 0.08,
    glowMul: 1.6,
    sizeMul: 1.7,
    unlockLevel: 3,
  },
  splitter: {
    id: 'splitter',
    typeIndex: 3,
    name: 'Blastocyst',
    desc: 'Bursts on death into live children flung outward — mind where you pop it.',
    hpMul: 1.5,
    bounty: 5,
    carry: 1,
    swim: 0.015,
    steer: 0.25,
    glowMul: 1.2,
    sizeMul: 1.3,
    split: { count: 3, child: 'standard', hpMul: 0.4 },
    unlockLevel: 4,
  },
  phantom: {
    id: 'phantom',
    typeIndex: 4,
    name: 'Phantom',
    desc: 'Invisible and untouchable outside sonar coverage — only its wake betrays it.',
    hpMul: 0.9,
    bounty: 6,
    carry: 1,
    swim: 0.022,
    steer: 0.3,
    glowMul: 0,
    sizeMul: 1,
    invisible: true,
    unlockLevel: 6,
  },
}

export const SPORE_IDS = Object.keys(SPORE_DEFS) as SporeId[]

/** Defs ordered by typeIndex — the GPU parameter-table order. */
export const SPORES_BY_INDEX: SporeDef[] = SPORE_IDS.map((id) => SPORE_DEFS[id]).sort(
  (a, b) => a.typeIndex - b.typeIndex,
)

export function sporesUnlockedAt(levelNum: number): SporeDef[] {
  return SPORES_BY_INDEX.filter((d) => d.unlockLevel === levelNum)
}
