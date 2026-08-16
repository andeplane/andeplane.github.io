# Tube Acoustics Lab

A real 2D acoustic FDTD simulation of a tube with holes: strike the closed left end,
watch the overpressure pulse travel down the interior, meet a side hole or the open
right end, and see how much continues, how much radiates into the atmosphere, and how
much reflects back. Not an animation — the solver is the linearized acoustic wave
equation on a staggered (MAC) grid over the whole 2D domain (tube interior + walls +
surrounding air), so hole diameter and position change the actual physics, not just
the drawing.

Standalone Vite app; built into the site by `scripts/build-demos.mjs`.

- `npm run dev` — local dev server
- `npm run build` — typecheck + bundle
- `npm run selftest` — solver correctness checks (wave speed, CFL stability, sponge
  absorption, hole-size-changes-transmission), run with `tsx` against plain Node, no
  browser required

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
  wall-clock time scaled by the playback-speed knob (0.01×–1×), with a per-frame
  compute-time ceiling so the UI never locks up; under heavy load playback just falls
  behind the requested speed rather than freezing.
