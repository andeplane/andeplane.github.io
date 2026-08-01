import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'tidal-locking',
  title: 'Tidal Locking',
  description:
    'A soft-body moon, Newtonian gravity, and a little internal friction. Nothing in the code says lock — it happens anyway.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'Simulation', 'WebGL'],
  liveUrl: 'https://andeplane.github.io/moon-tidal-lock/',
  repoUrl: 'https://github.com/andeplane/moon-tidal-lock',
  screenshot: '/projects/tidal-locking/preview.png',
  longDescription: `
Why does the Moon always show us the same face? The usual explanation involves tidal
bulges and phase lags and a torque, and it is correct, but it can feel like the answer
was assumed. So this simulation implements only the ingredients, and lets the conclusion
arrive on its own.

There is no tidal-force term anywhere in the code, no torque term, and nothing that
checks whether the moon is locked.

## The model

A point-mass planet, and a moon made of about 200 point masses joined to their
neighbours by roughly 1,200 springs with dashpots. Every particle feels ordinary
inverse-square gravity toward the planet, and the planet feels each reaction, so it
moves too. Each spring pushes along its own axis with \`F = -k(|d| - L₀) - c(ḋ·d̂)\`.
Integration is velocity Verlet with the forces evaluated at the half-step velocity, so
the velocity-dependent dashpot stays second-order.

That is the whole thing. Because the near side of the moon is closer to the planet than
the far side, it gets pulled harder and the body stretches. Because the springs are
lossy, the bulge cannot keep up, and on a moon spinning faster than it orbits the bulge
is dragged slightly ahead of the planet direction. Gravity then has something off-axis
to pull on, and that pull is a brake. Two thousand orbits later the moon is locked.

## The part that makes it honest

The dashpot acts strictly along the bond axis, which makes it a central force: equal and
opposite, directed along the line joining the two particles. It therefore conserves
angular momentum exactly. Damping with any component perpendicular to the bond would be
friction against an absolute frame — it would slow the moon's rotation directly, and the
simulation would "demonstrate" tidal locking by quietly applying a brake.

The check is on screen: **total angular momentum holds to about one part in 10¹⁴** over
tens of millions of steps, while the moon's spin angular momentum visibly drains into
the orbit and the moon recedes. Energy, by contrast, is not conserved — it turns into
heat inside the moon, which is exactly the point. Slide the friction to zero and the
despin very nearly stops.

## Two things that were harder than expected

**The initial condition has to be relaxed.** Released as an unstressed sphere into a
tidal field, the moon must grow a tidal bulge and a centrifugal bulge simultaneously, and
it overshoots. The first orbits are then dominated by a ring-down that has nothing to do
with tidal locking and looks exactly like it.

**The rest shape has to be made isotropic.** A few hundred randomly placed points carry
an intrinsic quadrupole asymmetry of order 1/√N — around 7%, which is several times
larger than the 0.2% tidal bulge. Left alone, the moon locks because gravity grabs a
permanent lump, the way a lopsided asteroid does, and the lock time stops responding to
the material constants at all.

## Rendering

The moon is an icosphere pushed through the soft body's deformation gradient in a vertex
shader. The l=2 tidal response is affine to good accuracy, so a single 3×3 matrix
reproduces the entire surface deformation, normals follow from its inverse transpose, and
a 40k-vertex sphere costs nothing per frame. Surface detail is Worley craters and maria
evaluated in the body's own object space, so features are welded to the moon and you can
watch it turn. Shading is Lommel–Seeliger rather than Lambert — regolith backscatters,
which is why a full moon reads as a flat disc.

The physics runs in a Web Worker at a couple of hundred thousand steps per second while
the scene draws at 60fps.
  `.trim(),
}

export default project
