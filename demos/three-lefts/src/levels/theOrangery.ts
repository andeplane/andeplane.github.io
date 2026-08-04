import type { LevelSpec, Prop } from '../world/types'

/**
 * Level 5 — The Orangery.
 *
 * One room. Its doorways lead back into it.
 *
 * Not a torus: the engine glues *doorways*, not walls (SPEC §3.3), so nothing
 * wraps. You walk out of one opening and in through another, and the other one
 * happens to be in the same room. The renderer draws the cell inside itself to
 * depth 3, so every doorway shows the same colonnade receding forever.
 *
 * The mathematics is the first non-abelian house in the game. Two loops that
 * each close, and whose order of travel matters:
 *
 *     four norths          the identity — exactly, on the nose
 *     N then S then N then S   *not* the identity
 *
 * Levels 1 to 4 are all about a single loop failing to close. This one is about
 * two loops that both close and still do not commute, which is a strictly
 * harder thing to hold in your head and impossible to draw.
 *
 * A colonnade cuts the floor into three regions with no walkable route between
 * them inside the room. Getting from one to another means leaving through a
 * wall. Since all three regions are the same room, they look identical, and
 * chalk is the only way to know which one you are standing in.
 */

/** Dense enough that a person cannot pass: gap 0.35 m against a 0.6 m body. */
const COLUMN_R = 0.4
const SPACING = 1.15

/**
 * A row of columns from one point to another, spaced to seal.
 *
 * Stepping by a fixed increment leaves a hole: `x += 1.15` from −7.4 stops at
 * 6.4 and hands the player a 1.2 m gap at the wall, which is a doorway with
 * extra steps. Dividing the span into equal parts always reaches both ends.
 */
function row(from: [number, number], to: [number, number]): Prop[] {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const n = Math.ceil(Math.hypot(dx, dz) / SPACING)
  const out: Prop[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push({ kind: 'column', x: from[0] + dx * t, z: from[1] + dz * t, radius: COLUMN_R })
  }
  return out
}

/** Both ends reach the wall, and the junction at the origin is shared. */
function colonnade(): Prop[] {
  return [
    ...row([-7.6, 0], [7.6, 0]), // splits north from south
    ...row([0, 0], [0, 7.6]).slice(1), // splits south-west from south-east
  ]
}

export const theOrangery: LevelSpec = {
  id: 'the-orangery',
  title: 'The Orangery',
  tagline: 'One room. Its doors lead back into it.',
  blurb:
    'A single glasshouse with four doorways, and every one of them opens onto the same glasshouse. Walk out of the north wall and you come in from the west, ninety degrees to the left, into a room you have never left. Three lanterns, three parts of one floor, and no way between them except out.',
  hint: 'Every door leads here. That does not mean every door leads to the same place.',
  objective: 'Record all three lanterns.',
  outro:
    'One cell in the graph, and you needed chalk to find your way across it. Out and back is not the same as back and out — that is the whole of it, and no drawing you can make will hold it.',

  cells: [
    {
      id: 'vestibule',
      size: [4.5, 3.2, 3.5],
      style: 'stone',
      label: 'The Vestibule',
      doors: [
        { id: 'gate', wall: 'N', offset: 0 },
        { id: 'bars', wall: 'E', offset: 0, kind: 'grille' },
      ],
      props: [
        { kind: 'lamp', x: 0, z: 0.9, y: 2.5, color: 0xffc07a, intensity: 9 },
        { kind: 'crate', x: -1.6, z: 1.0, size: 0.7 },
      ],
      light: { ambient: 0.5, skyColor: 0xa8bacb, groundColor: 0x4a4034 },
    },
    {
      id: 'orangery',
      size: [16, 5, 16],
      style: 'gallery',
      label: 'The Orangery',
      doors: [
        // North region.
        { id: 'n', wall: 'N', offset: -3 },
        { id: 'w', wall: 'W', offset: -3 },
        { id: 'gate', wall: 'N', offset: 3 },
        { id: 'bars', wall: 'E', offset: -4, kind: 'grille' },
        // South-west region.
        { id: 's1', wall: 'S', offset: -4 },
        { id: 'w2', wall: 'W', offset: 4 },
        // South-east region.
        { id: 'e', wall: 'E', offset: 4 },
        { id: 's2', wall: 'S', offset: 4 },
      ],
      props: [
        ...colonnade(),
        { kind: 'window', wall: 'N', offset: 0, width: 2.0, height: 2.6, sill: 1.2, color: 0x9fc0e4 },
        { kind: 'window', wall: 'S', offset: 0, width: 2.0, height: 2.6, sill: 1.2, color: 0x9fc0e4 },
        { kind: 'lamp', x: -5.5, z: -5.5, y: 3.6, color: 0xffc890, intensity: 16 },
        { kind: 'lamp', x: 5.5, z: -5.5, y: 3.6, color: 0xffc890, intensity: 16 },
        { kind: 'lamp', x: -5.5, z: 5.5, y: 3.6, color: 0xffc890, intensity: 16 },
        { kind: 'lamp', x: 5.5, z: 5.5, y: 3.6, color: 0xffc890, intensity: 16 },
        // One lantern in each of the three regions.
        { kind: 'pedestal', x: -5.5, z: -3.0, item: 'lantern', label: 'the north lantern' },
        { kind: 'pedestal', x: -5.5, z: 4.5, item: 'lantern', label: 'the west lantern' },
        { kind: 'pedestal', x: 5.5, z: 4.5, item: 'lantern', label: 'the east lantern' },
      ],
      light: { ambient: 0.72, skyColor: 0xc0d0de, groundColor: 0x5a4a34 },
    },
  ],

  portals: [
    { a: 'vestibule.gate', b: 'orangery.gate' },
    { a: 'vestibule.bars', b: 'orangery.bars' },

    // The room, glued to itself. Each pair joins two different regions of the
    // one floor, so the only route across the colonnade is out through a wall.
    //
    // Note which walls are paired. Gluing a north doorway to a *south* one
    // gives Δyaw = 180° + 180° − 0° = 0: a pure translation, and pure
    // translations commute, which would make the whole room abelian and the
    // level pointless. Pairing north to west gives −90°, and three rotations
    // about three different centres do not commute. The first draft of this
    // level had it the other way round and was measurably boring.
    { a: 'orangery.n', b: 'orangery.w2' },
    { a: 'orangery.w', b: 'orangery.s2' },
    { a: 'orangery.s1', b: 'orangery.e' },
  ],

  spawn: { cell: 'vestibule', pos: [0, 0.9], yaw: 0 },

  goals: [
    { cell: 'orangery', label: 'the north lantern', message: 'One. The other two are in this room, and you cannot walk to them.' },
    { cell: 'orangery', label: 'the west lantern', message: 'Two. Out of one wall and in through another.' },
    { cell: 'orangery', label: 'the east lantern', message: 'Three. One room, and it took a map.' },
  ],

  assertions: [
    // Each generator is a quarter turn, so its fourth power kills the rotation
    // and (I + R + R² + R³)·t kills the translation. Exactly, not nearly.
    { name: 'four norths is precisely nothing', cell: 'orangery', doors: ['n', 'n', 'n', 'n'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },
    { name: 'four wests is precisely nothing', cell: 'orangery', doors: ['w', 'w', 'w', 'w'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },

    // The two orders are not the same journey. This pair is the level.
    { name: 'north then west', cell: 'orangery', doors: ['n', 'w'], expectYawDeg: 180, expectTranslation: [-6.0, 0, 0] },
    { name: 'west then north', cell: 'orangery', doors: ['w', 'n'], expectYawDeg: 180, expectTranslation: [-32.88, 0, 8.0] },

    // n·w·n⁻¹·w⁻¹, with n⁻¹ = n³. A commutator of two rotations is a pure
    // translation, and here it is 28 metres of one.
    {
      name: 'the commutator is a pure translation',
      cell: 'orangery',
      doors: ['n', 'w', 'n', 'n', 'n', 'w', 'w', 'w'],
      expectYawDeg: 0,
      expectTranslation: [-26.88, 0, 8.0],
    },
  ],
}
