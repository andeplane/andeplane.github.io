---
title: "How fast can molecular dynamics run in a browser now?"
date: "2026-01-06"
description: "WebGPU finally gives the browser real compute shaders. So: neighbour lists, Lennard-Jones forces, and Verlet integration as WGSL kernels — and two million atoms at interactive framerates."
tags: ["WebGPU", "Molecular Dynamics", "Simulation", "WGSL", "Performance"]
---

Ever since I ported [Atomify](#/blog/atomify-molecular-dynamics-for-the-rest-of-us) to WebAssembly, one question kept nagging me. WASM gets you near-native *CPU* speed — but molecular dynamics is embarrassingly parallel, and the GPU sitting in every laptop was unreachable. WebGL could fake some compute with fragment-shader tricks, but no shared memory, no scattered writes, no atomics: no real MD.

**WebGPU changes that.** It exposes actual compute pipelines — storage buffers, workgroups, atomics — through a browser API. So the obvious experiment: write a molecular dynamics engine where *every* step of the physics loop is a WGSL kernel, and see how many atoms a browser tab can honestly move. That became [webgpu-md](https://github.com/andeplane/webgpu-md).

The answer up front: **1–2 million Lennard-Jones atoms at interactive framerates** on an ordinary laptop GPU, with a 4-million-atom mode if you're patient. Roughly 10–50× the same algorithm in JavaScript, depending on system size.

## The only algorithm that matters here

The force loop is where all the time goes. Evaluating the Lennard-Jones potential between all pairs is $N(N-1)/2$ distance checks — hopeless at a million atoms. But the potential is short-ranged: beyond a cutoff $r_c$ (conventionally $2.5\sigma$) the interaction is negligible and skipped.

Enter the classic **cell list**. Divide the box into cells at least $r_c$ wide and bin atoms into them. Any atom's neighbours must then live in its own cell or the ones directly adjacent — a 3×3 block in 2D, 3×3×3 = **27 cells** in 3D:

![Cell lists: search 9 cells, not the whole box](/blog/webgpu-md/cell-list.svg)

*Everything outside the shaded block is provably outside the cutoff and never touched.*

The pair count drops from quadratic to linear: with number density $\rho$, each atom checks about $27\rho r_c^3$ candidates regardless of how big the box is,

$$
\underbrace{\tfrac{1}{2}N^2}_{\text{all pairs}} \;\longrightarrow\; \underbrace{27\rho r_c^3\, N}_{\text{cell list}}
$$

![Why neighbour lists matter](/blog/webgpu-md/pair-count.svg)

*At two million atoms the cell list does ~3000× fewer distance evaluations per step. No GPU can save an $O(N^2)$ loop at this scale.*

## The pipeline, kernel by kernel

Each timestep dispatches four compute passes, one thread per atom:

1. **Binning + neighbour lists.** Atom positions hash to cell indices; an atomic counter per cell builds the bins, then each thread scans its 27 cells and writes a per-atom neighbour list. Spatial hashing means no CPU-side sorting, no readbacks.
2. **Force evaluation.** For each neighbour within $r_c$, accumulate the Lennard-Jones force
$$
\mathbf{F}(r) = \frac{24\varepsilon}{r}\left[2\left(\frac{\sigma}{r}\right)^{12} - \left(\frac{\sigma}{r}\right)^{6}\right]\hat{\mathbf{r}}
$$
The kernel is arithmetic-bound and the GPU eats it happily.
3. **Velocity Verlet integration**, plus periodic boundary wrapping — a trivially parallel kernel.
4. **Kinetic energy reduction.** A tree reduction across workgroups sums $\tfrac{1}{2}mv^2$ so the UI can display instantaneous temperature (and a thermostat can rescale toward a target).

The part I'm happiest with is what's *absent*: readback. The positions buffer that the physics writes is the same buffer the render pipeline reads as its instance data. Simulation and visualisation never cross the PCIe bus — rendering two million glowing spheres (with SSAO so you can actually perceive depth) costs almost nothing on top of the physics.

## What I learned about WebGPU along the way

- **Workgroup size matters less than divergence.** The neighbour-list scan is the most divergent kernel; sorting atoms by cell index (so threads in a workgroup walk similar neighbourhoods) helped more than any tile-size tuning.
- **Atomics are fine.** The binning pass leans on `atomicAdd` per cell and never showed up in profiles.
- **The limits are real but generous.** Buffer size caps and dispatch limits shape how you lay out 4M atoms, but nothing required heroics — this is a real compute API, not a workaround.
- **f32 is enough** for LJ liquids with sensible timesteps ($\Delta t = 0.005$ in reduced units), if you accumulate the kinetic-energy reduction carefully.

There's a scaling benchmark built in — 4K to 4M atoms — plus adjustable temperature and density, LAMMPS data-file import for custom initial configurations, and an extensible pair-style system for adding new force fields.

## Why this feels like a milestone

Fifteen years ago this simulation was a cluster job. Ten years ago, a CUDA workstation. Five years ago, a native app on a good laptop. Today it's a URL: [andeplane.github.io/webgpu-md](https://andeplane.github.io/webgpu-md). Nothing to install, no drivers to match — the same tab that runs your email now integrates Newton's equations for two million atoms.

The next obvious step is hooking kernels like these back into the full LAMMPS-in-the-browser stack, so the interactive engine and the serious engine stop being different things.
