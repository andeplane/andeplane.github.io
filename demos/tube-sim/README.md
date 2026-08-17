# Tube Acoustics Lab

A real 2D acoustic FDTD simulation of a tube with holes: strike the closed left end,
watch the overpressure pulse travel down the interior, meet a side hole or the open
right end, and see how much continues, how much radiates into the atmosphere, and how
much reflects back. Not an animation — the solver is the linearized acoustic wave
equation on a staggered (MAC) grid over the whole 2D domain (tube interior + walls +
surrounding air), so hole diameter and position change the actual physics, not just
the drawing.

Standalone Vite app; built into the site by `scripts/build-demos.mjs`.

Click the air to drop pressure meters and read p(t) where you want it; slow the
playback to 0.001× and the few milliseconds the whole event takes stretch into
something you can actually watch.

- `npm run dev` — local dev server
- `npm run build` — typecheck + bundle
- `npm run selftest` — solver correctness checks (wave speed, CFL stability, sponge
  absorption, hole-size-changes-transmission, meter timing, open-vs-closed reflection
  sign), run with `tsx` against plain Node, no browser required

## Physics notes that matter to the code

- **Formulation**: pressure-velocity leapfrog FDTD, `∂p/∂t = -ρc²∇·u`,
  `∂u/∂t = -(1/ρ)∇p`, on a MAC grid (`p` at cell centers, `u` components on cell
  faces, half a cell offset from `p`). See `src/sim/solver.ts`.
- **Rigid walls**: any velocity face touching a solid cell is forced to zero every
  step — that's the entire no-penetration boundary condition, no separate reflection
  logic needed.
- **Holes and the open end are real openings** in the wall mask (`src/sim/geometry.ts`
  builds it), not a leak coefficient — energy splits between what continues past the
  gap and what escapes through it because the solver sees genuine 2D geometry on both
  sides.
- **The far end can be capped** (`TubeParams.endClosed`), which adds a wall rectangle
  across the mouth and nothing else: the solver has no notion of "ends". That the
  reflection then comes back un-inverted (a compression returns as a compression,
  where an open mouth returns it as suction) is a result, not a rule — selftest 7
  measures the sign both ways, and measures that the cap keeps far more of the pulse
  in the tube (~400 Pa returning versus ~86 Pa).
- **Absorbing outer boundary**: a Cerjan-style exponential damping sponge in the outer
  ~18 cells of the domain (`precomputeDamping` in `solver.ts`), tuned so a wave hitting
  it loses ~99.9% of its amplitude before reaching the (otherwise rigid) domain edge —
  verified by `selftest.ts` to leave under 1% residual reflection in practice.
  A simpler choice than split-field PML; adequate because nothing here needs
  PML-grade accuracy, just "the canvas edge doesn't lie to you."
- **CFL**: `dt = 0.5 · h / (c·√2)`, well under the 2D leapfrog stability limit
  `c·dt/h ≤ 1/√2`, with margin left for the sponge damping stacked on top.
- **Grid sizing**: cell size is derived from tube diameter (~24 cells across), and the
  domain always includes enough exterior margin to see radiation from a hole or the
  open end, capped at 480×260 cells so extreme tube params can't blow up the compute
  budget — see `buildGridLayout`.
- **Solver runs independently of display**: a fixed physics `dt` accumulates against
  wall-clock time scaled by the playback-speed knob, with a per-frame compute-time
  ceiling so the UI never locks up; under heavy load playback just falls behind the
  requested speed rather than freezing. The accumulator keeps the fractional
  remainder between frames, so 0.001× is really 0.001× rather than a rounding error.
- **Slow motion is the point**: a pulse crosses a 1 m tube in ~3 ms, so the whole
  event is over in ~10 ms. The speed ladder runs down to 0.0001× (≈30 s per length of
  tube) and defaults to 0.003×; anything faster than ~0.01× and the wave is a flicker.
  At the bottom of the ladder a display frame is a fraction of one physics step, which
  is exactly what the fractional accumulator above exists to handle.
- **Every strike starts from silence**: `strike()` clears the field and resets the
  clock, so what you watch is one clean pulse rather than a hit landing on the
  reverberant tail of the last one.

## Pressure meters

Click anywhere in the air to drop a meter (up to 3); each shows its live reading on
the field and a colored trace in the shared p(t) plot along the bottom, so traces from
different points can be compared on one time base. Hovering the plot reads every trace
at that instant.

To remove one, click the meter itself — hovering it turns it into an × and its readout
into "click to remove", so the affordance is visible rather than something you have to
be told. The grab radius is at least 22 device pixels, well past the drawn dot, because
a few grid cells is a tiny target. Touch has no hover, so each chip in the plot header
also carries an × button; that path is the one that always works. The legend chips are
only rebuilt when the set of meters changes — the readings update in place — because
replacing the DOM under the pointer between mousedown and mouseup swallows the click.

The dock is always on screen at a fixed height, even with no meters placed. It used to
grow on the first click, which re-centred the whole simulation out from under the
pointer that placed the meter — the picture must not move as a result of using it.

Meters sample on the *simulation* clock (`PROBE_SAMPLE_INTERVAL`, 5 µs), inside the
stepping loop rather than once per rendered frame — at 1× a single frame covers
thousands of steps, and a per-frame sample would alias the waveform into nonsense.
Traces draw as a per-pixel min/max envelope once there are more samples than pixels,
so a fast oscillation reads as a band instead of a misleading smooth line.

## Zoom and pan

Scroll (or trackpad-pinch, which browsers report as ctrl+wheel) zooms about the
pointer; two-finger pinch does the same on touch; dragging empty air pans, and `0`
or the "reset view" chip returns to the fit. The view is stored as a zoom factor
plus the *grid fraction* held at the centre of the visible area, not as pixels or
cells — the grid is rebuilt whenever the tube changes, and the view has to survive
that untouched. It is clamped so the domain can never be panned into the void, and
zooming out lands back on exactly the fit rather than near it.

One-finger gestures address the simulation, two-finger gestures address the view.
A press doesn't decide what it is until it moves past the slop or is released, so a
pan never places a meter and a tap never nudges a hole. Scene labels fade out
between 1.6× and 2.6×: they name the whole instrument, and once you're inspecting a
detail most of what they point at is off screen.

## Rendering notes

- The pressure field is drawn **additively** (silence is transparent) with a blurred
  bloom pass under a sharp one, so a wave glows over the geometry instead of painting
  an opaque sheet over it — that's what keeps a weak, spread-out disturbance visible
  without flattening the tube underneath.
- Auto-gain has a fast attack and a slow release with a floor at a fraction of the
  remembered peak: the gain can't chase a decaying field down to where round-off
  noise fills the screen, and the exterior stays honestly fainter than the bore.
- The field fades to nothing across the sponge (`buildEdgeMask`), so the domain's
  rectangular edge never draws itself — waves die away into "somewhere else" rather
  than stopping at a visible line.
- "Show air motion" advects a cloud of dust motes with the local velocity. The
  displacement is amplified (real acoustic displacements here are microns); direction
  and relative magnitude are honest, absolute size is not.
