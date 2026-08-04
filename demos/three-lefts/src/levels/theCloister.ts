import type { CellLight, CellSpec, DoorSpec, LevelSpec, Prop, StyleName } from '../world/types'

/**
 * Level 4 — The Cloister.
 *
 * A ring of **eight** rooms, each one a single left turn. 8 × 90° = 720°, so:
 *
 *     four lefts   → you are in r5, and the holonomy is exactly the identity
 *     eight lefts  → you are home
 *
 * That first line is the level. In the first three levels the notebook is the
 * tell — it spirals, it overlaps, it leaves a wedge, and a careful player can
 * see the house failing to close. Here the notebook is **perfect**. Four lefts
 * draw a flawless square, the dead reckoning says *you are exactly where you
 * began*, and you are one room short of it.
 *
 * A map that is merely wrong can be corrected. A map that is confidently,
 * consistently, provably wrong cannot, and the only instrument left is chalk.
 * That is what this level exists to teach, because levels 5 to 8 assume it.
 *
 * The house is built as a genuine double cover of an ordinary five-room house:
 * two identical halls, four identical pairs of rooms, two identical vaults.
 * Every single thing the player sees, they will see twice.
 */

const RING_LIGHT: CellLight = {
  ambient: 0.8,
  skyColor: 0xa8bacb,
  groundColor: 0x584330,
  key: { dir: [0.35, 0.88, 0.32], intensity: 1.02 },
}

/** One of the four repeated room types. Both copies are built from this. */
interface RoomType {
  style: StyleName
  label: string
  props: Prop[]
}

const TYPES: RoomType[] = [
  {
    style: 'green',
    label: 'The room with the rug',
    props: [
      { kind: 'rug', x: 0.2, z: 0.2, w: 3.2, d: 3.2, color: 0x53303a },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffbf7a, intensity: 9 },
      { kind: 'painting', wall: 'E', offset: 1.6, color: 0x25352c },
    ],
  },
  {
    style: 'oxblood',
    label: 'The room with the crates',
    props: [
      { kind: 'crate', x: -2.0, z: -1.9, size: 0.75 },
      { kind: 'crate', x: -1.3, z: -2.1, size: 0.55, height: 0.5 },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffc98a, intensity: 9 },
    ],
  },
  {
    style: 'gallery',
    label: 'The room with the vault door',
    props: [
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'column', x: 1.9, z: 1.9 },
      { kind: 'lamp', x: 0, z: -1.8, y: 2.5, color: 0xffd2a0, intensity: 11 },
    ],
  },
  {
    style: 'attic',
    label: 'The room with the books',
    props: [
      { kind: 'bookshelf', wall: 'N', offset: 0, width: 3.4 },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffb268, intensity: 9 },
    ],
  },
]

/**
 * Every ring room is entered on its south wall and left by its west wall — one
 * left turn, the same idiom as Three Lefts. `i` runs 0..7 and the type repeats
 * every four, which is exactly what makes the fifth room look like the first.
 */
const ringRoom = (i: number, extraDoors: DoorSpec[] = []): CellSpec => {
  const type = TYPES[i % TYPES.length]
  return {
    id: `r${i + 1}`,
    size: [6, 3.0, 6],
    style: type.style,
    label: type.label,
    doors: [{ id: 's', wall: 'S', offset: 1.4 }, { id: 'w', wall: 'W', offset: -1.0 }, ...extraDoors],
    props: type.props,
    light: RING_LIGHT,
  }
}

const hall = (id: string): CellSpec => ({
  id,
  size: [9, 3.6, 7],
  style: 'hall',
  label: 'The Hall',
  doors: [
    { id: 'ring', wall: 'N', offset: -1.6 },
    { id: 'peek', wall: 'E', offset: 0, kind: 'grille' },
  ],
  props: [
    { kind: 'window', wall: 'S', offset: -2.6, width: 1.3, height: 2.1, sill: 0.9 },
    { kind: 'window', wall: 'S', offset: 2.6, width: 1.3, height: 2.1, sill: 0.9 },
    { kind: 'lamp', x: -3.0, z: 1.8, y: 2.7, color: 0xffc07a, intensity: 11 },
    { kind: 'lamp', x: 3.0, z: 1.8, y: 2.7, color: 0xffc07a, intensity: 11 },
    { kind: 'rug', x: 0, z: 0.4, w: 5.0, d: 3.4, color: 0x6d2f30 },
    { kind: 'painting', wall: 'W', offset: 0, w: 1.3, h: 1.0, color: 0x3a2a22 },
  ],
  light: { ambient: 0.62, skyColor: 0xc4d6e8, groundColor: 0x4a3624 },
})

const vault = (id: string): CellSpec => ({
  id,
  size: [3.4, 3.4, 3.4],
  style: 'chapel',
  label: 'The Vault',
  doors: [
    { id: 'in', wall: 'W', offset: 0 },
    { id: 'peek', wall: 'N', offset: 0, kind: 'grille' },
  ],
  props: [{ kind: 'pedestal', x: 0, z: 0, item: 'lantern', label: 'a lantern' }],
  light: { ambient: 0.32, skyColor: 0x8a97a8, groundColor: 0x2b2118 },
})

export const theCloister: LevelSpec = {
  id: 'the-cloister',
  title: 'The Cloister',
  tagline: 'Your map is perfect. Your map is wrong.',
  blurb:
    'Eight rooms in a ring, and four left turns bring you back to a hall you recognise, having drawn a flawless square. It is not the hall you left. Nothing here will help you except the chalk in your pocket.',
  hint: 'Four lefts is a square. Chalk the door before you believe it.',
  objective: 'Record both lanterns.',
  outro:
    'Two halls, two vaults, and one house folded over itself. The square your notebook drew was correct in every particular, and described somewhere you had never been.',

  cells: [
    hall('hallA'),
    hall('hallB'),
    ringRoom(0, [{ id: 'hall', wall: 'N', offset: -1.6 }]),
    ringRoom(1),
    ringRoom(2, [{ id: 'vault', wall: 'E', offset: 0 }]),
    ringRoom(3),
    ringRoom(4, [{ id: 'hall', wall: 'N', offset: -1.6 }]),
    ringRoom(5),
    ringRoom(6, [{ id: 'vault', wall: 'E', offset: 0 }]),
    ringRoom(7),
    vault('vaultA'),
    vault('vaultB'),
  ],

  portals: [
    // The ring: eight rooms, eight left turns, closed.
    { a: 'r1.w', b: 'r2.s' },
    { a: 'r2.w', b: 'r3.s' },
    { a: 'r3.w', b: 'r4.s' },
    { a: 'r4.w', b: 'r5.s' },
    { a: 'r5.w', b: 'r6.s' },
    { a: 'r6.w', b: 'r7.s' },
    { a: 'r7.w', b: 'r8.s' },
    { a: 'r8.w', b: 'r1.s' },

    // Two halls, one per sheet. They are the same room in every respect
    // except which one you are standing in.
    { a: 'hallA.ring', b: 'r1.hall' },
    { a: 'hallB.ring', b: 'r5.hall' },

    { a: 'r3.vault', b: 'vaultA.in' },
    { a: 'r7.vault', b: 'vaultB.in' },

    // Each hall's grille looks into the vault belonging to the *other* sheet.
    // From the doorstep you can see a lantern, and walking to it the obvious
    // way gets you the other one.
    { a: 'hallA.peek', b: 'vaultB.peek' },
    { a: 'hallB.peek', b: 'vaultA.peek' },
  ],

  spawn: { cell: 'hallA', pos: [0, 1.6], yaw: 0 },

  goals: [
    { cell: 'vaultA', message: 'One lantern recorded. There is another, and it is not behind you.' },
    { cell: 'vaultB', message: 'Both. They were never the same vault.' },
  ],

  assertions: [
    {
      name: 'four lefts: a perfect square, and the wrong room',
      cell: 'r1',
      doors: ['w', 'w', 'w', 'w'],
      expectEndCell: 'r5',
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
    {
      name: 'eight lefts: home',
      cell: 'r1',
      doors: ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'w'],
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
    { name: 'hall round trip is ordinary', cell: 'hallA', doors: ['ring', 'hall'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },
  ],
}
