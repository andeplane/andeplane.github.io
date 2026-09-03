# Blast Wall Lab

A 3D finite element simulation of a masonry wall hit by a blast wave. Not an animation of
one: every brick is a mesh of hexahedral elements, every mortar joint is a surface with a
cohesive-frictional law that cracks, slides, bears and crushes, and the load is a
Friedlander pulse whose peak, duration and arrival time come from the charge mass and the
standoff. Change the bond pattern and the crack path changes, because the crack path is
solved rather than drawn.

Standalone Vite app; built into the site by `scripts/build-demos.mjs`. Needs WebGPU.

- `npm run dev` — local dev server
- `npm run build` — self-tests, typecheck, bundle
- `npm run selftest` — physics validation in plain Node, no browser and no GPU

## The modelling choice

Simplified micro-modelling, the standard approach for masonry (Lourenço & Rots). Each
brick is grown by half a fuge on every side so the units tile the wall with no gaps, and
the real mortar layer plus both of its bond surfaces collapse onto a single surface of
zero thickness. The bricks stay near-elastic; all the nonlinearity lives in the joints,
which is both the physical truth for masonry and the reason the model is worth building.

Two consequences run through the whole codebase:

- **Every element is the same box.** Units sit on one global lattice with spacing
  (dx, dy, dz) and are subdivided uniformly, so there is exactly ONE 24×24 element
  stiffness matrix for the entire model — the internal force is a shared matvec, not
  per-element integration.
- **A joint is a list of node pairs, not a contact problem.** Because a half-brick offset
  is a whole number of lattice steps, the two sides of every bed joint match node for
  node. No surface search, no projection, no master/slave. This is the single decision
  that makes the rest easy, and it is why bricks are laid on the lattice rather than
  dragged anywhere you like.

## Physics notes that matter to the code

- **Integration**: explicit central difference on a lumped diagonal mass. No linear
  solve, no equilibrium iterations, and — the reason blast codes are explicit — it keeps
  running when elements lose all their stiffness, which is exactly what happens when a
  wall comes apart. `src/physics/solver.ts` is the reference; `src/gpu/shaders/sim.wgsl.ts`
  is the same maths in WGSL.
- **Elements**: corotational trilinear hexes. The rotation is pulled out of the
  deformation gradient with Müller's iterative polar decomposition, warm-started from the
  previous step so it converges in one or two iterations. Without it, a brick tumbling in
  flight develops enormous fictitious strains and tears itself apart. Full 2×2×2 Gauss,
  so there is no hourglass control to get wrong.
- **Joints**: a bilinear cohesive law in tension (linear to `ft` at δ₀, straight down to
  zero at δf = 2Gf/ft, so the area under the curve is exactly the fracture energy),
  Coulomb friction with cohesion carried off by the same damage, and a compression cap at
  `fc` that takes a permanent set. Unloading runs back to the origin, because damage is
  expressed as a loss of secant stiffness.
- **The compression cap is not optional.** Reflected blast pressures are 0.1–1 MPa and
  masonry crushes around 10 MPa, so the cap looks like a formality — it is not. A wall
  held top and bottom resists by arching, and an arch concentrates its thrust onto a
  sliver of joint at each hinge, multiplying the stress by an order of magnitude. Built
  without the cap, such a wall was literally unbreakable; it just rang.
- **Time step**: measured, not estimated. `criticalStep` power-iterates the element's
  highest natural frequency and compares it against the joint springs and the ground
  contact; whichever governs wins. It is not always the element, and being wrong here
  does not degrade gracefully.
- **The load**: modified Friedlander, `p = Pr(1 − τ)e^(−bτ)`, with peak overpressure and
  positive-phase duration from the Kinney & Graham fits and the reflected peak from
  Rankine–Hugoniot. The CONWEP blend gives each face its pressure by incidence angle, so
  a face pointing away feels nothing and the wave sweeps across the wall instead of
  arriving everywhere at once. Arrival times integrate dR/U(R), so the front leaves the
  charge at several times the speed of sound and slows toward it — the drawn shock sphere
  reads the same table, so the picture and the load cannot disagree.
- **Strain rate**: a logarithmic DIF on `ft` and `c`, anchored on the measured masonry
  numbers (mortar tensile strength roughly triples at 1 s⁻¹, brick compressive strength
  more than doubles by 150 s⁻¹). There is a switch because turning it off visibly changes
  the answer.

## GPU notes that matter to the code

- **Three arenas, not twenty buffers.** WebGPU guarantees only eight storage buffers per
  shader stage; the solver has twenty-odd arrays. They live in one read-only u32 arena,
  one read-only f32 arena and one read-write f32 arena, with every offset computed in
  `src/gpu/layout.ts` and delivered in the uniform block — one place where a shader and
  its buffer can disagree, instead of twenty.
- **Gather, not scatter.** Element and joint kernels write forces into their own slots;
  one kernel per node then walks a precomputed adjacency list and sums what belongs to it.
  WGSL has no f32 atomics, and the compare-and-swap workaround would be slower and give
  up determinism for nothing.
- **The renderer reads the solver's buffers directly.** The wall's index buffer holds node
  indices, so `@builtin(vertex_index)` in the vertex shader *is* the node id and the
  deformed position comes straight out of the arena the integrator writes. There is no
  vertex buffer and no per-frame geometry upload.
- **Two instances make the masonry.** Instance 0 draws each expanded unit full-size in
  mortar grey; instance 1 draws the same triangles shrunk back to the real 228 × 62 mm
  brick and set forward through the thickness. The brick is not enclosed by the mortar, so
  what shows through the gap between bricks is the fuge.

## What the self-tests check

`npm run selftest` runs in plain Node against the CPU reference solver. Every check has
an answer known ahead of time:

- the element's six rigid-body modes carry no force, and uniaxial strain and simple shear
  return (λ+2μ)ε and μγ exactly;
- running bond puts no stussfuge above another and stack bond puts every one above
  another; every joint pair is coincident in the reference state; the lumped mass adds up
  to the wall;
- pulling a joint apart peaks at exactly `ft` and dissipates exactly `Gf`, then carries no
  tension and still bears in compression;
- a **simulated triplet shear test** at four confining pressures recovers the cohesion and
  tan φ it was given, from the fitted failure envelope — the actual lab test, run in the
  solver;
- linear momentum is conserved to 1e-6 over 2000 steps (this is what catches an
  asymmetric internal force), and the measured critical time step really is critical:
  0.9× is stable and 1.25× diverges;
- and the headline claim gets a test rather than a screenshot — **the same charge cracks a
  stack-bonded wall more than a running-bonded one and breaks it into more pieces**
  (fragments counted by union-find over joints that are not fully cracked).

## Known ceilings

Marked in the source with `ponytail:` comments.

- One scalar damage variable couples mode I and mode II, so the mode II fracture energy is
  not independently controllable.
- The compression cap is perfectly plastic: no hardening, no cap softening.
- Node-pair contact handles a joint closing back up, which covers the wall's own
  behaviour, but two fragments that fly into each other pass through. General
  fragment-fragment collision is a broadphase problem, not a joint law.
- Bricks can be removed, pinned or cut away but not dragged to arbitrary positions.
  Off-lattice units would break the node-for-node match that makes a joint a joint.
- Blast clearing and diffraction around the wall's edges are ignored; the pressure is
  prescribed on faces rather than solved for in the air.
