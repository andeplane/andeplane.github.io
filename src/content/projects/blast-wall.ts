import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'blast-wall',
  title: 'Blast Wall Lab',
  description:
    'A 3D finite element simulation of a brick wall hit by a blast wave. Every mortar joint cracks, slides, bears and crushes for real — change the bond pattern and the crack path changes with it.',
  tags: ['TypeScript', 'WebGPU', 'Physics', 'Simulation', 'Finite Elements', 'Masonry'],
  liveUrl: '/demos/blast-wall/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/blast-wall',
  screenshot: '/projects/blast-wall/preview.png',
  longDescription: `
Set a charge in front of a brick wall and something obviously happens. But *where* does it
break, and why there? This answers that with a real solver rather than an animation of
one: several hundred bricks, each a mesh of hexahedral finite elements, every mortar joint
between them a surface with a cohesive-frictional law, and a blast pulse whose peak
pressure, duration and arrival time come from the charge mass and the standoff. Thousands
of elements and tens of thousands of joint node pairs, stepped on your GPU, in slow motion
down to a thousandth of real time.

## The thing worth seeing

Switch the bond from **løperforband** — the half-brick offset every mason uses — to stack
bond, where the head joints line up, and fire the same charge. The running-bonded wall
holds together in a handful of large pieces: a crack has to staircase down through a bed
joint, along a head joint, and work its way around every brick in its path. The
stack-bonded wall unzips. Continuous vertical cracks run the full height of it and the
wall falls into columns. Nothing in the code knows this is supposed to happen — the crack
path is wherever joints exceeded their strength. It is simply the reason the bond pattern
exists, made visible.

## What you can do

Drag the charge around the scene and watch the shock sphere expand from it, decelerating
from several times the speed of sound toward it, then sweep across the wall face and hit
one end before the other. Change the wall: length, height, half-brick or full-brick
thickness, four bond patterns, free-standing or built in as an infill panel between floor
and ceiling. Click a brick to select it, sweep a cursor across the wall to carve bricks
out, drag a rectangle to cut a window or a doorway, paint pins wherever you want a fixed
support. Then colour the wall by joint damage to see the crack path glowing through the
fuger, or by speed to see what is actually flying.

Every material number is a slider with its literature range behind it: the joint's tensile
strength and cohesion, its friction coefficient, its fracture energy, its crushing
strength, its stiffness, the brick's modulus and density. Drive the tensile strength to
zero and you have a dry-stacked wall held up by nothing but friction and its own weight,
which behaves completely differently. Turn strain-rate hardening off and watch the same
charge do more damage, because masonry really is stronger when you load it fast.

## Why the joints are the model

The standard approach for masonry is simplified micro-modelling, and it is what this uses.
Each brick is grown by half a mortar joint on every side so the units tile the wall with no
gaps, and the real 12 mm mortar layer plus both of its bond surfaces collapse onto a single
surface of zero thickness. The bricks stay near-elastic; everything interesting happens in
the joints — a bilinear cohesive law in tension whose area under the curve is exactly the
fracture energy, Coulomb friction with cohesion carried off by the same damage, and a
compression cap where the mortar crushes and takes a permanent set.

That last one looked like a formality when the model was being built. Reflected blast
pressures are 0.1–1 MPa and masonry crushes around 10 MPa, so why bother? Because a wall
held at top and bottom does not resist by bending — it arches, and an arch concentrates
its thrust onto a sliver of joint at each hinge, multiplying the stress by an order of
magnitude. Without the cap, such a wall turned out to be literally unbreakable. It just
rang.

## Under the hood

Explicit central-difference integration on a lumped mass — no linear solve, and it keeps
running after elements lose all their stiffness, which is the entire reason blast codes are
explicit. The elements are corotational, with the rotation pulled out of the deformation
gradient by an iterative polar decomposition warm-started from the previous step, so a
brick tumbling through the air stays a brick instead of stretching into nonsense. The
critical time step is measured by power iteration rather than estimated, and compared
against the joint springs and the ground contact, because it is not always the element
that governs and being wrong there does not degrade gracefully.

Because every unit sits on one global lattice and is subdivided uniformly, every element in
the model is the same box — so there is exactly one 24×24 stiffness matrix for the whole
wall, and the two sides of every bed joint match node for node, which turns contact from a
search problem into a list. On the GPU the whole model lives in three arenas rather than
twenty buffers, forces are gathered rather than scattered (WGSL has no float atomics, and
gathering is deterministic anyway), and the renderer reads the solver's own position buffer
in its vertex shader, so the geometry never crosses back to the CPU at all.

A self-test suite runs in plain Node with no browser and no GPU. It checks the element's
rigid-body modes and its exact elastic response, that pulling a joint apart peaks at ft and
dissipates Gf, that a **simulated triplet shear test** recovers the cohesion and friction
angle it was given from the fitted failure envelope, that linear momentum is conserved to a
part in a million, that the measured critical time step really is critical — and, because
it is the whole claim of the demo, that the same charge really does break a stack-bonded
wall into more pieces than a running-bonded one.
  `.trim(),
}

export default project
