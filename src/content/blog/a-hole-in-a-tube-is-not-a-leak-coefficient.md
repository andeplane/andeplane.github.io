---
title: "A hole in a tube is not a leak coefficient"
date: "2026-08-17"
description: "Strike a tube with a hole in it and something obviously happens at the hole. Working out what, without asserting the answer: a 2D acoustic FDTD solver over the whole air domain, where the hole is a gap in the wall and everything else falls out."
tags: ["Physics", "Simulation", "Acoustics", "TypeScript", "Canvas"]
---

Hit one end of a tube that has a hole in its side. A pressure pulse runs down the bore at the speed of sound, reaches the hole, and — then what? Some of it keeps going. Some of it escapes. Some of it comes back. Everyone knows that much. The interesting question is *how much of each*, and whether making the hole bigger changes it in the way you'd guess.

**[Open the lab](/demos/tube-sim/)** — hit the left end and watch, at a thousandth of real speed.

## The shortcut that assumes the answer

The tempting way to model this is one-dimensional. Treat the bore as a line, march a pulse along it, and when it passes the hole, multiply by some transmission factor $\tau$: a fraction $\tau$ continues, the rest is gone.

That gives you a number, and the number is whatever you typed in. There is no mechanism in it. It cannot show the escaping wave as a *shape*, because the escaping wave doesn't exist anywhere in the model — it's a subtraction. It cannot show diffraction around the rim, or that the radiation leaves the hole with a direction. Above all, it can't tell you how transmission depends on hole diameter, because that dependence *is* $\tau$, which you chose.

If the question is "what does the hole do", a leak coefficient is a way of writing down your assumption and reading it back.

## Solve the air instead

So: no 1D bore. The simulation is the whole two-dimensional region — the air inside the tube, the wall, the atmosphere outside, the space below the hole — on one grid, with the linearised acoustic equations everywhere:

$$\frac{\partial p}{\partial t} = -\rho c^{2}\,\nabla\cdot\mathbf{u}, \qquad \frac{\partial \mathbf{u}}{\partial t} = -\frac{1}{\rho}\,\nabla p$$

Pressure and velocity leapfrog: update $p$ from the divergence of $\mathbf{u}$, then $\mathbf{u}$ from the gradient of the $p$ you just wrote. They live on a staggered (MAC) grid — $p$ at cell centres, the velocity components on the faces between cells, half a cell offset. That offset is what makes the finite differences second-order accurate on a stencil one cell wide, and it's also what makes the wall condition trivial, which is the next point.

The time step is fixed by stability. Two-dimensional leapfrog needs $c\,\Delta t/h \le 1/\sqrt{2}$; I run at half that:

$$\Delta t = \frac{1}{2}\cdot\frac{h}{c\sqrt{2}}$$

leaving margin for the damping layer stacked on top.

## What a wall is

A rigid wall is not a special case in the solver. It's a set of cells marked solid, and the rule that any velocity face touching a solid cell is zero. Air can't cross a face whose normal velocity is held at zero, which is the entire no-penetration condition. There is no separate reflection code.

![Pressure at cell centres, velocity on faces; a wall is the faces you zero](/blog/tube-sim/staggered-grid.svg)

And that's the payoff: **the hole is not a feature, it's an absence**. Where the hole is, those cells simply aren't marked solid, so their faces are never zeroed, so the same two update lines run there that run in the middle of the bore. Nothing in the code knows that a hole exists. The open end of the tube is the same non-thing. So is a capped end, which is just a rectangle of cells I did mark solid.

That's what makes the result worth trusting: when a bigger hole lets less through, that isn't a parameter, it's an outcome.

## The canvas edge has to not exist

One real difficulty: the grid ends. A wave that reaches the boundary of the domain will reflect off it, and that reflection is a pure artefact — a wall the physical scene doesn't have, sitting a few centimetres outside the tube, sending energy back in.

The fix is a Cerjan sponge: in the outer ~18 cells, multiply $p$ and $\mathbf{u}$ by a factor slightly below one each step, ramping in smoothly from the interior. A wave entering the layer decays before it reaches the edge, and the reflection off the ramp itself stays small because the ramp is gradual. It's cruder than a split-field PML, and adequate here — the test measures late-time residual at 0.67% of the peak, well below anything you could see.

The field is also *drawn* fading to nothing across that layer, so the rectangular edge of the domain never appears on screen. Waves die away into "somewhere else", which is what the sponge physically means.

## What actually happens at the hole

![The compression front arriving at the hole, with a plume pushing out through the neck](/blog/tube-sim/hole-close-up.png)

The compression front (orange) arrives, and while it's over the gap it drives air out through the neck — the plume below the wall. Behind it, blue: the rarefaction that follows, and behind that the ringing left over from the strike. Part of the front continues down the bore to the right, at reduced amplitude. Part reflects back toward the strike point.

Widen the hole and the split moves: more escapes, less continues. That relationship is measured rather than typed in, and it's the check I care most about in the test suite — a 90 mm hole leaves 347 Pa downstream where a 10 mm hole leaves 395 Pa, and radiates 122 Pa into the atmosphere below where the small one radiates 19 Pa.

## The end of the tube is the other half of the story

I built this to look at the hole, and then spent most of my time looking at the far end, because the far end does something that reads as counterintuitive until you see it twice.

An open end is a *pressure release*. The air in the bore opens onto an atmosphere that can't sustain the overpressure, so $p \approx 0$ there, and a compression arriving at an open end reflects **inverted** — it comes back as suction. A rigid cap is the opposite: the air can't move, pressure doubles at the wall, and the pulse returns with the sign it left with. In impedance terms, with $R = (Z_2 - Z_1)/(Z_2 + Z_1)$, the cap is $Z_2 \to \infty$ and $R \to +1$; the open end is $Z_2 \to 0$ and $R \to -1$.

Here's one meter, a third of the way down a plain tube, in both cases. Same strike, same tube, only the far end differs.

![Open end: the pulse returns inverted, as a shallow negative dip](/blog/tube-sim/open-end-trace.png)

![Closed end: the pulse returns with the same sign and nearly the same size](/blog/tube-sim/closed-end-trace.png)

Both traces show the incident pulse at ~1.5 ms as a clean spike of about +290 Pa. The difference is at ~4.5 ms, when the round trip to the far end and back completes. With the end capped, the meter sees another full positive peak — the pulse came back the way it left. With the end open, it sees a shallow *negative* trough instead: inverted, and much smaller, because most of that energy didn't reflect at all, it radiated out of the mouth and left.

The measured version, from the test suite: +400 Pa returning from the cap, −86 Pa returning from the open mouth. The sign flip and the radiated loss, both, from one rectangle of solid cells.

## Three milliseconds is not a spectator sport

A pulse crosses a metre of tube in about 3 ms. The whole event — strike, hole, far end, reflection back — is over in ten. At real speed you see a flash.

So the playback speed ladder runs down to 0.0001×, where that one-metre trip takes half a minute and you can watch the wavefront cross the edge of the hole. That's slow enough that a *display frame is a fraction of one physics step*, which is why the accumulator keeps its fractional remainder between frames instead of rounding — otherwise the bottom of the ladder silently becomes some other speed.

The same mismatch, in reverse, is a trap for the meters. At 1× a single frame covers thousands of solver steps. A meter that sampled once per rendered frame would be sampling a waveform with kilohertz content at 60 Hz, and drawing the alias with total confidence. So the meters sample inside the stepping loop, on the *simulation* clock, every 5 µs of simulated time — and the recorded $p(t)$ is then identical whether you watched it at 1× or at 0.0001×. When there are more samples than pixels, the trace is drawn as a per-pixel min/max envelope, so a fast oscillation shows up as a band rather than a smooth line that isn't there.

## What this model is not

It's 2D. A slot in a plane, not a hole in a cylinder — so the radiation impedance isn't a real pipe's, and the numbers above are the right shape rather than the right values for hardware. It's linearised, so it has nothing to say about the nonlinear regime of a genuinely loud transient. And it has no viscous or thermal boundary layer at the walls, which is exactly where a real tube loses its high frequencies, so this bore rings longer and brighter than brass would.

None of that touches the question it was built for — where the energy goes at a hole and at an end — but it's the difference between a simulation you can reason with and one you can machine parts from.

## Checking it against something

The demo ships a test suite that runs on plain Node, no browser:

- A pulse in a plain tube travels at **344.8 m/s** against $c = 343$ — 0.5% out, which is discretisation, not a bug.
- Nothing goes non-finite over 20,000 steps, and the field stays bounded.
- The sponge leaves **0.67%** of the peak as late-time residual.
- A big hole transmits less downstream and radiates more outside than a small one.
- A meter records the pulse arriving at 4.02 ms where the speed of sound says 3.86 ms.
- A capped end returns +400 Pa; an open end returns −86 Pa.

The first one is the honest calibration: it tells you the grid is fine enough to be believed to about half a percent, and everything else is measured on top of that.

**[Go hit the tube](/demos/tube-sim/)** — drop a meter before the hole and another after it, cap the far end, and watch the sign of what comes back.
