import type { ProjectMeta } from '@/types'

const project: ProjectMeta={
  slug:'pendulum-writer',
  title:'Pendulum Writer',
  description:'Type a name or draw a shape, watch the pendulum amplitudes adjust, and release the frame. Explore the physics and reshape the drawing by editing its oscillations.',
  tags:['Physics','Simulation','Fourier Series','Three.js','TypeScript'],
  liveUrl:'/#/experiments/pendulum-writer',
  screenshot:'/projects/pendulum-writer/preview.png',
  longDescription:`
A wooden cross suspended from four wires, with pendulums swinging in two perpendicular
directions and a pencil at its centre. Their reaction forces move the frame. Could the
right initial conditions make it write a name?

This interactive experiment compares an ideal Fourier construction with a coupled
small-angle mechanical model. The default target is a continuous handwritten **Anders**;
you can type your own name or draw a shape with multiple strokes and fit the machine to it.

Zoom and pan the drawing, inspect the oscillation spectrum, and edit individual amplitudes
and phases. The How it works section draws a simplified A using the same physical model
with just a few pendulums.

The physical model includes the shared frame inertia, gravity, suspension stiffness and
optional viscous damping. A fit determines the initial positions and velocities of the
normal modes; no driving force is applied after release. The fit is scaled to keep every
swing within a conservative 10° bound, and the actual writing size is reported.

The animated apparatus is a schematic: frame travel is magnified and pendulum lengths
are compressed for visibility. Pencil contact, collisions, rotation and large-angle
effects are not simulated. The pen-lift return needs a separate mechanism in a real build.

Download the simulated drawing as SVG or export all initial conditions in SI units.
  `.trim(),
}
export default project
