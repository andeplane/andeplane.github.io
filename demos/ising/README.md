# Ising Lab

Millions of Ising spins on WebGPU: a full-viewport lattice, one hero temperature
slider, and a live phase transition. Square, triangular and honeycomb lattices
(different exact T_c, same critical exponents — universality on screen), painting,
quenches, hysteresis, and thermodynamic charts (⟨|M|⟩, χ, ⟨E⟩, C_v) measured from the
running simulation, with Onsager's exact curve overlaid.

Standalone Vite app; built into the site by `scripts/build-demos.mjs`.

- `npm run dev` — local dev server
- `npm run build` — typecheck + bundle
- `npm run reference` — CPU reference Metropolis for physics cross-checks
- open the app with `?selftest` — GPU physics validation logged to the console

Physics notes that matter to the code:

- The triangular lattice is not bipartite: updates use a 3-coloring `(x+y) mod 3`,
  and lattice sizes are ≡ 0 mod 6 so both colorings wrap on the torus.
- Observable reductions accumulate in i32 (spins are ±1); f32 sums over 16.7M terms
  would bias the fluctuation formulas behind χ and C_v.
- Readback never stalls the frame loop: a staging ring with encode-time tags, and
  measurements are discarded for an equilibration window after every disturbance.
