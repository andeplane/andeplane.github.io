import type { CellLight, CellSpec, DoorSpec, LevelSpec, Prop, StyleName } from '../world/types'

/**
 * Level 6 — The Aviary.
 *
 * Nine rooms in a ring, and almost every wall between them is barred.
 *
 * The ring is nine left turns — 9 × 90° = 810°, so the holonomy of one lap is a
 * quarter turn the wrong way and the map never closes. That is the familiar
 * part. The new part is that the ring is criss-crossed with **grilles**, so the house has two
 * different connectivities laid over the same cells: what you can see through,
 * and what you can walk through. They are not the same graph and they are not
 * even close.
 *
 * The consequence that makes the level: each of the three chambers is visible
 * from two or three rooms and has a door in exactly one of them, and because
 * every sightline is a different path through the graph, the *same chamber
 * appears in a different direction from each*. There is no direction it is in.
 * The audio does the same thing from the same transforms, so your ears will
 * confirm your eyes and both will be no help at all.
 *
 * Nothing is hidden: bars look like bars and doors look like doors. You can
 * always see which openings you can use. Knowing which one to walk to is the
 * entire problem.
 */

const RING_LIGHT: CellLight = {
  ambient: 0.76,
  skyColor: 0xa8bacb,
  groundColor: 0x584330,
  key: { dir: [0.3, 0.9, 0.3], intensity: 1.0 },
}

const RING_STYLES: StyleName[] = ['green', 'gallery', 'oxblood', 'attic', 'stone', 'chapel', 'green', 'gallery', 'cellar']

/**
 * The rooms are individually memorable here, unlike The Cloister — this level
 * is about routing, not about identity, and making the player also unable to
 * tell the rooms apart would be two puzzles stacked into a fog.
 */
const ringRoom = (i: number, extraDoors: DoorSpec[], extraProps: Prop[] = []): CellSpec => ({
  id: `c${i + 1}`,
  size: [6.5, 3.2, 6.5],
  style: RING_STYLES[i],
  label: `Aviary ${'I II III IV V VI VII VIII IX'.split(' ')[i]}`,
  doors: [{ id: 's', wall: 'S', offset: 1.6 }, { id: 'w', wall: 'W', offset: -1.2 }, ...extraDoors],
  props: [
    { kind: 'column', x: -2.1, z: 2.1 },
    { kind: 'lamp', x: 1.7, z: -1.7, y: 2.6, color: 0xffc07a, intensity: 9 },
    ...extraProps,
  ],
  light: RING_LIGHT,
})

const chamber = (id: string, label: string, peeks: DoorSpec[]): CellSpec => ({
  id,
  size: [3.6, 3.6, 3.6],
  style: 'chapel',
  label,
  doors: [{ id: 'in', wall: 'W', offset: 0 }, ...peeks],
  props: [{ kind: 'pedestal', x: 0, z: 0, item: 'lantern', label }],
  light: { ambient: 0.34, skyColor: 0x8a97a8, groundColor: 0x2b2118 },
})

const grille = (id: string, wall: DoorSpec['wall'], offset: number): DoorSpec => ({
  id,
  wall,
  offset,
  kind: 'grille',
})

export const theAviary: LevelSpec = {
  id: 'the-aviary',
  title: 'The Aviary',
  tagline: 'You can see everything. You can reach almost nothing.',
  blurb:
    'Nine rooms in a ring, barred to each other on every side. Three lanterns, each visible through two or three grilles and each with a door in exactly one room. The same lantern shows up in a different direction from every window you find it through, and every one of those directions is honest.',
  hint: 'Bars are bars and doors are doors. Nothing here is hidden — it is only somewhere else.',
  objective: 'Record all three lanterns.',
  outro:
    'Every window told you the truth about where the lantern was. They simply did not agree, because there was never a single answer for them to agree on.',

  cells: [
    {
      id: 'porch',
      size: [5, 3.4, 4],
      style: 'stone',
      label: 'The Porch',
      doors: [
        { id: 'in', wall: 'N', offset: 0 },
        grille('g', 'E', 0),
      ],
      props: [
        { kind: 'lamp', x: 0, z: 1.0, y: 2.6, color: 0xffc07a, intensity: 10 },
        { kind: 'window', wall: 'S', offset: 0, width: 1.4, height: 2.0, sill: 0.9 },
      ],
      light: { ambient: 0.58, skyColor: 0xc4d6e8, groundColor: 0x4a3624 },
    },

    ringRoom(0, [{ id: 'porch', wall: 'N', offset: -1.8 }, grille('g', 'E', 0)]),
    ringRoom(1, [grille('g', 'E', 0)]),
    ringRoom(2, [grille('g', 'E', 0)]),
    ringRoom(3, [{ id: 'door', wall: 'E', offset: 0 }]),
    ringRoom(4, [grille('g', 'E', 0)]),
    ringRoom(5, [], [{ kind: 'bookshelf', wall: 'N', offset: 0, width: 3.6 }]),
    ringRoom(6, [{ id: 'door', wall: 'E', offset: 0 }]),
    ringRoom(7, [], [{ kind: 'crate', x: -2.2, z: -2.0, size: 0.8 }]),
    ringRoom(8, [{ id: 'door', wall: 'E', offset: 0 }, grille('g', 'N', 1.8)]),

    chamber('chA', 'the first lantern', [grille('peek', 'N', 0)]),
    chamber('chB', 'the second lantern', [grille('peek1', 'N', 0), grille('peek2', 'S', 0)]),
    chamber('chC', 'the third lantern', [grille('peek1', 'N', 0), grille('peek2', 'S', 0), grille('peek3', 'E', 0)]),
  ],

  portals: [
    // The ring: nine rooms, nine left turns. One lap overshoots a full circle
    // by a quarter, so the notebook never quite closes and never quite fails.
    { a: 'c1.w', b: 'c2.s' },
    { a: 'c2.w', b: 'c3.s' },
    { a: 'c3.w', b: 'c4.s' },
    { a: 'c4.w', b: 'c5.s' },
    { a: 'c5.w', b: 'c6.s' },
    { a: 'c6.w', b: 'c7.s' },
    { a: 'c7.w', b: 'c8.s' },
    { a: 'c8.w', b: 'c9.s' },
    { a: 'c9.w', b: 'c1.s' },

    { a: 'porch.in', b: 'c1.porch' },

    // Three chambers. Each has exactly one door, and it is never in a room the
    // chamber can be seen from.
    { a: 'c4.door', b: 'chA.in' },
    { a: 'c7.door', b: 'chB.in' },
    { a: 'c9.door', b: 'chC.in' },

    { a: 'c1.g', b: 'chA.peek' },
    { a: 'c2.g', b: 'chB.peek1' },
    { a: 'c9.g', b: 'chB.peek2' },
    { a: 'c3.g', b: 'chC.peek1' },
    { a: 'c5.g', b: 'chC.peek2' },
    { a: 'porch.g', b: 'chC.peek3' },
  ],

  spawn: { cell: 'porch', pos: [0, 1.0], yaw: 0 },

  goals: [
    { cell: 'chA', message: 'One. You saw it from the first room and walked past its door twice.' },
    { cell: 'chB', message: 'Two.' },
    { cell: 'chC', message: 'Three. It was the one you could see from the doorstep.' },
  ],

  assertions: [
    // n rooms of one left turn each give (4 − n) quarter turns. Nine rooms is
    // −450°, i.e. a quarter turn the *other* way.
    { name: 'nine lefts overshoots by a quarter turn', cell: 'c1', doors: Array(9).fill('w'), expectYawDeg: -90 },
    { name: 'four lefts lands in the fifth room', cell: 'c1', doors: ['w', 'w', 'w', 'w'], expectEndCell: 'c5', expectYawDeg: 0 },
    { name: 'porch round trip is ordinary', cell: 'porch', doors: ['in', 'porch'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },
  ],
}
