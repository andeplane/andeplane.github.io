---
title: "Saturn's hexagon from one jet"
date: "2026-08-30"
description: "A single eastward jet on a spinning fluid cap, solved live in WebGPU, grows Saturn's polar hexagon on its own — and turns into a pentagon or an octagon when you change the jet's width. What is in the equations, what is not, and how a Poisson solve fits in four GPU dispatches."
tags: ["Physics", "Simulation", "WebGPU", "Fluid Dynamics"]
---

There is a hexagon on Saturn. It sits on the north pole, each side is about 14,500 km long, and it has been there at least since Voyager flew past in 1980. Cassini watched it for thirteen years and it did not drift, wobble or lose a corner. Planets are not supposed to have corners.

The explanation is not exotic. The hexagon is the edge of a jet stream — an eastward wind of roughly 100 m/s at 78°N — and the six sides are the crests of a wave riding on that jet. What is delightful is that you need almost nothing to make one: in 2010 Ana Aguiar, Peter Read and colleagues at Oxford put water in a spinning tank, drove a ring of it faster than the rest, and got a hexagon. Turn the shear up and it became a pentagon; down, a heptagon. Every polygon from two to eight.

So this is that tank, in a browser. Two-dimensional fluid dynamics on a rotating cap, one forced jet, and nothing in the code that knows what a hexagon is.

**[Run the simulation](/demos/hex-storm/)** — it goes hexagonal in about a minute, and there is a tour.

## The equation

Take a thin layer of fluid on a rotating planet and look straight down at the pole. Two-dimensional, incompressible, so the whole velocity field is a streamfunction $\psi$ and the whole dynamics is the vorticity $\zeta = \nabla^2\psi$ being carried around by the flow it induces:

$$
\frac{\partial \zeta}{\partial t} + J(\psi, \zeta) = 2\gamma\, r\, u_r + \nu \nabla^2 \zeta - \alpha\,\bigl(\zeta - \zeta_{\text{jet}}(r)\bigr) - \sigma(r)\,\zeta .
$$

Left of the equals sign: vorticity is advected. Right of it, four things.

**Rotation.** On a sphere the Coriolis parameter is $f = 2\Omega\sin\phi$, largest at the pole and falling off quadratically with distance from it: $f \approx f_0 - \gamma r^2$. What matters dynamically is that a parcel conserves its *absolute* vorticity $\zeta + f$, so a parcel pushed outward from the pole loses planetary spin and gains relative spin. That is the $2\gamma r u_r$ term, and it is the whole reason Rossby waves exist. (The constant $f_0$ drops out entirely — in barotropic 2D flow it is absorbed by the pressure.) Saturn's numbers give $\gamma \approx 5$ in the simulation's units.

**The jet.** Something in Saturn's interior drives that 100 m/s wind and nobody knows quite what. The simulation does not try: it relaxes the vorticity toward the vorticity of a Gaussian eastward jet at the hexagon's radius (plus a small cyclone on the pole itself, which is also there in the pictures) at a rate $\alpha$. This is Rayleigh damping toward a target state — the standard trick for "forced by something we are not modelling", and the honest reading is that it is also the tank's Ekman friction.

**Viscosity** $\nu$, small, and a **sponge** $\sigma(r)$ that kills motion outside the cap so the periodic box does not matter.

That is everything. There is no term that prefers six.

## Why six

A jet with a smooth velocity profile is unstable if the vorticity gradient changes sign across it — Rayleigh's criterion, with Kuo's correction for $\beta$ (here $2\gamma r$). A Gaussian jet passes easily: the gradient is one sign on the inner flank and the other on the outer. Small wiggles on the flanks feed on the shear and grow.

Which wiggle grows fastest is a classical result: for a Bickley jet $U\,\mathrm{sech}^2(y/L)$ the sinuous mode peaks near $kL \approx 0.9$, i.e. a wavelength of about seven jet widths. Bend the jet into a ring of radius $R_0$ and the wavenumber must be an integer, so the polygon is

$$
m \approx \frac{0.9\,R_0}{L}.
$$

Saturn's jet is a couple of thousand kilometres wide on a ring of radius 12,000 km, and that ratio is where six lives. The simulation's default has $L/R_0 = 0.145$, for which the formula gives 6.2 — and the readout says 6. Sweeping the width on a $512^2$ grid gives 8, 7, 6, 5, 4 sides for $L/R_0 = 0.11, 0.13, 0.145, 0.16, 0.20$, each settling to well over 90% of the wave power in its one mode. The presets on the panel are those five widths and nothing else.

The readout is not a human eyeballing the picture. A tiny compute shader samples vorticity at 256 points around the jet's radius every few frames, the CPU takes a discrete Fourier transform, and the dominant azimuthal wavenumber is the number on screen, together with how much of the wave power it holds.

## What the rotation adds

Set $\gamma = 0$ and a polygon still forms — the tank experiment, after all, worked with almost no $\beta$. So the shape is the jet's, not the planet's. What $\gamma$ changes is the *drift*: the wave is now a Rossby wave, propagating westward relative to the flow, and the polygon rotates more slowly in the planet's frame. On Saturn it is nearly stationary, which is the part a 2D model does not get quantitatively right; the current explanation (Morales-Juberías et al. 2015) needs the jet's vertical structure to slow the wave to a stop. That is out of reach here, and the tour says so.

## The solver

I wanted the wave to be able to sit on the jet for hundreds of laps without numerically bleeding away, which rules out the easy things.

Advection is the **Arakawa Jacobian** — the nine-point finite-difference form that conserves both energy and enstrophy in the semi-discrete limit. It is what weather models used for decades and it is nine lines of WGSL.

The Poisson solve $\nabla^2\psi = \zeta$ is where GPU fluid codes usually cut corners: a few dozen Jacobi sweeps converge on the small scales and never on the large ones, and the large scales are the whole story here. So it is an **FFT**. Each one-dimensional transform of a row or column runs entirely inside one workgroup, the 512 complex values living in shared memory and 256 threads doing the butterflies with a barrier between stages. Rows forward, columns forward with the division by the Laplacian's eigenvalues fused in, rows back, columns back: a full solve is **four dispatches**. Dividing by the eigenvalues of the *discrete* five-point Laplacian rather than $-k^2$ makes the finite-difference velocity exactly divergence-free, which the Arakawa scheme quietly assumes.

Time-stepping is SSP-RK3, three solves per step. At $512^2$ a step is about 0.4 ms on an M-series laptop, so a jet lap takes a few seconds of wall clock at the default speed.

Before writing any WGSL, the same discretisation was written in plain TypeScript (`tools/reference.ts`). Running it at $256^2$ for a sweep of jet widths gave 8, 7 and 6 sides as the jet widened — the ladder was already there on the CPU, and the GPU version only had to agree with it. (It agrees, one rung shifted: a narrow jet on a coarse grid is effectively a little wider, so $256^2$ needs a slightly narrower nominal width for the same polygon.)

## The clouds

The default view is not vorticity. It is a passive tracer being advected semi-Lagrangian by the flow, continuously seeded with fine noise and slowly forgotten, so streaks stretch into streamlines — the same thing Saturn's cloud decks are doing when Cassini photographs them. Anticyclones are brightened and cyclones darkened, which is also roughly what the real clouds do, and a fake relief light makes the streaks read as a surface. A second channel carries concentric bands that are *never* re-seeded; where they stay sharp the jet is acting as a barrier, and after a while the interior of the polygon is visibly a different fluid from the outside. On Saturn it is a different colour.

Drag on the planet and you inject a storm. It gets sheared into a filament and swept around the ring, or if you drop it inside, it stays inside.

## What I would do next

The obvious one is a second layer. A two-layer quasi-geostrophic model is the smallest system in which the wave can be baroclinically slowed, and it is the same solver twice plus a coupling term. If it makes the hexagon stand still, that would be the Morales-Juberías mechanism in a browser.
