/**
 * Dipteros II — the Polykratean Temple of Hera at the Heraion of Samos.
 * Begun c. 530 BC, never completed.
 *
 * Every number below carries a `src` tag. Read it before trusting the number.
 *
 *   'attested'    stated in a primary/official source we hold. See sources/MANIFEST.md.
 *   'derived'     computed from attested figures by arithmetic stated in the comment.
 *   'conjectural' our reconstruction. Plausible, unverified, and the first thing to
 *                 replace when Gruben/Kienast or Reuther is in hand.
 *
 * The honest summary: the FOOTPRINT and the COLUMN COUNT are solid. Everything
 * about the elevation above column height — entablature depth, roof, cella walls —
 * is conjectural, because no measured plan of this building is in our archive.
 */

export const PROVENANCE = {
  attested: {
    label: 'Attested',
    color: '#7fb069',
    note: 'Stated in the ODAP booklet or the DAI project record.',
  },
  derived: {
    label: 'Derived',
    color: '#e8c547',
    note: 'Arithmetic from attested figures.',
  },
  conjectural: {
    label: 'Conjectural',
    color: '#d4674f',
    note: 'Our reconstruction. Replace when the measured publications arrive.',
  },
};

// ── Plan ────────────────────────────────────────────────────────────────────

export const STYLOBATE = {
  width: 55.16, //  m, across the fronts (E–W faces)     src: attested
  length: 108.63, //  m, along the flanks (N–S faces)     src: attested
  src: 'attested',
  note: 'ODAP booklet: "It was dipteral, and measured 55.16x108.63 m."',
};

/**
 * Column arrangement.
 *
 * Attested: 24 columns along each flank in a double row; triple colonnades at
 * the facades; 8 columns east and 9 west; 155 columns total, "belonging to four
 * different sizes and types".
 *
 * The nine-column rear hall is independently corroborated (de.wikipedia
 * "Dipteros", describing the Polykratean successor as having a
 * "neunsäulige Rückhalle").
 *
 * Reconciling those statements to exactly 155:
 *
 *   outer peristasis ring   8 × 24 rectangle, corners once   2(24) + 2(8) − 4 = 60
 *   inner peristasis ring   6 × 22 rectangle, corners once   2(22) + 2(6) − 4 = 52
 *   third facade rows       4 east + 4 west                                  =  8
 *   pronaos (east)                                                           =  8
 *   rear hall (west)                                                         =  9
 *   cella, two internal colonnades of 9                                      = 18
 *                                                                            ────
 *                                                                             155
 *
 * The two peristasis rings and the facade rows are fixed by the attested
 * description; the porch figures are attested; so the cella colonnades are the
 * only free variable, and 2 × 9 is what closes the sum. That is a real constraint
 * on the reconstruction, not a fudge — but it does mean any error in the ring
 * counts is absorbed silently by the cella. Treat the cella figure as the least
 * secure number in this file.
 *
 * The four ring/row groups above map onto the attested "four sizes and types":
 * outer peristasis, inner peristasis, porch, cella. That the arithmetic closes
 * exactly on 155 is encouraging but is NOT proof the distribution is right —
 * other partitions also sum to 155.
 */
export const PLAN = {
  outerAcross: 8, //  columns across each facade, outer ring   src: attested
  outerAlong: 24, //  columns along each flank, outer ring     src: attested
  innerAcross: 6, //  src: derived (outer inset one bay per side)
  innerAlong: 22, //  src: derived
  thirdRowPerFacade: 4, //  src: conjectural
  pronaosColumns: 8, //  src: attested ("8 columns on the east")
  rearHallColumns: 9, //  src: attested ("9 on the west"; "neunsäulige Rückhalle")
  cellaColonnadeLength: 9, //  × 2 rows         src: conjectural (closes the sum at 155)
  totalAttested: 155, //  src: attested
  src: 'attested',
};

/** Axis inset from the stylobate edge to the centre of the outer columns. */
export const EDGE_INSET = {
  value: 1.85, //  m                                        src: conjectural
  src: 'conjectural',
  note: 'Roughly one lower column radius plus a footing margin.',
};

// ── Elevation ───────────────────────────────────────────────────────────────

export const KREPIDOMA = {
  steps: 3, //         src: conjectural
  riser: 0.52, //  m   src: conjectural
  tread: 0.75, //  m   src: conjectural
  src: 'conjectural',
  note: 'Standard archaic three-step krepidoma. No measured section available.',
};

/**
 * Column orders. Height 20 m is attested for the peristasis; the graded heights
 * of the inner orders are conjectural, following the usual practice of reducing
 * the interior orders.
 *
 * Attested for all: shafts UNFLUTED, of marble; bases with horizontal fluting
 * (spira) and torus; a carved, painted band at the top of the shaft.
 * Exterior capitals Ionic with volutes; interior capitals with an ovolo moulding.
 */
export const ORDERS = {
  outer: {
    name: 'Outer peristasis',
    height: 20.0, //  m       src: attested
    lowerDiameter: 1.92, //  m src: conjectural (h:d ≈ 10.4:1, archaic Ionic)
    taper: 0.79, //  upper/lower diameter        src: conjectural
    capital: 'ionic',
    src: 'attested',
  },
  inner: {
    name: 'Inner peristasis',
    height: 19.2,
    lowerDiameter: 1.82,
    taper: 0.79,
    capital: 'ionic',
    src: 'conjectural',
  },
  porch: {
    name: 'Pronaos / rear hall',
    height: 18.4,
    lowerDiameter: 1.66,
    taper: 0.8,
    capital: 'ovolo',
    src: 'conjectural',
  },
  cella: {
    name: 'Cella',
    height: 16.6,
    lowerDiameter: 1.48,
    taper: 0.81,
    capital: 'ovolo',
    src: 'conjectural',
  },
};

/** Base profile, as fractions of the lower shaft diameter. Samian type. */
export const BASE_PROFILE = {
  spiraHeight: 0.42, //  × d   horizontally fluted drum   src: conjectural
  spiraFlutes: 9, //     count of horizontal grooves      src: attested (qualitative)
  spiraRadius: 0.86, //  × d
  torusHeight: 0.28, //  × d   horizontally fluted torus  src: attested (qualitative)
  torusRadius: 0.78, //  × d
  src: 'conjectural',
  note: 'ODAP: bases "decorated horizontally with fluted spirals and torus". The profile is qualitative in the source; these proportions are ours.',
};

export const NECKING = {
  height: 0.34, //  × d, the painted carved band          src: attested (qualitative)
  src: 'conjectural',
};

/**
 * Entablature. The architrave was WOODEN — attested, and a first-order fact:
 * it is why the intercolumniations could be so wide, and it means there was
 * never a continuous stone frieze at this scale.
 */
export const ENTABLATURE = {
  architraveHeight: 1.55, //  m  src: conjectural
  architraveDepth: 1.15, //  m   src: conjectural
  corniceHeight: 0.85, //  m     src: conjectural
  corniceOverhang: 0.75, //  m   src: conjectural
  wooden: true, //               src: attested
  src: 'conjectural',
  note: 'ODAP: "The architrave was wooden." Dimensions are ours.',
};

/**
 * The temple was never finished, and there is a live scholarly question whether
 * it was ever roofed. Default OFF: showing a complete roof asserts more than the
 * evidence supports. Toggle it to read the intended design.
 */
export const ROOF = {
  show: false,
  pitch: 0.13, //  rise/run, shallow archaic Ionic   src: conjectural
  src: 'conjectural',
  note: 'Never completed. Gruben held the building was not hypaethral, but no roof survives.',
};

export const CELLA = {
  // As fractions of the space inside the innermost peristyle ring.
  widthFactor: 0.62, //   src: conjectural
  wallThickness: 1.5, //  m   src: conjectural
  wallHeight: 13.5, //  m     src: conjectural
  src: 'conjectural',
  note: 'No measured cella plan available. Proportions are ours.',
};

/**
 * The foundation. This is the part that actually still exists.
 *
 * The temple was never completed, and its cut stone was quarried away for the
 * city walls and other buildings — attested. What a visitor stands in front of
 * today is the foundation platform, plus one column. For an AR experience this
 * is the single most important layer in the model: it is the geometry that has
 * to register against the real remains, and everything above it is the overlay.
 */
export const FOUNDATION = {
  // Extends beyond the krepidoma footprint, as a Greek temple foundation does.
  overhang: 1.6, //  m beyond the lowest step         src: conjectural
  depth: 2.4, //  m below grade                        src: conjectural
  exposed: 0.55, //  m standing proud of grade         src: conjectural
  src: 'conjectural',
  note: 'No measured section of the foundation is available. Dimensions are ours; the fact that the foundation is what survives is attested.',
};

/**
 * The wider sanctuary now lives in `monuments.js`, which carries all 34
 * numbered monuments with positions read off the official ODAP site plan.
 * The two attested figures that used to live here — Dipteros I's 52.5 × 105 m
 * and its 42 m offset, and the altar's 36.5 × 16.5 m — are recorded there
 * against the monuments they belong to.
 */

export const SITE = {
  // The single column standing in situ on the south flank, re-erected to about
  // a third of its height. Attested: "only one of these is preserved in situ on
  // the southern side".
  survivingColumnHeight: 6.6, //  m   src: conjectural
  survivingColumnSrc: 'attested',
  latitude: 37.672, //  Heraion, for sun position   src: attested
  longitude: 26.885,
};

export const HUMAN_HEIGHT = 1.72; //  m, scale reference
