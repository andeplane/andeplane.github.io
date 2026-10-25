/**
 * The 34 numbered monuments of the Heraion, as footprints.
 *
 * ── Where these coordinates come from ────────────────────────────────────────
 *
 * The ODAP booklet carries an official numbered site plan (p. 5 of the PDF).
 * That plan is a raster image, so positions here were read off it BY EYE at
 * 400 dpi and converted to metres. The conversion was anchored on the Great
 * Temple, whose real stylobate is known (108.63 × 55.16 m) and whose outline on
 * the plan measures ~650 × 313 px — giving ~5.85 px/m.
 *
 * Two independent checks say the reading is sound:
 *
 *   1. Measuring at a second, coarser rendering (150 dpi, ~3.35 px/m) put the
 *      shared monuments within ~2 m of the values below.
 *   2. Dipteros I's centre came out ~39 m east of Dipteros II's. Samos 21.1
 *      states the offset independently as 42 m. Agreement to ~3 m across a
 *      completely separate source is good evidence the scale is right.
 *
 * So treat every position as **derived, ±5 m or so** — good enough to walk a
 * sanctuary and understand what stood where, not good enough to set out a
 * trench. Sizes are worse: most are eyeballed from the plan, and only the four
 * flagged `sizeSrc: 'attested'` come from a text source.
 *
 * Labels sit beside their monument on the plan rather than on it, so small
 * monuments (bases, statue groups) may be off by their own width.
 *
 * ── Coordinates ──────────────────────────────────────────────────────────────
 *   origin  centre of the Great Temple's stylobate
 *   +x      east          +z      SOUTH  (north is −z)
 *
 * North is −z, not +z. That is deliberate: a camera looking straight down a
 * y-up world can show north-up and east-right at the same time only under this
 * handedness. Get it backwards and the site map comes out mirrored.
 *   w       east–west extent      d       north–south extent
 *   rot     radians, counter-clockwise seen from above
 *
 * `kind` drives how it is drawn: slab | altar | stoa | circle | base | path.
 */

export const MONUMENTS = [
  // ── The temples on the main terrace ───────────────────────────────────────
  {
    id: 2,
    name: 'Temple of Hera by Rhoikos and Theodoros',
    short: 'Dipteros I',
    kind: 'slab',
    x: 42,
    z: 0,
    w: 105,
    d: 52.5,
    height: 0.5,
    sizeSrc: 'attested', //  ODAP: "dipteral and 52.5x105 m"
    posSrc: 'attested', //   Samos 21.1: 42 m offset
    note: 'Overlaps the great temple: the later foundations partly overlie it.',
  },
  {
    id: 3,
    name: 'Temple of Hera I and II (Hekatompedos)',
    short: 'Hekatompedoi',
    kind: 'slab',
    x: 84,
    z: 3,
    w: 33,
    d: 6.6,
    height: 0.78,
    sizeSrc: 'derived', //  "one hundred feet", 5:1 ratio
    posSrc: 'derived',
    note: 'Buried inside Dipteros I, 3 m south of the altar axis (Samos 21.1), facing the sunrise.',
  },
  {
    id: 4,
    short: 'Monopteros',
    name: 'Monopteros building',
    kind: 'slab',
    x: 69,
    z: 4,
    w: 9,
    d: 11,
    height: 0.6,
  },
  {
    id: 5,
    short: 'Roman peripteros',
    name: 'Roman peripteral temple',
    kind: 'slab',
    x: 103,
    z: 2,
    w: 16,
    d: 24,
    height: 0.7,
    note: 'Built under Augustus to house the cult statue. Published as Samos 29.',
  },
  {
    id: 6,
    short: 'Great Altar',
    name: 'Great Altar',
    kind: 'altar',
    x: 123,
    z: -1,
    w: 16.5,
    d: 36.5,
    height: 5.5,
    sizeSrc: 'attested', //  ODAP: 36.5x16.5 m, wall 5–7 m
    note: 'The cult centre. Walled on three sides, open west toward the temple — which is why the temple faces east.',
  },
  {
    id: 15,
    short: 'Corinthian temple',
    name: 'Corinthian temple',
    kind: 'slab',
    x: 83,
    z: -16,
    w: 12,
    d: 7.4,
    height: 0.6,
    sizeSrc: 'attested', //  ODAP: 7.4x12 m
  },

  // ── Along and around the Sacred Way ───────────────────────────────────────
  { id: 21, name: 'Temple D', kind: 'slab', x: 71, z: -45, w: 7, d: 12, height: 0.5 },
  { id: 22, name: 'Temple A', kind: 'slab', x: 89, z: -37, w: 7, d: 12, height: 0.5 },
  { id: 23, name: 'Temple E', kind: 'slab', x: 97, z: -34, w: 7, d: 11, height: 0.5 },
  { id: 24, name: 'Temple C', kind: 'slab', x: 109, z: -33, w: 7, d: 11, height: 0.5 },
  { id: 25, name: 'Temple B', kind: 'slab', x: 117, z: -50, w: 8, d: 13, height: 0.5 },
  {
    id: 26,
    short: 'North building',
    name: 'North building',
    kind: 'slab',
    x: 134,
    z: -65,
    w: 25,
    d: 15,
    height: 0.6,
  },
  {
    id: 34,
    short: 'Hellenistic building',
    name: 'Hellenistic rectangular building',
    kind: 'slab',
    x: 154,
    z: -34,
    w: 20,
    d: 14,
    height: 0.6,
  },

  // ── Roman and later ───────────────────────────────────────────────────────
  { id: 12,
    short: 'Roman Baths', name: 'Roman Baths', kind: 'slab', x: 68, z: -7, w: 18, d: 14, height: 0.6 },
  { id: 13,
    short: 'Small Roman temple', name: 'Small Roman temple', kind: 'slab', x: 98, z: -10, w: 8, d: 10, height: 0.5 },
  {
    id: 14,
    short: 'Basilica',
    name: 'Early Christian basilica',
    kind: 'slab',
    x: 108,
    z: -12,
    w: 18,
    d: 30,
    height: 0.7,
  },

  // ── Stoas, gate, fountain ─────────────────────────────────────────────────
  {
    id: 18,
    short: 'North stoa',
    name: 'North stoa',
    kind: 'stoa',
    x: -16,
    z: -63,
    w: 130,
    d: 7,
    rot: 0.34,
    height: 0.7,
  },
  {
    id: 10,
    short: 'South stoa',
    name: 'South stoa',
    kind: 'stoa',
    x: 78,
    z: 38,
    w: 70,
    d: 8,
    rot: -0.78,
    height: 0.7,
  },
  {
    id: 9,
    short: 'South building',
    name: 'South building',
    kind: 'slab',
    x: 69,
    z: 72,
    w: 47,
    d: 31,
    rot: -0.52,
    height: 0.7,
  },
  { id: 19, name: 'North gate', kind: 'slab', x: 49, z: -84, w: 10, d: 8, height: 0.6 },
  { id: 20, name: 'Fountain', kind: 'slab', x: 96, z: -75, w: 8, d: 6, height: 0.5 },
  { id: 8, name: 'Cistern', kind: 'slab', x: 105, z: 84, w: 8, d: 8, height: 0.4 },

  // ── Circular structures ───────────────────────────────────────────────────
  { id: 17,
    short: 'Circular building', name: 'Circular building', kind: 'circle', x: 56, z: -58, w: 10, height: 0.6 },
  { id: 28,
    short: 'Circular monument', name: 'Circular monument', kind: 'circle', x: 117, z: -27, w: 6, height: 0.5 },

  // ── Bases, monuments and sculptural groups ────────────────────────────────
  {
    id: 7,
    short: 'Ship base',
    name: 'Base for a ship',
    kind: 'base',
    x: 117,
    z: 36,
    w: 6,
    d: 25,
    height: 0.5,
    note: 'A whole ship dedicated by the seafarer Kolaios.',
  },
  {
    id: 11,
    short: 'Cicerones monument',
    name: 'Honorary monument for the Cicerones',
    kind: 'base',
    x: 85,
    z: 25,
    w: 4,
    d: 4,
    height: 0.9,
  },
  { id: 16,
    short: 'Roman statue base', name: 'Roman statue base', kind: 'base', x: 53, z: -33, w: 3, d: 3, height: 0.9 },
  { id: 29,
    short: 'Dedication base', name: 'Dedication base', kind: 'base', x: 129, z: -48, w: 4, d: 4, height: 0.8 },
  {
    id: 30,
    short: 'Geneleos group',
    name: "Geneleos' sculptural group",
    kind: 'base',
    x: 136,
    z: -60,
    w: 9,
    d: 3,
    height: 0.8,
    note: 'Six figures on a long base; the copy stands on site today.',
  },
  {
    id: 31,
    short: 'Gaius & Lucius Caesar',
    name: 'Honorary monument for Gaius and Lucius Caesar',
    kind: 'base',
    x: 149,
    z: -56,
    w: 5,
    d: 4,
    height: 0.9,
  },
  {
    id: 32,
    short: 'Two Roman consuls',
    name: 'Base for the honorary statues of two Roman consuls',
    kind: 'base',
    x: 156,
    z: -60,
    w: 5,
    d: 3,
    height: 0.9,
  },
  {
    id: 33,
    short: 'Myron group',
    name: "Myron's sculptural group",
    kind: 'base',
    x: 134,
    z: -37,
    w: 7,
    d: 3,
    height: 0.8,
    note: 'Three bronzes on a shared base — Herakles, Zeus and Athena.',
  },

  // ── The Sacred Way ────────────────────────────────────────────────────────
  {
    id: 27,
    name: 'Sacred Way',
    kind: 'path',
    // Runs south-west to north-east through the eastern sanctuary; 7–8 m wide
    // where it begins, south of the altar precinct (Samos 21.1).
    from: [62, 34],
    to: [196, -78],
    w: 7.5,
    sizeSrc: 'attested',
    note: 'The processional route in from the city. Votives and statue groups line it.',
  },
];

/** The great temple itself, so the label layer can name it too. */
export const GREAT_TEMPLE_ID = 1;
