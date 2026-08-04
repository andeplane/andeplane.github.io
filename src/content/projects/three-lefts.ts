import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'three-lefts',
  title: 'Three Lefts',
  description:
    'Eight houses whose geometry is consistent, learnable, and impossible. Three left turns bring you back where you started, and nothing about it is a trick.',
  tags: ['TypeScript', 'Three.js', 'WebGL', 'Geometry', 'Game'],
  liveUrl: '/demos/three-lefts/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/three-lefts',
  screenshot: '/projects/three-lefts/preview.png',
  longDescription: `
You walk around a corner, and around again, and around again, and you are back where you
started having turned only three times. Nothing warps, nothing moves when you look away,
and none of it is a trick. The house is simply not built in the space you assumed you were
standing in, and it never was.

## There is no world space

That is the one decision the whole thing rests on. Nothing anywhere holds a global
position. The world is a *graph*: rooms are nodes with their own private coordinate
systems, doorways are edges labelled with a rigid transform, and the player's position is
always \`(cell, local x/z)\` — never a point in some containing space.

A door between rooms induces the coordinate change \`T = F_B · R_y(π) · F_A⁻¹\`, where each
door frame \`F\` sits at the opening's centre with \`+Z\` pointing into the room. Because
\`R_y(π)⁻¹ = R_y(π)\`, the inverse comes out symmetric for free, which is what makes
portals two-way with no special case.

Walk a loop and compose the transforms you passed through. In a real building the product
is the identity — that is precisely what "geometry is trustworthy" means. Make it anything
else and the loop refuses to close. **Every impossibility in the game is that one
statement and nothing else**: a ring of three rooms each turning 90° closes after 270°,
so three lefts bring you home; a ring of five closes after 450°, so four lefts are not
enough and there is a room in the excess that Euclidean space has nowhere to put.

## The house never lies

The whole thing is only worth thinking about if it is honest, so honesty is enforced
mechanically. Every authored loop declares its expected holonomy, and the check runs at
level load, in the browser, printing to the console every time. A door nudged two
centimetres would make a loop drift, and the player would have no way to tell that from
the impossibility being the point. It is a load failure, not a mystery.

The eight levels escalate through the vocabulary: angle defect, then a corridor glued to
its own far end, then a Penrose staircase realised exactly — four flights and four
landings, \`S⁴\` with a quarter turn, so \`(I + R + R² + R³)t = 0\` kills the horizontal
part and the holonomy is a pure \`−4.2 m\` of vertical that you climb forever without
gaining.

Later ones are harder to hold in your head. A ring of eight rooms where four lefts draw a
*flawless* square on your map and leave you in a room you have never been in — the
notebook is perfect and still wrong, and only chalk can tell you. A single glasshouse
whose four doorways lead back into itself, where going out and back is not the same
journey as back and out: two loops that each close and do not commute, the commutator
coming to 28 metres of pure translation. And a hall with three doors side by side that all
open onto one green room, which is three green rooms.

## Rendering, and what portals forbid

The portal pass replaces three.js's render loop entirely — recursive stencil rendering,
depth 3, hand-driving \`renderer.render()\` per cell with explicit stencil and clipping
state.

The governing constraint is that **no screen-space technique may sample across a portal
boundary**. SSAO, SSR, TAA and screen-space shadows all read neighbouring pixels, and
across a doorway edge the neighbouring pixel is in a different room; they smear and ghost
at exactly the seam the player is staring at. That rules out the cheap route to looking
good, so the look comes from baked vertex AO, a purpose-built environment map, and MSAA —
the only anti-aliasing that qualifies.

Sound obeys the same graph. Audio travels the portal edges rather than any space the rooms
sit in, so a lantern two rooms away arrives from the direction the *graph* says. The
listener is nailed to the origin and every source placed in head coordinates, because the
vector from your head to a sound is the only frame a portal transform leaves unchanged —
measured across a doorway crossing, the apparent position moves 0.08 m, against 0.17 m for
an ordinary walking frame. Room reverb is Sabine's equation applied to each room's own
measurements, so the cathedral rings for 3.2 seconds and a cupboard for 0.6 because those
are the sizes they are. A room that measures small cannot sound large by accident.

## Two things that were hard

Triangle winding has to be derived from the shading normal, not from the call site. The
surface generator mixes handednesses — a floor and a ceiling traced with the same sweep
have opposite geometric orientation — and getting it wrong is invisible in the data and
total on screen: every affected face is silently backface-culled and the room renders as
nothing at all.

And the renderer is fill-bound rather than geometry-bound: 115 draw calls and 23k
triangles per frame, but fourteen cell draws onto a half-float 4×-MSAA target, which on a
high-DPI display is a few hundred megabytes of framebuffer traffic. Quality adapts itself
by measuring the frame — resolution first, then samples, then recursion depth — against
the display's *own* refresh period rather than a fixed 60 fps, because under vsync a
healthy frame delta simply is the refresh interval, and comparing to a constant makes the
controller a one-way ratchet that lowers quality and never restores it.
`.trim(),
}

export default project
