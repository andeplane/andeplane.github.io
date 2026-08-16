// The tower registry: every tower is pure data here — stats, fields it
// splats, active behaviors, palette metadata, unlock level. Adding a tower
// means adding an entry (plus a sprite in public/sprites/); no engine,
// splat, palette, or menu code should ever switch on a tower id.
//
// Two mechanics families cover everything:
//  - FIELD towers continuously splat static per-cell fields the sim samples:
//    damage (neutralizer), body force (impeller/vortex), drag (frost),
//    sonar coverage (sonar).
//  - ZAP towers act discretely: the CPU picks targets from the enemy
//    readback on a cooldown and stamps transient damage into the zap field
//    (arc chains, sniper bolts, mortar shells), which also drives the
//    overlay's lightning/splash effects.

export type TowerId =
  | 'neutralizer'
  | 'impeller'
  | 'vortex'
  | 'frost'
  | 'mortar'
  | 'arc'
  | 'sonar'
  | 'sniper'

export interface ZapSpec {
  kind: 'chain' | 'snipe' | 'mortar'
  /** Ticks between shots. */
  cooldown: number
  /** HP removed per hit (before towerDamage scaling — raw field units). */
  damage: number
  /** Max distance to the FIRST target (Infinity for snipers). */
  range: number
  /** chain: number of extra jumps after the first hit. */
  chain?: number
  /** chain: max jump distance between spores. */
  chainRange?: number
  /** mortar: blast radius (cells) — every spore inside is hit. */
  blast?: number
}

export interface TowerDef {
  id: TowerId
  name: string
  cost: number
  /** Ring/effect radius in sim cells (targeting range for zap towers). */
  radius: number
  /** One-liner for the build palette hover card and unlock toast. */
  desc: string
  /** Palette accent + overlay effect color. */
  color: string
  /** Sprite basename under public/sprites/ (no extension). */
  sprite: string
  /** Drag-to-aim at placement (direction matters). */
  aimable?: boolean
  /** Continuous kill field rate at center (falls off to the ring edge). */
  damageRate?: number
  /** Static body force on the water. */
  force?: { kind: 'directed' | 'vortex'; strength: number }
  /** Velocity damping factor at center (0..1) — thickens the water. */
  drag?: number
  /** Marks sonar coverage: reveals phantoms and lets towers hit them. */
  sonar?: boolean
  zap?: ZapSpec
  /** First level (1-based) whose palette offers this tower. */
  unlockLevel: number
}

export const TOWER_DEFS: Record<TowerId, TowerDef> = {
  neutralizer: {
    id: 'neutralizer',
    name: 'Neutralizer',
    cost: 40,
    radius: 16,
    desc: 'Beams and kills spores inside its ring. Your bread-and-butter income.',
    color: '#7dd8ff',
    sprite: 'neutralizer',
    damageRate: 0.09,
    unlockLevel: 1,
  },
  impeller: {
    id: 'impeller',
    name: 'Impeller',
    cost: 30,
    radius: 11,
    desc: 'A pump that pushes the water itself — steer spores, slow a channel. Drag to aim.',
    color: '#5eead4',
    sprite: 'impeller',
    aimable: true,
    force: { kind: 'directed', strength: 0.0045 },
    unlockLevel: 1,
  },
  vortex: {
    id: 'vortex',
    name: 'Vortex',
    cost: 35,
    radius: 13,
    desc: 'Spins a whirlpool — spores caught in it circle instead of passing.',
    color: '#a78bfa',
    sprite: 'vortex',
    force: { kind: 'vortex', strength: 0.005 },
    unlockLevel: 2,
  },
  frost: {
    id: 'frost',
    name: 'Congealer',
    cost: 45,
    radius: 14,
    desc: 'Thickens the water in its ring — everything crawls, and downstream walls rest.',
    color: '#bfe3ff',
    sprite: 'frost',
    drag: 0.3,
    unlockLevel: 3,
  },
  mortar: {
    id: 'mortar',
    name: 'Depth Charge',
    cost: 60,
    radius: 44,
    desc: 'Lobs a charge at the densest cluster — big blast, long reload.',
    color: '#fdba74',
    sprite: 'mortar',
    zap: { kind: 'mortar', cooldown: 260, damage: 2.6, range: 44, blast: 11 },
    unlockLevel: 4,
  },
  arc: {
    id: 'arc',
    name: 'Arc Coil',
    cost: 70,
    radius: 22,
    desc: 'Water conducts: hits one spore, chains to the next four.',
    color: '#e9d5ff',
    sprite: 'arc',
    zap: { kind: 'chain', cooldown: 80, damage: 1.6, range: 24, chain: 4, chainRange: 16 },
    unlockLevel: 5,
  },
  sonar: {
    id: 'sonar',
    name: 'Sonar',
    cost: 25,
    radius: 34,
    desc: 'Pings its ring — phantoms are revealed (and killable) only inside sonar.',
    color: '#fcd34d',
    sprite: 'sonar',
    sonar: true,
    unlockLevel: 6,
  },
  // (sonar radius is deliberately generous — one dish must blanket a whole
  // kill corridor or phantoms are unplayable to defend against)
  sniper: {
    id: 'sniper',
    name: 'Harpoon',
    cost: 65,
    radius: 999,
    desc: 'Unlimited range, slow, hits the spore closest to your outlet.',
    color: '#fda4af',
    sprite: 'sniper',
    zap: { kind: 'snipe', cooldown: 300, damage: 3.5, range: Infinity },
    unlockLevel: 7,
  },
}

export const TOWER_IDS = Object.keys(TOWER_DEFS) as TowerId[]

/** Towers available on a given level (1-based): everything unlocked so far. */
export function towersForLevel(levelNum: number): TowerDef[] {
  return TOWER_IDS.map((id) => TOWER_DEFS[id]).filter((d) => d.unlockLevel <= levelNum)
}

/** Towers INTRODUCED by a given level (drives the "new tower" toast). */
export function towersUnlockedAt(levelNum: number): TowerDef[] {
  return TOWER_IDS.map((id) => TOWER_DEFS[id]).filter((d) => d.unlockLevel === levelNum)
}
