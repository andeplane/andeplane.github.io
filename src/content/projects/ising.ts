import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ising',
  title: 'Ising Lab',
  description:
    'Millions of magnetic spins on your GPU, one temperature slider, and a real phase transition at T = 2.269. Quench it, paint on it, and compare your samples with exact equilibrium references.',
  tags: ['TypeScript', 'WebGPU', 'Physics', 'Simulation', 'Statistical Mechanics'],
  liveUrl: '/demos/ising/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/ising',
  screenshot: '/projects/ising/preview.png',
  longDescription: `
The Ising model is statistical mechanics distilled to a napkin: spins that point up or
down, neighbors that prefer to agree, and temperature shaking the whole thing. Out of
that austerity comes one of the deepest phenomena in physics — a genuine phase
transition, with spontaneous symmetry breaking, scale-free critical fluctuations, and
universal exponents. This lab runs up to 16.7 million of those spins in a browser tab
and lets you explore temperature and field. A spin is a two-state magnetic variable;
magnetization is the average of those ±1 values. Slider temperature is measured in
neighbor-coupling units, not kelvin. The finite lattice rounds the infinite-system transition.

## What you can do

Drag T through the critical point and watch the lattice cross from thermal static to
spontaneous magnetization — near T꜀ ≈ 2.269 the fluctuations have no characteristic
size, and at millions of spins that scale-free structure is actually *visible*, which
lets you inspect a wider range of domain sizes than on a small lattice. Quench it and watch domains
coarsen. Paint spins with the mouse and watch your drawing erode. Sweep an external
field below T꜀ and trace a hysteresis loop live.

Every chart is measured from the simulation you are running: magnetization,
susceptibility, energy, and heat capacity accumulate per-temperature statistics as you
explore, with infinite-square-lattice, zero-field reference results, including the Onsager
critical temperature and Yang spontaneous magnetization curve. Finite-size effects and
sampling error remain. The susceptibility chart uses the |m| fluctuation convention,
explained in the lab’s theory panel.

## Three lattices, one transition

Square, triangular, and honeycomb lattices each order at a different exact critical
temperature (2.269, 3.641, 1.519 — geometry decides where), but they share the leading
magnetization exponent β = 1/8. That is universality; it does not make the entire
curves identical. Estimating an exponent takes a scaling study, not just visual comparison.

Try a square lattice at zero field, hold T well below the transition, and let |m|
settle. Reset and repeat above it. Then compare sizes near T꜀, where equilibration
is slow and the peaks are most sensitive to finite size.

## Under the hood

Checkerboard Metropolis/Glauber in WGSL compute — the triangular lattice is not
bipartite, so it updates in three sublattices rather than two; getting that coloring
wrong is silently wrong physics, not a crash. Counter-based pcg4d randomness (no RNG
state array), integer parallel reductions for the observables (f32 accumulation over
16.7M spins would bias the fluctuation formulas), and a non-blocking readback ring so
measurement never stalls the frame loop. Validated against exact results: an in-app
self-test checks the energy limits, the Onsager curve, and each lattice's T꜀.
  `.trim(),
}

export default project
