import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'tube-sim',
  title: 'Tube Acoustics Lab',
  description:
    'A real 2D acoustic FDTD solver, not an animation. Strike a tube, watch the overpressure wave hit a hole in slow motion, and see exactly how much continues, escapes, and reflects.',
  tags: ['TypeScript', 'Canvas 2D', 'Physics', 'Simulation', 'Acoustics'],
  liveUrl: '/demos/tube-sim/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/tube-sim',
  screenshot: '/projects/tube-sim/preview.png',
  longDescription: `
Hit a tube at one end and something obviously happens — but *what*, exactly, happens
where the wave meets a hole in the wall? How much keeps going, how much escapes, how
much bounces back? This is a real answer, not an animation of one: the whole 2D air
domain — tube interior, walls, the hole's exterior, the open end's exterior — is
solved with the linearized acoustic wave equation, in slow motion, down to fractions
of a millisecond.

## What you can do

Hit the closed left end and watch a compact overpressure pulse travel down the tube at
the actual speed of sound, meet a side hole, and visibly split: part continues past it
toward the open end, part radiates outward through the hole as a clean expanding
half-ring, part reflects back toward the strike point. A pulse crosses a metre of tube
in three milliseconds, so slow motion isn't a garnish — at 0.001× that trip takes three
seconds, and at 0.0001× it takes half a minute, slow enough to watch the wavefront cross
the edge of the hole. Drag a hole's edges to resize it, or its
middle to reposition it, live, and repeat the strike: a small hole barely dents the wave
passing by; a large one diverts most of it. Cap the far end and the reflection changes
character completely — an open mouth sends a compression back as suction, a rigid cap
sends it back as it left, and the meters show the sign flip as a number. Add a second
hole, change the tube's length or diameter, turn on the drifting air-motion particles to
see *where* the air is actually moving, or just step through frame by frame.

## Measuring it, not just watching it

Click anywhere in the air to drop a pressure meter — up to three, each with its own
color. Every meter shows its live reading right on the field and draws p(t) into one
shared plot along the bottom, so a point before the hole, a point after it, and a point
outside in the atmosphere can be compared on the same time base: the incoming pulse, the
reflection coming back, and how much of it ever made it downstream, as numbers rather
than an impression. Hover the plot to read every trace at that instant, and click a meter to
take it away again. Meters sample on the simulation clock rather than once per rendered
frame, so the waveform is the same whether you watch it at 1× or at 0.0001×.

## Why it isn't a leak coefficient

The easy way to fake a "hole" is a scalar loss term where the wave passes it: some
energy vanishes, none of it goes anywhere in particular. That can't show diffraction,
directional radiation, or how hole *size* changes what fraction of the wave escapes
versus continues — which was the actual point. So the hole here is a real gap in the
wall mask the solver sees, opening onto a real 2D region of exterior air, and the
split between "continues" and "escapes" falls out of the physics rather than being
asserted by a parameter.

## Under the hood

Pressure-velocity leapfrog FDTD on a staggered (MAC) grid — pressure at cell centers,
velocity components a half-cell off on the faces between them. Rigid walls are simply
any velocity face touching a solid cell forced to zero; the hole and the open end are
just gaps in that solid mask, so nothing is hard-coded about how sound behaves at an
opening — it falls out of the same update rule everywhere. Capping the far end simply
adds a rectangle of wall across the mouth; that the reflection then comes back
un-inverted is a measured consequence, not a rule the code was told. The one exception is the
domain's outer edge, which needs to *not* exist as far as the physics can tell: a
Cerjan-style exponential damping sponge in the outer ~18 cells kills a wave's amplitude
before it reaches the boundary, so the canvas edge doesn't lie by reflecting energy
that should have left the scene. The field itself is drawn additively — silence is transparent, so a wave glows over
the geometry instead of painting an opaque sheet across it, and the auto-gain has a
floor so it can't chase a decaying field down until round-off noise fills the screen.
A self-test suite (\`npm run selftest\`, no browser required) checks the measured wave
speed against c, confirms the sponge leaves under 1% residual reflection, checks that
a pressure meter records the pulse arriving when the speed of sound says it should,
and confirms — the one property that actually mattered for this to be worth building —
that a bigger hole quantifiably lets less through and radiates more.
  `.trim(),
}

export default project
