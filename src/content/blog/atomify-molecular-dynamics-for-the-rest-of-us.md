---
title: "Atomify: molecular dynamics for the rest of us"
date: "2023-05-14"
description: "How a master's project about drawing atoms turned into a LAMMPS front-end in C++/Qt, and eventually into a molecular dynamics simulator that runs in your browser tab."
tags: ["Molecular Dynamics", "LAMMPS", "C++", "WebAssembly", "Physics"]
---

Atomify is the project I keep coming back to. It started during my master's, it followed me through a PhD, it has been rewritten twice, and it now lives its best life as [a web app](https://andeplane.github.io/atomify) where the entire LAMMPS simulation engine runs inside your browser tab.

This is the story of why it exists.

## It started with drawing atoms

During my master's I was running molecular dynamics simulations, and like everyone else in the field I spent my days staring at numbers scrolling past in a terminal. The actual *physics* — atoms vibrating, crystals cracking, liquids wetting a surface — was invisible unless you exported trajectories and fired up a separate visualisation tool.

So I did what any reasonable procrastinating student does: I spent way too much time on 3D rendering. Getting hundreds of thousands of spheres on screen at interactive framerates is a fun problem (spoiler: you don't draw spheres — you draw camera-facing quads and ray trace the sphere *inside the pixel shader*; I finally wrote that trick up properly in [a later post about ray–surface intersections](#/blog/raytracing-from-sphere-to-quartic-torus)). Watching your own simulation move in real time turned out to be more than eye candy. You *see* the vacuum bubble nucleate. You *see* the crack tip blunting. You form hypotheses faster.

## Then I met LAMMPS

[LAMMPS](https://www.lammps.org/) is the gold standard for molecular dynamics — enormously capable, battle-tested, scriptable. But the workflow for a beginner is brutal. You write an input script in a domain-specific language, run it, get a dump file, load that into a different tool to look at it, realise your thermostat coupling was wrong, edit, rerun, reload. The feedback loop is measured in minutes to hours, and every step has its own file formats and footguns.

I remembered being a n00b. The pain wasn't the physics — it was the *analysis flow*. So the pitch for Atomify was simple:

> One window. Your LAMMPS script on the left, live rendering of the atoms on the right, plots of temperature and pressure updating while the simulation runs. Change a parameter, press play, watch.

The first real version was a desktop application written in **C++ and Qt/QML**, with LAMMPS compiled in as a library and custom OpenGL rendering on top. Being inside the same process as LAMMPS meant Atomify could reach directly into its data structures — per-atom positions, computes, fixes, thermo output — and stream them to the GUI every few timesteps with almost no overhead.

## The physics, briefly

Almost everything in a classical MD code boils down to two ingredients. The first is a potential. The workhorse pair potential — and the one every student meets first — is Lennard-Jones:

$$
V(r) = 4\varepsilon\left[\left(\frac{\sigma}{r}\right)^{12} - \left(\frac{\sigma}{r}\right)^{6}\right]
$$

![The Lennard-Jones potential](/blog/atomify/lj-potential.svg)

*The two-parameter potential behind a shocking fraction of computational physics: σ sets the size, ε the stickiness.*

The $r^{-12}$ term is electron clouds refusing to overlap; the $r^{-6}$ term is the van der Waals attraction. The minimum at $r_{\min} = 2^{1/6}\sigma$ with depth $-\varepsilon$ is where pairs of atoms want to sit — and it's why a box of Lennard-Jones atoms freezes into an FCC crystal if you cool it.

The second ingredient is an integrator. Forces are the gradient of the potential, and velocity Verlet marches the system forward:

$$
\mathbf{r}(t+\Delta t) = \mathbf{r}(t) + \mathbf{v}(t)\,\Delta t + \tfrac{1}{2}\mathbf{a}(t)\,\Delta t^2
$$

$$
\mathbf{v}(t+\Delta t) = \mathbf{v}(t) + \tfrac{1}{2}\left[\mathbf{a}(t) + \mathbf{a}(t+\Delta t)\right]\Delta t
$$

It's symplectic, so energy doesn't drift over millions of steps — which matters when your simulation *is* a long-running statistical-mechanics experiment.

The point of Atomify was never to reimplement any of this — LAMMPS does it better than I ever will. The point was to make the loop from "I wonder what happens if..." to *watching it happen* as short as possible.

## The rewrite: from Qt to the browser

The desktop app worked, people used it in teaching, and it had one fatal flaw: installation. Getting students to download the right binary for the right OS, past the right security warnings, before the first lecture exercise, wastes half the goodwill of a live demo.

The browser fixes distribution completely. And by then the pieces existed: **Emscripten** had matured to the point where compiling a huge C++ codebase like LAMMPS to **WebAssembly** was realistic, and WebGL was more than capable of the rendering.

So the current Atomify is a React + TypeScript app where:

- LAMMPS (the actual, current, full engine — upgraded to the July 2025 stable release) is compiled to WASM with a custom CMake + Emscripten toolchain
- the simulation runs in a **Web Worker**, so a million-timestep run never janks the UI
- rendering happens in [omovi](https://github.com/andeplane/omovi), the WebGL visualiser I extracted from this work, replacing the old Qt/OpenGL layer
- a JupyterLite environment lets you drive simulations from Python notebooks, in the same tab
- examples — water at constant temperature, crack propagation, argon crystals — run with one click

The port had its own lessons. My favourite bug: embind wrapper objects. Every time the TypeScript layer touched a C++ object through the generated bindings, a small wrapper leaked unless you *explicitly* deleted it — invisible in a five-minute demo, fatal after an hour of teaching. The fix was boring and absolute: delete every wrapper after every timestep callback.

Qt signals became `postMessage` protocols, OpenGL became WebGL, and the install instructions became a URL.

## Was it worth a decade?

The thing I set out to fix as a master's student — that the distance between a LAMMPS script and *seeing physics* was too long — is fixed, for me and for anyone with a browser. A student in a lecture can be running a crack-propagation simulation eight seconds after being given a link.

Sometimes helping n00bs out just requires becoming an expert in three different technology stacks first.
