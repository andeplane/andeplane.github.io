import type { CellLight, CellSpec, DoorSpec, LevelSpec, Prop, StyleName } from '../world/types'

/**
 * Level 8 — The House.
 *
 * A triple cover. Twelve rooms in a ring, each one left turn:
 *
 *     four lefts    → r5,  holonomy exactly the identity
 *     eight lefts   → r9,  holonomy exactly the identity
 *     twelve lefts  → home
 *
 * The Cloister asked the player to believe a room they recognised was not the
 * room they left. This asks them to know *which of three* they are standing in,
 * and neither the eye nor the notebook can answer it. The dead reckoning closes
 * three separate times and is correct every time and useless every time. Only
 * chalk knows.
 *
 * The hall proves it by itself. Three doorways in one wall, side by side, all
 * opening onto what is plainly the same green room — and it is three rooms. A
 * player who walks in one door, chalks the floor, comes back and walks in the
 * next has the entire structure of the house in about ninety seconds. Everyone
 * else has a long evening.
 *
 * Everything in this level is symmetric under a four-room shift, and it has to
 * be. The first build hung five chambers off rooms 2, 4, 7, 10 and 12, which is
 * not a symmetric set, so the three green rooms had different
 * neighbourhoods and a player could eventually tell the sheets apart by
 * walking them. The illusion has to be airtight or there is no level: six
 * chambers off the even rooms (2, 4, 6, 8, 10, 12), which maps to itself under
 * the shift, and three grilles, one into each sheet. Now nothing distinguishes
 * the sheets at all, and chalk is the only instrument that can.
 */

const RING = 12

const RING_LIGHT: CellLight = {
  ambient: 0.78,
  skyColor: 0xa8bacb,
  groundColor: 0x584330,
  key: { dir: [0.34, 0.88, 0.32], intensity: 1.0 },
}

/** Four room types, repeating three times round the ring. */
interface RoomType {
  style: StyleName
  label: string
  props: Prop[]
}

const TYPES: RoomType[] = [
  {
    style: 'green',
    label: 'The green room',
    props: [
      { kind: 'rug', x: 0.2, z: 0.2, w: 3.2, d: 3.2, color: 0x53303a },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffbf7a, intensity: 9 },
    ],
  },
  {
    style: 'oxblood',
    label: 'The red room',
    props: [
      { kind: 'painting', wall: 'N', offset: 0, w: 1.1, h: 1.9, y: 1.6, color: 0x1d2a33 },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffc98a, intensity: 9 },
    ],
  },
  {
    style: 'gallery',
    label: 'The pale room',
    props: [
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'column', x: 1.9, z: 1.9 },
      { kind: 'lamp', x: 0, z: -1.8, y: 2.5, color: 0xffd2a0, intensity: 11 },
    ],
  },
  {
    style: 'attic',
    label: 'The book room',
    props: [
      { kind: 'bookshelf', wall: 'N', offset: 0, width: 3.4 },
      { kind: 'column', x: -1.9, z: 1.9 },
      { kind: 'lamp', x: 1.6, z: -1.6, y: 2.4, color: 0xffb268, intensity: 9 },
    ],
  },
]

const ringRoom = (i: number, extra: DoorSpec[] = []): CellSpec => {
  const type = TYPES[i % TYPES.length]
  return {
    id: `r${i + 1}`,
    size: [6, 3.0, 6],
    style: type.style,
    label: type.label,
    doors: [{ id: 's', wall: 'S', offset: 1.4 }, { id: 'w', wall: 'W', offset: -1.0 }, ...extra],
    props: type.props,
    light: RING_LIGHT,
  }
}

const chamber = (id: string, label: string, extra: DoorSpec[] = []): CellSpec => ({
  id,
  size: [3.4, 3.4, 3.4],
  style: 'chapel',
  label,
  doors: [{ id: 'in', wall: 'W', offset: 0 }, ...extra],
  props: [{ kind: 'pedestal', x: 0, z: 0, item: 'lantern', label }],
  light: { ambient: 0.33, skyColor: 0x8a97a8, groundColor: 0x2b2118 },
})

/**
 * Six chambers off the even rooms — two per sheet, and the set maps to itself
 * under a four-room shift. `near` chambers are the ones the hall can see into,
 * one per sheet, so even the view out of the back wall is three-fold symmetric.
 */
const CHAMBERS = [2, 4, 6, 8, 10, 12].map((room) => ({
  room,
  id: `ch${room}`,
  label: `lantern ${room}`,
  near: room % 4 === 2, // rooms 2, 6, 10 — the first chamber of each sheet
}))

export const theHouse: LevelSpec = {
  id: 'the-house',
  title: 'The House',
  tagline: 'Three doors. One room. Three rooms.',
  blurb:
    'Twelve rooms in a ring. Four left turns close your map, eight left turns close your map, and only twelve bring you home. There are three doorways out of the hall and they all open onto the same green room, which is three green rooms. Six lanterns, and no way to know where you are except the marks you leave.',
  hint: 'Three doors out of the hall. Chalk the floor inside each one before you go any further.',
  objective: 'Record all six lanterns.',
  outro:
    'Twelve rooms, four apparent, three times over. Your notebook closed the loop three separate times and was right on each occasion. The house was never lying — it simply has more rooms than it has appearances.',

  cells: [
    {
      id: 'hall',
      size: [12, 4, 8],
      style: 'hall',
      label: 'The Hall',
      doors: [
        // Three doorways, side by side, into what is plainly one room.
        { id: 'a', wall: 'N', offset: -3.6 },
        { id: 'b', wall: 'N', offset: 0 },
        { id: 'c', wall: 'N', offset: 3.6 },
        // One grille per sheet, so the back wall is symmetric too.
        { id: 'peek1', wall: 'S', offset: -4, kind: 'grille' },
        { id: 'peek2', wall: 'S', offset: 0, kind: 'grille' },
        { id: 'peek3', wall: 'S', offset: 4, kind: 'grille' },
      ],
      props: [
        { kind: 'window', wall: 'W', offset: 0, width: 1.3, height: 2.2, sill: 0.9 },
        { kind: 'window', wall: 'E', offset: 0, width: 1.3, height: 2.2, sill: 0.9 },
        { kind: 'lamp', x: -4.2, z: 2.2, y: 3.0, color: 0xffc07a, intensity: 13 },
        { kind: 'lamp', x: 4.2, z: 2.2, y: 3.0, color: 0xffc07a, intensity: 13 },
        { kind: 'rug', x: 0, z: 1.0, w: 7.0, d: 4.0, color: 0x6d2f30 },
      ],
      light: { ambient: 0.64, skyColor: 0xc4d6e8, groundColor: 0x4a3624 },
    },

    ...[...Array(RING).keys()].map((i) => {
      const extra: DoorSpec[] = []
      // r1, r5 and r9 are the three green rooms the hall opens onto.
      if (i === 0 || i === 4 || i === 8) extra.push({ id: 'hall', wall: 'N', offset: -1.6 })
      const ch = CHAMBERS.find((c) => c.room === i + 1)
      if (ch) extra.push({ id: 'chamber', wall: 'E', offset: 0 })
      return ringRoom(i, extra)
    }),

    ...CHAMBERS.map((c) =>
      chamber(c.id, c.label, c.near ? [{ id: 'peek', wall: 'N', offset: 0, kind: 'grille' as const }] : []),
    ),
  ],

  portals: [
    // The ring: twelve rooms, twelve left turns, closed once.
    ...[...Array(RING).keys()].map((i) => ({ a: `r${i + 1}.w`, b: `r${(i + 1) % RING + 1}.s` })),

    // The proof, in the first wall the player sees.
    { a: 'hall.a', b: 'r1.hall' },
    { a: 'hall.b', b: 'r5.hall' },
    { a: 'hall.c', b: 'r9.hall' },

    ...CHAMBERS.map((c) => ({ a: `r${c.room}.chamber`, b: `${c.id}.in` })),

    ...CHAMBERS.filter((c) => c.near).map((c, i) => ({ a: `hall.peek${i + 1}`, b: `${c.id}.peek` })),
  ],

  spawn: { cell: 'hall', pos: [0, 2.4], yaw: 0 },

  goals: CHAMBERS.map((c, i) => ({
    cell: c.id,
    message: ['One of six.', 'Two.', 'Three. Which lap are you on?', 'Four.', 'Five.', 'Six. The house is closed.'][i],
  })),

  assertions: [
    {
      name: 'four lefts: the map closes, and it is the second sheet',
      cell: 'r1',
      doors: Array(4).fill('w'),
      expectEndCell: 'r5',
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
    {
      name: 'eight lefts: the map closes again, and it is the third',
      cell: 'r1',
      doors: Array(8).fill('w'),
      expectEndCell: 'r9',
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
    {
      name: 'twelve lefts: home, at last',
      cell: 'r1',
      doors: Array(12).fill('w'),
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
    { name: 'hall round trip is ordinary', cell: 'hall', doors: ['a', 'hall'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },
  ],
}
