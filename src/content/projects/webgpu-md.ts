import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'webgpu-md',
  title: 'WebGPU Molecular Dynamics',
  description: 'Real-time simulation of 1–2 million atoms at interactive framerates, entirely in the browser via WebGPU.',
  tags: ['TypeScript', 'WebGPU', 'Simulation', 'Physics', 'WGSL'],
  liveUrl: 'https://andeplane.github.io/webgpu-md',
  repoUrl: 'https://github.com/andeplane/webgpu-md',
  screenshot: '/projects/webgpu-md/preview.png',
  longDescription: `
A high-performance molecular dynamics engine that runs entirely in the browser using WebGPU compute shaders. No server, no native app — the model runs locally. Molecular dynamics advances particle positions using forces
and Newton’s laws. Lennard-Jones particles use a simple pair energy with short-range
repulsion and longer-range attraction; they are a model system, not every kind of atom.
Reported million-particle runs depend on GPU, density, cutoff and steps per frame.
Use the scaling benchmark to measure a particular device.

## Why WebGPU?

Previous browser-based MD simulations were limited by WebGL's lack of compute shaders. WebGPU exposes the GPU's compute pipeline, making it possible to implement the full MD force-calculation loop — neighbour lists, pair interactions, Verlet integration — as GPU kernels written in WGSL. The speedup depends on hardware and workload; a useful comparison must hold particle
count, density, cutoff, precision and simulated steps fixed.

## Pipeline

Every step of the simulation runs on the GPU:

1. **Neighbour list construction** — spatial hashing bins atoms into cells; GPU threads scan nearby cells to build per-atom neighbour lists
2. **Force calculation** — Lennard-Jones pair potential evaluated for all neighbour pairs in parallel
3. **Velocity Verlet integration** — positions and velocities updated; periodic boundary conditions applied
4. **Kinetic energy reduction** — tree reduction on the GPU computes instantaneous temperature

The final atom positions buffer is read directly by the WebGPU render pipeline (zero CPU readback), avoiding a position transfer each frame. Rendering itself still has a cost.

## Features

- Simulate 4K → 4M atoms with built-in scaling benchmark
- SSAO post-processing for depth perception
- Play/pause, step, reset; adjustable temperature, density, and simulation steps per frame
- LAMMPS data file import for custom initial configurations
- Extensible pair style system for adding new force fields
  `.trim(),
}

export default project
