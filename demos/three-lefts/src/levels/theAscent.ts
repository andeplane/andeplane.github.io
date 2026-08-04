import type { CellSpec, LevelSpec } from '../world/types'

/**
 * Level 3 — The Ascent.
 *
 * A Penrose staircase you can actually walk.
 *
 * Four flights and four landings in a ring. Every flight climbs 1.05 m and
 * every landing turns 90°, so one lap is 360° of turning and 4.2 m of climbing
 * — and the ring closes. The holonomy is therefore a pure vertical translation
 * of −4.2 m: you climb forever and stay exactly where you are.
 *
 * That number is exact rather than approximate, and worth the arithmetic: the
 * four steps are identical rigid motions S with a 90° rotation, so the loop is
 * S⁴, and the horizontal part of its translation is (I + R + R² + R³)·t, which
 * is identically zero for a quarter turn. Only the vertical part survives, and
 * it survives because rotation about Y cannot touch it.
 *
 * The way out is a door on the third landing, positioned so that you face it
 * squarely coming *down* and have your back to it going up. Nothing about it
 * is hidden. You have simply never been pointed at it.
 */

const RISE = 1.05

const flight = (id: string): CellSpec => ({
  id,
  size: [3.0, 3.2, 7.0],
  style: 'stone',
  label: 'Flight',
  floor: { kind: 'ramp', axis: 'z', low: 0, high: RISE, steps: 7 },
  doors: [
    { id: 'bot', wall: 'N', offset: 0 },
    { id: 'top', wall: 'S', offset: 0 },
  ],
  props: [
    { kind: 'banister', wall: 'E' },
    { kind: 'banister', wall: 'W' },
    { kind: 'lamp', x: 0, z: 0, y: 2.6, color: 0xffb478, intensity: 10 },
    { kind: 'window', wall: 'E', offset: 0, width: 0.9, height: 1.5, sill: 1.3, color: 0x8fb0d6 },
  ],
  light: { ambient: 0.3, skyColor: 0x93a4b6, groundColor: 0x39332b },
})

const landing = (id: string, label: string, extra: CellSpec['doors'] = [], props: CellSpec['props'] = []): CellSpec => ({
  id,
  size: [3.6, 3.2, 3.6],
  style: 'stone',
  label,
  doors: [
    { id: 'in', wall: 'N', offset: -0.7 },
    { id: 'out', wall: 'W', offset: 0 },
    ...(extra ?? []),
  ],
  props: [{ kind: 'lamp', x: 1.1, z: 1.1, y: 2.5, color: 0xffc287, intensity: 7 }, ...(props ?? [])],
  light: { ambient: 0.3, skyColor: 0x93a4b6, groundColor: 0x39332b },
})

export const theAscent: LevelSpec = {
  id: 'the-ascent',
  title: 'The Ascent',
  tagline: 'A staircase that climbs forever and arrives nowhere.',
  blurb:
    'Four flights of stairs in a square. Each one climbs. Walk all four and you are back at the bottom, having gained four metres and lost them to nothing at all. The lantern is in the belfry, and the stair does not go there.',
  hint: 'You have climbed this stair four times. Try going down it.',
  objective: 'Reach the belfry.',
  goals: [{ cell: 'belfry', message: 'Down was up. The stair was never taking you anywhere.' }],
  outro: 'Down was up. The stair was never taking you anywhere.',

  cells: [
    {
      id: 'court',
      size: [11, 6.0, 11],
      style: 'stone',
      label: 'The Court',
      doors: [
        { id: 'up', wall: 'N', offset: 0 },
        { id: 'see', wall: 'E', offset: 0, kind: 'grille', width: 1.5, height: 1.6, sill: 1.05 },
      ],
      props: [
        { kind: 'column', x: -3.6, z: -3.6, radius: 0.4 },
        { kind: 'column', x: 3.6, z: -3.6, radius: 0.4 },
        { kind: 'column', x: -3.6, z: 3.6, radius: 0.4 },
        { kind: 'column', x: 3.6, z: 3.6, radius: 0.4 },
        { kind: 'window', wall: 'S', offset: -3.2, width: 1.4, height: 3.0, sill: 1.4 },
        { kind: 'window', wall: 'S', offset: 3.2, width: 1.4, height: 3.0, sill: 1.4 },
        { kind: 'window', wall: 'W', offset: 0, width: 1.4, height: 3.0, sill: 1.4 },
        { kind: 'lamp', x: 0, z: 0, y: 4.2, color: 0xffd2a0, intensity: 24 },
        { kind: 'rug', x: 0, z: 0, w: 4.5, d: 4.5, color: 0x3f3a30 },
      ],
      light: { ambient: 0.58, skyColor: 0xc0d2e4, groundColor: 0x4a4235 },
    },

    flight('flightA'),
    flight('flightB'),
    flight('flightC'),
    flight('flightD'),

    landing('landingA', 'Landing I — the way in', [{ id: 'entry', wall: 'S', offset: 0 }], [
      { kind: 'painting', wall: 'E', offset: 0, color: 0x2b3a2f, w: 0.9, h: 1.2 },
    ]),
    landing('landingB', 'Landing II', [], [{ kind: 'crate', x: 1.2, z: -1.2, size: 0.6 }]),
    landing(
      'landingC',
      'Landing III — the door you keep passing',
      [{ id: 'hatch', wall: 'E', offset: 0 }],
      [{ kind: 'crate', x: -1.2, z: 1.2, size: 0.55, height: 0.9 }],
    ),
    landing('landingD', 'Landing IV', [], [{ kind: 'bookshelf', wall: 'E', offset: 0, width: 1.8 }]),

    {
      id: 'oriel',
      size: [3.2, 3.0, 3.2],
      style: 'attic',
      label: 'The Oriel',
      doors: [
        { id: 'door', wall: 'W', offset: 0 },
        { id: 'up', wall: 'E', offset: 0 },
      ],
      props: [
        { kind: 'window', wall: 'N', offset: 0, width: 1.2, height: 1.7, sill: 1.0, color: 0xd8c49a },
        { kind: 'lamp', x: 0, z: 1.0, y: 2.4, color: 0xffca8e, intensity: 8 },
      ],
      light: { ambient: 0.42, skyColor: 0xd6c9ac, groundColor: 0x4a3a28 },
    },
    {
      id: 'belfry',
      size: [7, 4.6, 7],
      style: 'attic',
      label: 'The Belfry',
      doors: [
        { id: 'stair', wall: 'W', offset: 0 },
        { id: 'look', wall: 'S', offset: 0, kind: 'grille', width: 1.5, height: 1.6, sill: 1.05 },
      ],
      props: [
        { kind: 'pedestal', x: 0, z: -0.6, item: 'lantern', label: 'the belfry lantern' },
        { kind: 'window', wall: 'N', offset: 0, width: 2.0, height: 2.4, sill: 1.1, color: 0xe8d0a4 },
        { kind: 'window', wall: 'E', offset: 0, width: 2.0, height: 2.4, sill: 1.1, color: 0xc9d8ea },
        { kind: 'column', x: -2.4, z: 2.4, radius: 0.28 },
        { kind: 'column', x: 2.4, z: 2.4, radius: 0.28 },
        { kind: 'lamp', x: 0, z: 2.2, y: 3.4, color: 0xffc287, intensity: 12 },
      ],
      light: { ambient: 0.6, skyColor: 0xdcd0b4, groundColor: 0x4f4030 },
    },
  ],

  portals: [
    { a: 'court.up', b: 'landingA.entry' },

    // The ring: landing → flight → landing, four times, closed.
    { a: 'landingA.out', b: 'flightB.bot' },
    { a: 'flightB.top', b: 'landingB.in' },
    { a: 'landingB.out', b: 'flightC.bot' },
    { a: 'flightC.top', b: 'landingC.in' },
    { a: 'landingC.out', b: 'flightD.bot' },
    { a: 'flightD.top', b: 'landingD.in' },
    { a: 'landingD.out', b: 'flightA.bot' },
    { a: 'flightA.top', b: 'landingA.in' },

    { a: 'landingC.hatch', b: 'oriel.door' },
    { a: 'oriel.up', b: 'belfry.stair' },
    { a: 'belfry.look', b: 'court.see' },
  ],

  spawn: { cell: 'court', pos: [0, 3.4], yaw: 0 },

  assertions: [
    {
      name: 'the stair is a Penrose loop: 360° of turning, −4.2 m of nothing',
      cell: 'landingA',
      doors: ['out', 'top', 'out', 'top', 'out', 'top', 'out', 'top'],
      expectYawDeg: 0,
      expectTranslation: [0, -4 * RISE, 0],
    },
    {
      name: 'court ↔ landing round trip is ordinary',
      cell: 'court',
      doors: ['up', 'entry'],
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
  ],
}
