import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ising',
  title: 'Ising Lab',
  description:
    'Millions of magnetic spins on your GPU, one temperature slider, and a real phase transition at T = 2.269. Quench it, paint on it, and measure Onsager’s exact curve from your own experiment.',
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
and hands you the one control that matters: temperature.

## What you can do

Drag T through the critical point and watch the lattice cross from thermal static to
spontaneous magnetization — near T꜀ ≈ 2.269 the fluctuations have no characteristic
size, and at millions of spins that scale-free structure is actually *visible*, which
is exactly what 100×100 Ising demos can never show. Quench it and watch domains
coarsen. Paint spins with the mouse and watch your drawing erode. Sweep an external
field below T꜀ and trace a hysteresis loop live.

Every chart is measured from the simulation you are running: magnetization,
susceptibility, energy, and heat capacity accumulate per-temperature statistics as you
explore, with Onsager's exact 1944 solution drawn underneath for the square lattice.
Your dots land on his curve.

## Three lattices, one transition

Square, triangular, and honeycomb lattices each order at a different exact critical
temperature (2.269, 3.641, 1.519 — geometry decides where), but the shape of the
transition is identical: the same β = 1/8 on all three. That is universality, and you
can verify it by eye.

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
