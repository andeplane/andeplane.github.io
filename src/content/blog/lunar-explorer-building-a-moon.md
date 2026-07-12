---
title: "Lunar Explorer: building a Moon before building the game"
date: "2026-02-08"
description: "Procedural lunar terrain in the browser — fBm heightfields, crater stamping, and LOD chunk streaming — as the groundwork for an Apple Vision Pro lunar lander."
tags: ["Procedural Generation", "Three.js", "WebGL", "Graphics", "Game"]
---

The end goal is unambiguous: a lunar lander experience on Apple Vision Pro that feels *majestic* — you, a spacecraft, and an enormous grey world curving away beneath you. But I didn't start in visionOS. I started in a browser tab, with TypeScript and Three.js, and that's [Lunar Explorer](https://andeplane.github.io/LunarLander/).

The reason is iteration speed. Terrain generation is a tuning problem — you change an octave weight, a crater density, a sun angle, and you need to *see* it. A Vite dev server with hot reload gives a feedback loop measured in seconds; a native visionOS build cycle does not. And with coding agents in the mix, the web stack compounds the effect: the agent edits a shader or a chunk heuristic, screenshots the running page, and iterates while I drink coffee and judge the results like an art critic. Get the Moon right first; port the Moon later.

Right now there is no lander and no game — just a Moon you can fly over. This post is about what it takes to make a convincing one.

## Terrain = fBm + craters

The base heightfield is **fractional Brownian motion**: sum a cheap noise function at doubling frequencies and halving amplitudes,

$$
h(\mathbf{x}) \;=\; \sum_{k=0}^{K-1} a^k\, n\!\left(2^k \mathbf{x}\right), \qquad a \approx 0.5
$$

Each octave contributes detail at its own scale — the first gives continental swells, the last gives gravel:

![Octaves of noise summing to terrain](/blog/lunar-explorer/fbm-octaves.svg)

*Persistence $a$ controls the character: higher and the terrain gets jagged, lower and it goes smooth. The Moon likes ~0.5 with six octaves.*

But fBm alone reads as "generic alien planet", not *Moon*. What sells the Moon is craters, and craters have specific anatomy: a parabolic bowl, a raised rim, and an ejecta blanket that decays away. So a second pass **stamps** them on, at random positions with a power-law size distribution (many small, few large — like the real bombardment record):

$$
h_{\text{crater}}(r) \;=\;
\underbrace{d\left(\left(\tfrac{r}{R}\right)^2 - 1\right)}_{\text{bowl},\; r<R}
\;+\;
\underbrace{h_{\text{rim}}\, e^{-\left(\frac{r-R}{w}\right)^2 / 2}}_{\text{rim}}
\;+\;
\underbrace{h_{\text{ej}}\, e^{-(r-R)/\lambda}}_{\text{ejecta},\; r>R}
$$

![Anatomy of a stamped crater](/blog/lunar-explorer/crater-profile.svg)

*Radial profile of one stamp. Blended into the fBm base with smooth falloff, overlapping stamps compose the way real craters do — newer ones punch through older rims.*

## Streaming an endless surface

A Moon you can fly over indefinitely can't be one mesh. The terrain is split into a grid of **chunks**, generated on demand around the camera:

- **Level of detail:** near chunks get fine tessellation, distant chunks get coarse. Vertex counts drop with distance while screen-space error stays roughly constant.
- **Web Worker generation:** heightfields are computed off the main thread and transferred back — camera motion never stutters on chunk creation.
- **LOD morphing:** when a chunk changes resolution, vertices interpolate between the two levels instead of snapping. Without morphing, the terrain visibly "pops" as you fly; with it, transitions are invisible.
- **Frustum culling** discards chunks outside the view before they're ever submitted to the GPU.

The steady state is a comfortable 60 fps on 2020-integrated-graphics hardware, which was the performance bar I set (if it runs there, Vision Pro will not be the bottleneck).

## Lighting a world with no air

The renderer is where the Moon becomes the Moon:

- **Normals from the heightfield gradient** feed a custom surface shader.
- **Per-vertex ambient occlusion**, baked at generation time, darkens crater floors — cheap and surprisingly effective.
- **A low sun angle** exaggerates relief; the terminator region is where lunar landscapes look best (every Apollo photo you remember was shot there).
- **No atmospheric scattering.** This is the counterintuitive one: on Earth, distance means haze and a bright horizon. On the Moon there is no air, so the horizon *darkens* into black sky. Getting this wrong — adding the usual fog — instantly makes it look like a desert level. The absence of an effect is the effect.

## What's next

The physics half is coming: a lander with real thrust-to-weight numbers, lunar gravity at $1.62\,\mathrm{m/s^2}$, propellant budgets, and the classic suicide-burn problem — plus hand-tracked throttle control on visionOS, where "majestic" gets its real test. The terrain system described here ports over as-is: the math doesn't care whether it feeds WebGL or Metal.

Build the world first. The game can land on it later.
