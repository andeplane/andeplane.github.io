# Dipteros II — parametric model

A three.js reconstruction of the Polykratean Temple of Hera at the Heraion of
Samos, begun c. 530 BC and never completed.

```bash
cd viewer
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

## What this is

A **parametric** model, not a survey and not a mesh. Every dimension lives in
`src/params.js` with a provenance tag; the geometry is generated from those
numbers at load time. Change a number, reload, and the building changes. That is
the point: when the measured publications arrive (see `../sources/MANIFEST.md`
§5a), you edit params rather than remodel.

```
src/params.js     every dimension, each tagged attested | derived | conjectural
src/plan.js       column positions and capital orientations
src/column.js     the four orders — base, shaft, necking, capital; plus the stump
src/temple.js     assembly: foundation, krepidoma, colonnades, cella, entablature, roof
src/monuments.js  all 34 numbered monuments of the sanctuary, with positions
src/sanctuary.js  renders them as footprints
src/main.js       scene, lighting, views, UI
```

## Coordinates

```
origin   centre of the Great Temple's stylobate
+x       east          +z       SOUTH  (north is −z)
```

North is **−z**. That is deliberate and worth not "fixing": a camera looking
straight down a y-up world can show north-up *and* east-right at the same time
only under this handedness. Flip it and the site map comes out mirrored.

## The two states that matter

Turn every temple layer off except **Foundation** and **Surviving column** and you
get what a visitor actually sees today: a foundation platform and one column.
Turn them back on and you get the overlay. That pair is the whole point of the
AR experience, and the model is built so you can flip between them.

The surviving column stands at its true position on the south flank, which means
it is *inside* its own reconstructed counterpart — hide the outer peristasis to
see it. That is correct, not a bug: it is one of the 155.

## What is actually evidenced

Solid, from the ODAP booklet and the DAI project record:

- stylobate **55.16 × 108.63 m**, dipteral
- **155 columns**, in **four** sizes and types
- **24** columns along each flank in a double row; **triple** colonnades at the
  facades; **8** east, **9** west
- column height **20 m**, marble, on a poros structure
- shafts **unfluted** — unusual, and the single most distinctive thing about this
  building; the earlier Rhoikos temple *was* fluted
- bases with **horizontal fluting** on spira and torus (the Samian base)
- a carved, **painted band** at the head of each shaft
- **Ionic volute** capitals outside, **ovolo** capitals inside
- the architrave was **wooden** — which is why the intercolumniations can be so
  wide, and why there was never a continuous stone frieze at this scale
- one column survives in situ on the south flank

The plan closes on exactly 155. The reconciliation is written out in
`params.js`; the short version is that the ring counts and porch figures are
fixed by the sources, leaving the cella colonnades as the only free variable, and
2 × 9 is what balances the sum.

## The sanctuary

All **34 numbered monuments** from the official ODAP key are present as
footprints — temples, stoas, baths, the basilica, the gate, the fountain, the
cistern, the statue bases and sculptural groups, and the Sacred Way. The **Site
map** view gives you the whole thing from above, north up, numbered.

Only the Great Altar is built up rather than drawn flat, because its wall height
is attested. Everything else stays a footprint deliberately: inventing elevations
for thirty-three more buildings would bury the one reconstruction that is
actually argued for.

Attested within the sanctuary:

- **Dipteros I (Rhoikos)** 52.5 × 105 m, and Dipteros II built **42 m further
  west** (Samos 21.1: *"der Errichtung des Dipteros II 42 m weiter westlich"*).
  The two footprints overlap, which is right — the later foundations partly
  overlie the earlier building.
- **Hekatompedos** "one hundred feet" at 5:1, inside Dipteros I, its axis **3 m
  south** of the east–west line through the altar's centre, facing the sunrise.
- **Great Altar** 36.5 × 16.5 m, wall 5–7 m, walled on three sides and open west
  toward the temple — which is *why* the temple faces east.
- **Corinthian temple** 7.4 × 12 m. **Sacred Way** 7–8 m wide at its start.

### Where the positions come from

The ODAP booklet's site plan is a raster image, so positions were read off it by
eye at 400 dpi, anchored on the Great Temple's known 108.63 × 55.16 m footprint
(~5.85 px/m). Two checks say the reading holds: re-measuring at a coarser 150 dpi
rendering agreed within ~2 m, and Dipteros I's centre came out ~39 m east of
Dipteros II's against an independently attested 42 m.

So: **±5 m or so.** Good enough to walk the sanctuary and understand what stood
where. Not good enough to set out a trench. Sizes are softer than positions —
only four are from a text source, the rest are eyeballed from the plan.

## What is invented

Everything above column height, and everything inside the walls:

- krepidoma step count and dimensions
- entablature and cornice depths
- cella plan, wall thickness and height
- roof — **off by default**, because the building was never finished and showing
  a complete roof asserts more than the evidence supports
- intercolumniation follows from the attested counts and footprint, so the bays
  (4.56 m flank, 7.35 m front) are derived rather than measured

The provenance dots in the UI mark this per layer. Green is attested, amber
derived, red ours.

## Known gaps

- **No measured plan of this building was available.** Neither DAI plan set in
  the archive covers it — Samos 21.1 stops at the Hekatompedoi, Samos 29 is the
  Roman peripteros. The three publications that would close this are listed in
  `../sources/MANIFEST.md` §5a; one of them is a free download.
- **Corner capitals are wrong.** Real Ionic corners take an angle volute canted
  at 45°; here corners are treated as flank-facing. Conspicuous up close.
- **The cella figure is the least secure number in the model** — it absorbs any
  error in the ring counts silently, since it is what makes the sum reach 155.
- Column entasis, taper and base proportions are plausible archaic Ionic, not
  Samian measurements.
- No terrain. The model sits on a flat plane, not the Heraion's ground surface.
- **Monument positions are ±5 m and sizes are worse.** Read off a raster plan by
  eye. Fine for orientation, wrong for anything that needs metres.
- **Small monuments may be off by their own width**, because labels sit *beside*
  their monument on the source plan rather than on it, and the label is what was
  measured.
- **The pronaos has no antae.** Kienast & Furtwängler excavated the anta wall
  foundation (`Antenwand`) of Dipteros II, so the cella walls demonstrably ran
  east to terminate in antae flanking the porch. The model instead leaves the
  east end open with free-standing columns. This is now an *evidenced* error
  rather than an open question, and it is the highest-value next change.
  See `../sources/MANIFEST.md` §5b.

## Next

The geometry is AR-ready in shape but not in budget — it is generated at full
detail and instanced, which suits a desktop viewer. Before any headset or
handheld work it wants decimation, baked materials, and a GLB/USDZ export path.
Nothing in the structure prevents that; the model is deliberately built as
instanced primitives so LOD is a matter of regenerating at lower segment counts.
