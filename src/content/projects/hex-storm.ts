import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'hex-storm',
  title: 'Hex Storm',
  description:
    'Saturn’s polar hexagon, grown live on your GPU from one eastward jet on a spinning fluid cap. Nothing in the code draws a hexagon — widen the jet and it becomes a pentagon.',
  tags: ['TypeScript', 'WebGPU', 'Physics', 'Simulation', 'Fluid Dynamics'],
  liveUrl: '/demos/hex-storm/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/hex-storm',
  screenshot: '/projects/hex-storm/preview.png',
  longDescription: `
Saturn's north pole is ringed by a jet stream that blows eastward at about 100 m/s, and
the edge of that jet is a hexagon 30,000 km across. Voyager saw it in 1980, Cassini
photographed it for thirteen years, and it has not changed shape. This simulation grows
one from scratch, in the browser, from two-dimensional fluid dynamics on a rotating polar
cap — and lets you turn it into a pentagon, a square or an octagon by changing one thing:
how wide the jet is.

## What is being computed

The vorticity equation for an incompressible layer on a "γ-plane", the polar cousin of
the β-plane: the Coriolis parameter falls off as f = f₀ − γr² away from the pole. An
eastward Gaussian jet is maintained by relaxation, standing in for whatever deep process
drives Saturn's. That jet is barotropically unstable, and the fastest-growing sinuous
wave has a wavelength of roughly seven jet widths. How many of those fit around the jet
decides the polygon; for Saturn's numbers the answer is six.

The solver is vorticity–streamfunction with an Arakawa Jacobian (so energy and enstrophy
are conserved and the wave can sit on the jet for hundreds of laps), an FFT Poisson solve
whose 1D transforms each run inside a single workgroup's shared memory, and SSP-RK3 in
time. Every dispatch is WGSL; the CPU only writes a uniform buffer and reads back 256
floats of vorticity around the jet, whose Fourier transform is the "sides" readout.

## What you can do

- Watch the instability grow from noise in the vorticity view, then switch to the
  Cassini view where a passive cloud tracer is stretched into streamlines by the flow.
- Slide the jet width and watch the mode count change, the way Aguiar, Read and
  colleagues did in a spinning water tank in 2010.
- Turn the rotation gradient γ up and down to see what Rossby waves add.
- Drag on the planet to stir in a storm and watch the hexagon act as a transport barrier.

## What it is not

A single 2D layer is the rotating-tank version of Saturn. It reproduces the shape and the
wave selection, but not why the real hexagon is stationary in the planet's frame or how
deep it goes — those need a stratified, three-dimensional atmosphere.
  `.trim(),
}

export default project
