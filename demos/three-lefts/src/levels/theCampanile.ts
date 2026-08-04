import type { CellLight, CellSpec, DoorSpec, LevelSpec } from '../world/types'

/**
 * Level 7 — The Campanile.
 *
 * Six flights and six landings in a ring. Every flight climbs; every landing
 * turns a quarter. So one lap turns 6 × 90° = 540°, which is a half turn, and
 * climbs 6 × 0.85 = 5.1 m:
 *
 *     one lap    yaw 180°, and 11.5 m sideways, and 5.1 m up
 *     two laps   yaw 0°, translation (0, −10.2, 0) — pure vertical, exactly
 *
 * The Ascent (level 3) had a Penrose stair with *pure* vertical holonomy in a
 * single lap, and once you see it you have seen all of it. Here rotation and
 * rise are coupled and the period is two laps, not one. After a single circuit
 * you are higher, facing backwards, and eleven metres from where the arithmetic
 * of a normal building would put you; only on the second does the horizontal
 * drift cancel itself and leave you looking at ten metres of climb that went
 * nowhere.
 *
 * The six landings are identical on purpose. The stair gives you no way to tell
 * them apart and no way to count them except by marking them, which is the
 * skill The Cloister exists to teach.
 *
 * Three oriels hang off alternate landings with a lantern in each, and each has
 * a barred window back into the entrance court.
 *
 * Those windows are the Penrose payoff made visible. You climb five metres to
 * the first oriel, ten to the third, and through every one of their windows you
 * are looking *level* into the courtyard you started in. Both cells are flat
 * and the portal between them carries no rise, so the view is honest: the climb
 * is real, and it has taken you nowhere above the ground floor.
 */

const RISE = 0.85
const FLIGHTS = 6

const STAIR_LIGHT: CellLight = {
  ambient: 0.6,
  skyColor: 0x9fb2c6,
  groundColor: 0x4c463c,
  key: { dir: [0.28, 0.9, 0.34], intensity: 0.95 },
}

const flight = (i: number): CellSpec => ({
  id: `f${i}`,
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
    { kind: 'window', wall: 'W', offset: 0, width: 0.9, height: 1.5, sill: 1.3, color: 0x8fb0d6 },
  ],
  light: STAIR_LIGHT,
})

/** Deliberately indistinguishable. Counting them is the level. */
const landing = (i: number, extra: DoorSpec[] = []): CellSpec => ({
  id: `l${i}`,
  size: [3.6, 3.2, 3.6],
  style: 'stone',
  label: 'A landing',
  doors: [{ id: 'in', wall: 'N', offset: 0 }, { id: 'out', wall: 'W', offset: 0 }, ...extra],
  props: [
    { kind: 'lamp', x: 1.0, z: 1.0, y: 2.5, color: 0xffbe86, intensity: 8 },
    // Offset clear of the oriel doorway, which alternate landings put on this
    // same wall at offset 0.
    { kind: 'painting', wall: 'E', offset: -1.2, w: 0.9, h: 1.2, color: 0x2a2118 },
  ],
  light: STAIR_LIGHT,
})

const oriel = (k: number): CellSpec => ({
  id: `oriel${k}`,
  size: [3.0, 3.2, 3.0],
  style: 'chapel',
  label: 'An oriel',
  doors: [
    { id: 'in', wall: 'W', offset: 0 },
    { id: 'see', wall: 'N', offset: 0, kind: 'grille', sill: 1.4 },
  ],
  props: [
    { kind: 'pedestal', x: 0, z: 0.2, item: 'lantern', label: `oriel lantern ${k + 1}` },
    { kind: 'window', wall: 'S', offset: 0, width: 1.2, height: 1.8, sill: 0.9, color: 0x9fc0e4 },
  ],
  light: { ambient: 0.38, skyColor: 0x93a4b6, groundColor: 0x2e251b },
})

const idx = [...Array(FLIGHTS).keys()]

export const theCampanile: LevelSpec = {
  id: 'the-campanile',
  title: 'The Campanile',
  tagline: 'Climb until your heading comes back.',
  blurb:
    'Six flights around a tower, each one climbing, each landing a quarter turn. One circuit leaves you five metres higher and facing the way you came. Two circuits give you your heading back and ten metres of climb that went precisely nowhere — and from the window at the top you are looking level into the courtyard you started in.',
  hint: 'One lap is half a turn. Mark the landings — the stair will not tell you which one you are on.',
  objective: 'Record all three oriel lanterns.',
  outro:
    'Ten metres of climbing, and the horizontal part cancelled itself exactly. The tower has no top because there was never anywhere for a top to be.',

  cells: [
    {
      id: 'court',
      size: [11, 6, 11],
      style: 'stone',
      label: 'The Court',
      doors: [
        { id: 'up', wall: 'N', offset: 0 },
        { id: 'see1', wall: 'E', offset: -2.4, kind: 'grille', sill: 1.4 },
        { id: 'see2', wall: 'E', offset: 2.4, kind: 'grille', sill: 1.4 },
        { id: 'see3', wall: 'W', offset: 0, kind: 'grille', sill: 1.4 },
      ],
      props: [
        { kind: 'column', x: -3.6, z: -3.6 },
        { kind: 'column', x: 3.6, z: -3.6 },
        { kind: 'column', x: -3.6, z: 3.6 },
        { kind: 'column', x: 3.6, z: 3.6 },
        { kind: 'lamp', x: 0, z: 0, y: 4.6, color: 0xffc890, intensity: 20 },
        { kind: 'window', wall: 'S', offset: 0, width: 2.2, height: 2.8, sill: 1.1, color: 0x9fc0e4 },
        { kind: 'rug', x: 0, z: 2.0, w: 4.0, d: 3.0, color: 0x4d3630 },
      ],
      light: { ambient: 0.68, skyColor: 0xc4d6e8, groundColor: 0x4a4034 },
    },

    ...idx.map(flight),
    ...idx.map((i) => {
      const extra: DoorSpec[] = []
      if (i === 0) extra.push({ id: 'court', wall: 'S', offset: 0 })
      if (i % 2 === 0) extra.push({ id: 'oriel', wall: 'E', offset: 0 })
      return landing(i, extra)
    }),
    oriel(0),
    oriel(1),
    oriel(2),
  ],

  portals: [
    // The helix: flight into landing, landing into the next flight.
    ...idx.map((i) => ({ a: `f${i}.top`, b: `l${i}.in` })),
    ...idx.map((i) => ({ a: `l${i}.out`, b: `f${(i + 1) % FLIGHTS}.bot` })),

    { a: 'court.up', b: 'l0.court' },

    { a: 'l0.oriel', b: 'oriel0.in' },
    { a: 'l2.oriel', b: 'oriel1.in' },
    { a: 'l4.oriel', b: 'oriel2.in' },

    { a: 'court.see1', b: 'oriel0.see' },
    { a: 'court.see2', b: 'oriel1.see' },
    { a: 'court.see3', b: 'oriel2.see' },
  ],

  spawn: { cell: 'court', pos: [0, 3.2], yaw: 0 },

  goals: [
    { cell: 'oriel0', message: 'One. The landing it opens off looks like all the others.' },
    { cell: 'oriel1', message: 'Two. Two flights further, and half a turn.' },
    { cell: 'oriel2', message: 'Three. You have climbed nowhere at all.' },
  ],

  assertions: [
    {
      name: 'one lap: half a turn, and five metres up',
      cell: 'f0',
      doors: idx.flatMap(() => ['top', 'out']),
      expectYawDeg: 180,
    },
    {
      name: 'two laps: pure vertical, the drift cancels exactly',
      cell: 'f0',
      doors: [...idx, ...idx].flatMap(() => ['top', 'out']),
      expectYawDeg: 0,
      expectTranslation: [0, -2 * FLIGHTS * RISE, 0],
    },
    { name: 'court to the first landing and back is ordinary', cell: 'court', doors: ['up', 'court'], expectYawDeg: 0, expectTranslation: [0, 0, 0] },
  ],
}
