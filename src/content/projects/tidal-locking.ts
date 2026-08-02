import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'tidal-locking',
  title: 'Tidal Locking',
  description:
    'A soft-body moon, Newtonian gravity, and a little internal friction. Nothing in the code says lock — it happens anyway.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'Simulation', 'WebGL'],
  liveUrl: '/demos/tidal-locking/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/tidal-locking',
  screenshot: '/projects/tidal-locking/preview.png',
  longDescription: `
Why does the Moon always show us the same face? The usual explanation involves a tidal
bulge, a phase lag and a torque, and it is correct — but stated that way it asserts
everything interesting in it. So this simulation implements only the ingredients and
watches what happens.

There is no tidal-force term anywhere in the code, no torque term, and nothing that checks
whether the moon is locked.

## The model

A point-mass planet, and a moon of about 200 point masses joined to their neighbours by
roughly 1,200 springs with dashpots. Every particle feels ordinary inverse-square gravity
toward the planet, and the planet feels every reaction, so it moves too. Each bond pulls
with \`F = -k(|d| - L₀) - c(ḋ·d̂)\` — Hooke's law plus a dashpot on the rate of change of
bond length, which is the only irreversibility in the whole model. Integration is velocity
Verlet with forces evaluated at the half-step velocity, since plain Verlet assumes forces
depend only on position and a dashpot does not.

Because the moon's near side is closer to the planet than its far side it gets pulled
harder and the body stretches. Because the springs are lossy the bulge cannot keep up, and
on a moon spinning faster than it orbits it is dragged slightly ahead of the planet
direction. Gravity then has something off-axis to pull on, and that pull is a brake. A
thousand orbits later the moon is locked.

## The part that makes it honest

The dashpot acts strictly along the bond axis, which makes it a central force: equal and
opposite, directed along the line joining the two particles. It therefore conserves
angular momentum exactly. Damping with any component perpendicular to the bond would be
friction against an absolute frame — it would slow the moon's rotation directly, and the
simulation would "demonstrate" tidal locking by quietly applying a brake.

The check is on screen: **total angular momentum holds to about one part in 10¹⁴** over
tens of millions of steps, while the moon's spin angular momentum drains measurably into
the orbit and the moon recedes. Energy is not conserved — it becomes heat inside the moon,
which is exactly the point.

Slide the internal friction to zero and the locking very nearly stops, while the bulge
stays exactly where it was.

## Two things that were harder than expected

A few hundred randomly placed points carry an intrinsic quadrupole asymmetry of order
1/√N — around 7%, which is several times larger than the 0.25% tidal bulge. Left alone the
moon locks because gravity has caught a *permanent* lump, the way a lopsided asteroid
does, and the lock time stops responding to the material constants at all. The rest shape
is squashed until its second-moment tensor is isotropic.

And released as an unstressed sphere the moon must grow a tidal and a centrifugal bulge at
once, and overshoots — so the opening orbits are a ring-down that looks precisely like the
phenomenon. It is settled under heavy damping first, then its velocity field is projected
onto the rigid-body motion carrying the same momenta, before the clock starts.

## Rendering

Planet and moon are real NASA data: Blue Marble and Black Marble for the Earth, the
LRO/LOLA CGI Moon Kit for the Moon. Procedural surfaces were tried first and never read as
the real thing. Clouds and atmosphere are still shaders, since a static cloud map is the
clearest tell that a globe is a texture ball.

The moon is drawn by pushing an icosphere through the soft body's deformation gradient in
a vertex shader — the tidal response is affine to good accuracy, so one 3×3 matrix
reproduces the whole surface deformation and the normals follow from its inverse
transpose. Shading uses the McEwen lunar-Lambert law that USGS ISIS uses for lunar
imagery, which reduces to Lommel–Seeliger at full phase and so has no limb darkening —
which is why a real full moon reads as a flat disc rather than a shaded ball.

Physics runs in a Web Worker; the scene draws at 60fps while the integrator saturates a
core.
  `.trim(),
}

export default project
