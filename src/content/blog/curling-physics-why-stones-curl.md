---
title: "The physics of a curling stone (and why simple models throw the wrong shot)"
date: "2026-03-22"
description: "Velocity-dependent friction, the late break, and a hundred-year-old open problem about why stones curl the way they do — the physics behind the curling simulator."
tags: ["Physics", "Simulation", "Game", "Three.js"]
---

Joachim and I built a [curling game](https://andeplane.github.io/curling-simulator/) — full matches, WCF scoring, sweeping, hog-line violations, the lot. This post is about the interesting part: the physics. Curling looks like the simplest physical system in sports — a granite disc sliding on ice — and it hides one of the pettiest unsolved problems in classical mechanics.

## Ice friction isn't a constant

Start with a fact every curler knows in their hands: a stone doesn't decelerate uniformly. It glides serenely off the release and then dies quickly at the end. Constant-μ Coulomb friction can't do that; ice friction *rises as the stone slows*. The standard model for ice has

$$
\mu(v) = \mu_0 \sqrt{\frac{v_0}{v}}
$$

The microscopic story: friction melts a nanometre-scale water film under the running band, and the film — which is what makes ice ice — is thinner at low speed, so slow stones grip more. Integrating $\dot{v} = -\mu(v)\,g$ with a realistic release (~2.2 m/s for a draw) gives the familiar profile: a 28-metre glide over ~22 seconds with the deceleration loaded into the finale.

The curl follows the same script, and this is the signature the whole game hangs on: **most of the break happens in the last third of the shot**. Reading it is the core skill — and any simulator that gets it wrong feels immediately fake:

![Two friction models, two very different shots](/blog/curling/trajectory.svg)

*Both stones are calibrated to travel 28 m and finish 1.05 m sideways — numerically integrated with the game's actual model. The constant-μ stone arcs uniformly like a video game; the $\mu \propto v^{-1/2}$ stone holds its line and breaks late, like the real thing.*

## Why does it curl at all?

Here's where it gets delicious. The stone slides on a narrow annulus — the *running band*, ~130 mm across — not its full face. Give the handle a slow clockwise rotation (2–3 turns over the whole shot). Each point of the band has slip velocity $\mathbf{v} + \boldsymbol{\omega}\times\mathbf{r}$: rotation adds a little $+x$ at the front of the band and a little $-x$ at the back. Friction opposes local slip, so the front's friction leans left and the back's leans right:

![Why equal grip means zero curl](/blog/curling/contact-ring.svg)

*If front and back grip equally, the sideways components cancel exactly and the stone goes dead straight. Curl requires a front–back asymmetry.*

So which end grips more? Try the obvious answer: the stone is decelerating, so — like a braking car — load shifts to the *front* of the band. More load, more friction at the front... whose sideways component points **left** for a clockwise stone.

A real clockwise stone curls **right**.

This is the century-old curling paradox: the naive asymmetry argument predicts the wrong sign, and it predicts far too little deflection anyway (an upside-down drinking glass spun the same way *does* deflect the other way — try it on a smooth table). The literature is a genuinely fun fight — thin liquid films carried around by the band, "scratch-guiding" where the front edge scores micro-grooves that the back edge then follows, pivot-slip models where the stone momentarily sticks and swings. A hundred years of papers, and the mechanism is still argued about in *Tribology Letters*. Nobody disputes what the stone does; the dispute is *why*.

## A game engine can't wait for tribologists

For the simulator we need trajectories that match reality, not a settled mechanism. So the game is honest about being phenomenological: the lateral force is written as a fraction of the friction force,

$$
\mathbf{a} = -\mu(v)\, g\, \hat{\mathbf{v}} \;+\; \delta(v)\, \mu(v)\, g\, \hat{\mathbf{n}}, \qquad \delta(v) = \min\!\left(\delta_{\max},\; \delta_0 \frac{v_0}{v}\right)
$$

with $\hat{\mathbf{n}}$ perpendicular to the velocity, the sign set by the handle, and $\delta(v)$ growing as the stone slows — which is what measurements of real stones show. Calibrate $\mu_0$ against hog-to-tee travel times and $\delta_0,\ \delta_{\max}$ against the observed ~1 m of total curl, and you get the blue curve in the figure — plus emergent behaviour curlers recognise: heavy takeout weight runs nearly straight, dying draws hook hard at the end.

**Sweeping** falls out of the same model: brushing warms the ice ahead of the stone, thickening the water film — effectively lowering $\mu$ locally. Hold Space while the stone runs and it travels farther *and* curls less, which is exactly the tactical trade-off real sweepers manage. Angular momentum gets its own decay equation (the band's friction torque bleeds off spin slowly), and **collisions** are impulse-based with restitution and tangential friction, so spin transfers between stones on contact — you can throw a proper tap-back with roll.

## The renderer sells the physics

All of this would be wasted on a top-down view. The Three.js scene — pebbled ice texture, house rings, boards, overhead spotlights with real-time shadows — exists mostly so you can crouch behind the stone at release and *read weight and line* the way a skip does. A ghost-line predictor integrates the same equations as the simulation to show your expected path, which turns the physics model into the game's actual UI.

Two friends, one repo, and a hundred-year-old open problem lovingly swept under a video game. It's the most fun kind of physics: the kind where the correct answer to "why?" is still, honestly, "we're not entirely sure — but here's a model that throws real shots."
