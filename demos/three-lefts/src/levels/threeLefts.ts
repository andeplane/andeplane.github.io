import type { CellSpec, LevelSpec } from '../world/types'

/**
 * Level 1 — Three Lefts.
 *
 * The teaching level. Two rings of rooms with opposite angle defect:
 *
 *   west wing   3 rooms × 90° = 270° of turning   δ = +90°  (deficit)
 *   east wing   5 rooms × 90° = 450° of turning   δ = −90°  (excess)
 *
 * Every ring room is entered on its south wall and left by its west wall, so
 * each one is a single left turn. Close the ring and the arithmetic is the
 * whole design: three lefts brings you home, and five are needed to do the
 * same thing on the other side of the house.
 *
 * The objective is visible from the first minute and unreachable for most of
 * the level: a lantern in a shrine you can see through three separate grilles,
 * with no door on any of them. The way in is through the room the east wing
 * has room for and Euclidean space does not.
 */

const ringRoom = (
  id: string,
  style: CellSpec['style'],
  extras: Partial<CellSpec> = {},
): CellSpec => ({
  id,
  size: [6, 3.0, 6],
  style,
  doors: [
    { id: 's', wall: 'S', offset: 1.4 },
    { id: 'w', wall: 'W', offset: -1.0 },
    ...(extras.doors ?? []),
  ],
  props: extras.props ?? [],
  light: extras.light ?? { ambient: 0.8, skyColor: 0xa8bacb, groundColor: 0x584330, key: { dir: [0.35, 0.88, 0.32], intensity: 1.05 } },
  label: extras.label,
})

export const threeLefts: LevelSpec = {
  id: 'three-lefts',
  title: 'Three Lefts',
  tagline: 'The house is honest. You are not.',
  blurb:
    'A manor with two wings. In one, three left turns bring you back to where you started. In the other, four are not enough. Nothing looks wrong, and that is the problem.',
  hint: 'Turn left. Keep turning left. Count.',
  objective: 'Reach the lantern in the shrine.',
  goals: [{ cell: 'shrine', message: 'The lantern was never far. It simply had no door.' }],
  outro: 'The lantern was never far. It simply had no door.',

  cells: [
    {
      id: 'hall',
      size: [13, 3.6, 9],
      style: 'hall',
      label: 'Great Hall',
      doors: [
        { id: 'west', wall: 'W', offset: 0 },
        { id: 'east', wall: 'E', offset: 0 },
      ],
      props: [
        { kind: 'window', wall: 'N', offset: -3.6, width: 1.3, height: 2.1, sill: 0.9 },
        { kind: 'window', wall: 'N', offset: 0, width: 1.3, height: 2.1, sill: 0.9 },
        { kind: 'window', wall: 'N', offset: 3.6, width: 1.3, height: 2.1, sill: 0.9 },
        { kind: 'column', x: -3.4, z: -1.4 },
        { kind: 'column', x: 3.4, z: -1.4 },
        { kind: 'lamp', x: -4.4, z: 2.4, y: 2.6, color: 0xffc07a, intensity: 11 },
        { kind: 'lamp', x: 4.4, z: 2.4, y: 2.6, color: 0xffc07a, intensity: 11 },
        { kind: 'rug', x: 0, z: 1.6, w: 6.5, d: 4.2, color: 0x6d2f30 },
        { kind: 'painting', wall: 'S', offset: -3.2, color: 0x24352b },
        { kind: 'painting', wall: 'S', offset: 0, color: 0x3a2a22, w: 1.3, h: 1.0 },
        { kind: 'painting', wall: 'S', offset: 3.2, color: 0x1f2c38 },
        { kind: 'bookshelf', wall: 'S', offset: -5.2, width: 2.2 },
      ],
      light: { ambient: 0.62, skyColor: 0xc4d6e8, groundColor: 0x4a3624 },
    },

    // --- west wing: 3 rooms, deficit +90° --------------------------------
    ringRoom('w1', 'green', {
      label: 'West I — the rug',
      doors: [
        { id: 'n', wall: 'N', offset: 0 },
        { id: 'g', wall: 'E', offset: 0, kind: 'grille' },
      ],
      props: [
        { kind: 'rug', x: 0.2, z: 0.2, w: 3.2, d: 3.2, color: 0x53303a },
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffbf7a, intensity: 9 },
      ],
    }),
    ringRoom('w2', 'green', {
      label: 'West II — the crates',
      doors: [{ id: 'g', wall: 'E', offset: 0, kind: 'grille' }],
      props: [
        { kind: 'crate', x: -2.0, z: -1.9, size: 0.75 },
        { kind: 'crate', x: -1.3, z: -2.1, size: 0.55, height: 0.5 },
        { kind: 'crate', x: -1.9, z: -1.2, size: 0.6, height: 1.0 },
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffc98a, intensity: 9 },
      ],
    }),
    ringRoom('w3', 'green', {
      label: 'West III — the books',
      doors: [{ id: 'g', wall: 'E', offset: 0, kind: 'grille' }],
      props: [
        { kind: 'bookshelf', wall: 'N', offset: 0, width: 3.4 },
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffb268, intensity: 9 },
        { kind: 'painting', wall: 'E', offset: 2.0, color: 0x2a1f2e },
      ],
    }),

    // --- the shrine: seen from three grilles, entered from none of them ---
    {
      id: 'shrine',
      size: [3.0, 3.4, 3.0],
      style: 'chapel',
      label: 'The Shrine',
      doors: [
        { id: 'a', wall: 'N', offset: 0, kind: 'grille' },
        { id: 'b', wall: 'E', offset: 0, kind: 'grille' },
        { id: 'c', wall: 'S', offset: 0, kind: 'grille' },
        { id: 'in', wall: 'W', offset: 0 },
      ],
      props: [
        { kind: 'pedestal', x: 0, z: 0, item: 'lantern', label: 'the lantern' },
      ],
      light: { ambient: 0.3, skyColor: 0x8a97a8, groundColor: 0x2b2118 },
    },

    // --- east wing: 5 rooms, excess −90° ---------------------------------
    ringRoom('e1', 'oxblood', {
      label: 'East I — the hall door',
      doors: [{ id: 'n', wall: 'N', offset: 0 }],
      props: [
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffb271, intensity: 9 },
        { kind: 'rug', x: 0, z: 0, w: 3.0, d: 3.0, color: 0x46262a },
      ],
    }),
    ringRoom('e2', 'oxblood', {
      label: 'East II — the tall painting',
      props: [
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'painting', wall: 'N', offset: 0, w: 1.1, h: 1.9, y: 1.6, color: 0x1d2a33 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffc07a, intensity: 9 },
      ],
    }),
    ringRoom('e3', 'oxblood', {
      label: 'East III — the window',
      props: [
        { kind: 'window', wall: 'E', offset: 0, width: 1.4, height: 1.8, sill: 0.85, color: 0x8fb6e0 },
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffb271, intensity: 7 },
      ],
    }),
    ringRoom('e4', 'oxblood', {
      label: 'East IV — the shrine door',
      doors: [{ id: 'g', wall: 'E', offset: 0 }],
      props: [
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'lamp', x: 1.4, z: 1.7, y: 2.4, color: 0xffd9a8, intensity: 13 },
        { kind: 'crate', x: -2.1, z: -2.0, size: 0.7 },
      ],
    }),
    ringRoom('e5', 'oxblood', {
      label: 'East V — the room with no outside',
      props: [
        { kind: 'column', x: -1.9, z: 1.9 },
        { kind: 'bookshelf', wall: 'N', offset: -1.0, width: 2.4 },
        { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xff9f5e, intensity: 8 },
        { kind: 'painting', wall: 'E', offset: 1.4, color: 0x2c1c1c },
      ],
    }),
  ],

  portals: [
    { a: 'hall.west', b: 'w1.n' },
    { a: 'hall.east', b: 'e1.n' },

    // West ring: three rooms, three left turns, closed.
    { a: 'w1.w', b: 'w2.s' },
    { a: 'w2.w', b: 'w3.s' },
    { a: 'w3.w', b: 'w1.s' },

    // Three windows onto one shrine.
    { a: 'w1.g', b: 'shrine.a' },
    { a: 'w2.g', b: 'shrine.b' },
    { a: 'w3.g', b: 'shrine.c' },

    // East ring: five rooms, five left turns, closed.
    { a: 'e1.w', b: 'e2.s' },
    { a: 'e2.w', b: 'e3.s' },
    { a: 'e3.w', b: 'e4.s' },
    { a: 'e4.w', b: 'e5.s' },
    { a: 'e5.w', b: 'e1.s' },

    // The only door into the shrine, in the room the excess makes room for.
    { a: 'e4.g', b: 'shrine.in' },
  ],

  spawn: { cell: 'hall', pos: [0, 2.6], yaw: 180 },

  assertions: [
    { name: 'west ring is three lefts (deficit +90°)', cell: 'w1', doors: ['w', 'w', 'w'], expectYawDeg: 90 },
    {
      name: 'east ring is five lefts (excess −90°)',
      cell: 'e1',
      doors: ['w', 'w', 'w', 'w', 'w'],
      expectYawDeg: -90,
    },
    {
      name: 'four lefts in the east wing lands in a fifth room',
      cell: 'e1',
      doors: ['w', 'w', 'w', 'w'],
      expectEndCell: 'e5',
      expectYawDeg: 0,
    },
    {
      name: 'hall round trip is ordinary',
      cell: 'hall',
      doors: ['west', 'n'],
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
  ],
}
