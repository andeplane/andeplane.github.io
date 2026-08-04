import type { LevelSpec } from '../world/types'

/**
 * Level 2 — The Long Gallery.
 *
 * Three impossibilities of different kinds in one building:
 *
 *  - a corridor glued to *itself*, so it has no end and the recursion in the
 *    renderer shows you copy after copy of the room you are standing in;
 *  - a cathedral behind the door of a two-and-a-half metre vestibule, which
 *    costs nothing to build because there is no outside for it to not fit in;
 *  - a two-room ring: 180° of cone angle, where *two* left turns close a loop.
 *    After the first level's three, two is genuinely disorienting.
 *
 * The reliquary is visible from the nave through a squint in the wall, and the
 * only way to it is around the two-turn loop on the far side of the building.
 */
export const longGallery: LevelSpec = {
  id: 'long-gallery',
  title: 'The Long Gallery',
  tagline: 'A corridor with no end, and a cathedral in a cupboard.',
  blurb:
    'A gallery that returns you to its own beginning, a vestibule that opens onto a nave twenty metres tall, and a courtyard you can walk around in two turns instead of four.',
  hint: 'The gallery is one room. Count the paintings.',
  objective: 'Reach the reliquary you can see from the nave.',
  goals: [{ cell: 'reliquary', message: 'Two turns was a whole circle. The nave is on the other side of that wall.' }],
  outro: 'Two turns was a whole circle. The nave is on the other side of that wall.',

  cells: [
    {
      id: 'atrium',
      size: [10, 5.0, 10],
      style: 'gallery',
      label: 'Atrium',
      doors: [
        { id: 'n', wall: 'N', offset: 0 },
        { id: 'e', wall: 'E', offset: 0 },
        { id: 'w', wall: 'W', offset: 0 },
      ],
      props: [
        { kind: 'column', x: -3.2, z: -3.2 },
        { kind: 'column', x: 3.2, z: -3.2 },
        { kind: 'column', x: -3.2, z: 3.2 },
        { kind: 'column', x: 3.2, z: 3.2 },
        { kind: 'window', wall: 'S', offset: -3.0, width: 1.5, height: 2.6, sill: 1.2 },
        { kind: 'window', wall: 'S', offset: 3.0, width: 1.5, height: 2.6, sill: 1.2 },
        { kind: 'lamp', x: 0, z: 0, y: 3.6, color: 0xffd2a0, intensity: 22 },
        { kind: 'rug', x: 0, z: 0, w: 5.0, d: 5.0, color: 0x4d4436 },
      ],
      light: { ambient: 0.6, skyColor: 0xc8d8e6, groundColor: 0x574c3c },
    },

    // --- the gallery, glued to itself --------------------------------------
    {
      id: 'gallery',
      size: [3.4, 3.9, 24],
      style: 'gallery',
      label: 'The Long Gallery',
      doors: [
        { id: 'far', wall: 'N', offset: 0 },
        { id: 'near', wall: 'S', offset: 0 },
        { id: 'side', wall: 'E', offset: 0 },
      ],
      props: [
        { kind: 'painting', wall: 'W', offset: -9.5, color: 0x2a3a2e, w: 1.0, h: 1.35 },
        { kind: 'painting', wall: 'W', offset: -5.7, color: 0x36261f, w: 1.0, h: 1.35 },
        { kind: 'painting', wall: 'W', offset: -1.9, color: 0x1e2b36, w: 1.0, h: 1.35 },
        { kind: 'painting', wall: 'W', offset: 1.9, color: 0x342433, w: 1.0, h: 1.35 },
        { kind: 'painting', wall: 'W', offset: 5.7, color: 0x203228, w: 1.0, h: 1.35 },
        { kind: 'painting', wall: 'W', offset: 9.5, color: 0x3a2a1e, w: 1.0, h: 1.35 },
        { kind: 'window', wall: 'E', offset: -8.5, width: 1.1, height: 2.0, sill: 1.1 },
        { kind: 'window', wall: 'E', offset: 8.5, width: 1.1, height: 2.0, sill: 1.1 },
        { kind: 'lamp', x: 1.1, z: -10.5, y: 2.9, color: 0xffc287, intensity: 9 },
        { kind: 'lamp', x: 1.1, z: -4.5, y: 2.9, color: 0xffc287, intensity: 9 },
        { kind: 'lamp', x: 1.1, z: 4.5, y: 2.9, color: 0xffc287, intensity: 9 },
        { kind: 'lamp', x: 1.1, z: 10.5, y: 2.9, color: 0xffc287, intensity: 9 },
      ],
      light: { ambient: 0.34, skyColor: 0x9fb2c4, groundColor: 0x4a4034 },
    },

    // --- the cupboard and what is behind it --------------------------------
    {
      id: 'vestibule',
      size: [2.8, 2.6, 2.8],
      style: 'stone',
      label: 'Vestibule',
      doors: [
        { id: 'out', wall: 'W', offset: 0 },
        { id: 'in', wall: 'E', offset: 0 },
      ],
      props: [{ kind: 'lamp', x: 0, z: -0.9, y: 2.1, color: 0xffb478, intensity: 5 }],
      light: { ambient: 0.26, skyColor: 0x8d99a6, groundColor: 0x3a332a },
    },
    {
      id: 'cathedral',
      size: [24, 13, 16],
      style: 'chapel',
      label: 'The Nave',
      doors: [
        // Deliberately an ordinary door. The joke only works at this size.
        { id: 'door', wall: 'W', offset: 0 },
        { id: 'squint', wall: 'E', offset: 0, kind: 'grille', width: 1.4, height: 1.5, sill: 1.1 },
      ],
      props: [
        { kind: 'column', x: -7, z: -5.2, radius: 0.5 },
        { kind: 'column', x: -7, z: -1.7, radius: 0.5 },
        { kind: 'column', x: -7, z: 1.7, radius: 0.5 },
        { kind: 'column', x: -7, z: 5.2, radius: 0.5 },
        { kind: 'column', x: 7, z: -5.2, radius: 0.5 },
        { kind: 'column', x: 7, z: -1.7, radius: 0.5 },
        { kind: 'column', x: 7, z: 1.7, radius: 0.5 },
        { kind: 'column', x: 7, z: 5.2, radius: 0.5 },
        { kind: 'window', wall: 'N', offset: -8, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'window', wall: 'N', offset: -2.7, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'window', wall: 'N', offset: 2.7, width: 1.8, height: 5.2, sill: 4.4, color: 0xe6c79f },
        { kind: 'window', wall: 'N', offset: 8, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'window', wall: 'S', offset: -8, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'window', wall: 'S', offset: -2.7, width: 1.8, height: 5.2, sill: 4.4, color: 0xe6c79f },
        { kind: 'window', wall: 'S', offset: 2.7, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'window', wall: 'S', offset: 8, width: 1.8, height: 5.2, sill: 4.4, color: 0x9fc0e6 },
        { kind: 'lamp', x: -4, z: 0, y: 3.4, color: 0xffc07a, intensity: 26 },
        { kind: 'lamp', x: 4, z: 0, y: 3.4, color: 0xffc07a, intensity: 26 },
        { kind: 'rug', x: 0, z: 0, w: 5.0, d: 13.0, color: 0x4a2d2d },
      ],
      light: { ambient: 0.85, skyColor: 0xc6d2e0, groundColor: 0x6a6252, key: { dir: [0.3, 0.9, 0.25], intensity: 1.3 } },
    },

    // --- the two-turn ring --------------------------------------------------
    {
      id: 'bendA',
      size: [5.5, 3.2, 5.5],
      style: 'stone',
      label: 'Bend I',
      doors: [
        { id: 'n', wall: 'N', offset: 0 },
        { id: 's', wall: 'S', offset: 1.2 },
        { id: 'w', wall: 'W', offset: -0.9 },
      ],
      props: [
        { kind: 'column', x: -1.7, z: 1.7 },
        { kind: 'lamp', x: 1.5, z: -1.5, y: 2.5, color: 0xffb478, intensity: 8 },
        { kind: 'crate', x: 1.9, z: 1.9, size: 0.7 },
      ],
      light: { ambient: 0.3, skyColor: 0x8fa0b0, groundColor: 0x3b342b },
    },
    {
      id: 'bendB',
      size: [5.5, 3.2, 5.5],
      style: 'cellar',
      label: 'Bend II',
      doors: [
        { id: 's', wall: 'S', offset: 1.2 },
        { id: 'w', wall: 'W', offset: -0.9 },
        { id: 'e', wall: 'E', offset: 0 },
      ],
      props: [
        { kind: 'column', x: -1.7, z: 1.7 },
        { kind: 'lamp', x: 1.5, z: -1.5, y: 2.5, color: 0xff9e5c, intensity: 8 },
        { kind: 'bookshelf', wall: 'N', offset: 0, width: 2.6 },
      ],
      light: { ambient: 0.24, skyColor: 0x7d8894, groundColor: 0x312b23 },
    },
    {
      id: 'reliquary',
      size: [4.2, 3.4, 4.2],
      style: 'chapel',
      label: 'The Reliquary',
      doors: [
        { id: 'door', wall: 'W', offset: 0 },
        { id: 'squint', wall: 'N', offset: 0, kind: 'grille', width: 1.4, height: 1.5, sill: 1.1 },
      ],
      props: [
        { kind: 'pedestal', x: 0, z: 0.4, item: 'lantern', label: 'the reliquary lantern' },
        { kind: 'column', x: -1.4, z: -1.4, radius: 0.24 },
        { kind: 'column', x: 1.4, z: -1.4, radius: 0.24 },
      ],
      light: { ambient: 0.34, skyColor: 0xa8b2bf, groundColor: 0x3d3427 },
    },
  ],

  portals: [
    { a: 'atrium.n', b: 'gallery.side' },
    // The gallery's far end *is* its near end.
    { a: 'gallery.far', b: 'gallery.near' },

    { a: 'atrium.e', b: 'vestibule.out' },
    { a: 'vestibule.in', b: 'cathedral.door' },

    { a: 'atrium.w', b: 'bendA.n' },
    // Two rooms, two left turns, closed: 180° of cone angle.
    { a: 'bendA.w', b: 'bendB.s' },
    { a: 'bendB.w', b: 'bendA.s' },

    { a: 'bendB.e', b: 'reliquary.door' },
    { a: 'reliquary.squint', b: 'cathedral.squint' },
  ],

  spawn: { cell: 'atrium', pos: [0, 3.2], yaw: 0 },

  assertions: [
    {
      name: 'the gallery returns to itself 24.44 m later',
      cell: 'gallery',
      doors: ['far'],
      expectYawDeg: 0,
      expectTranslation: [0, 0, 24.44],
    },
    { name: 'the bend ring is two lefts (deficit +180°)', cell: 'bendA', doors: ['w', 'w'], expectYawDeg: 180 },
    {
      name: 'vestibule round trip is ordinary',
      cell: 'atrium',
      doors: ['e', 'out'],
      expectYawDeg: 0,
      expectTranslation: [0, 0, 0],
    },
  ],
}
