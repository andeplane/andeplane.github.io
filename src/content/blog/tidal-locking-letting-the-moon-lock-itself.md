---
title: "Letting the Moon lock itself"
date: "2026-08-02"
description: "A moon of point masses on damped springs, plain Newtonian gravity, and nothing else — no tidal-force term, no torque, no test for synchronicity. It locks anyway, and the angular momentum books balance to fifteen digits."
tags: ["Physics", "Simulation", "Three.js", "WebGL"]
---

The Moon keeps one face toward us. The standard explanation goes: the Earth raises a tidal bulge on the Moon, internal friction makes that bulge lag the Earth–Moon line, and gravity pulling on the misaligned bulge exerts a braking torque until the spin matches the orbit.

That explanation is correct. It also, stated that way, asserts everything interesting in it — the bulge, the lag, the torque. So I wanted to build the thing that *doesn't* assert any of it, and watch.

**[Run the simulation](/demos/tidal-locking/)** — it locks in about five minutes.

## Why you can't simplify your way out

The first thing worth noticing is that a point mass cannot tidally lock at all. Gravity acting on a point exerts no torque about that point:

$$\frac{d\mathbf{L}}{dt} = \mathbf{r}\times\mathbf{F} = \mathbf{r}\times\left(-\frac{GMm}{r^{3}}\mathbf{r}\right) = \mathbf{0}$$

A point-mass moon spins forever at whatever rate it started with. Extent isn't a refinement of the problem — it *is* the problem. So the model has to be an extended body, and once it is extended it has to be deformable, and once it deforms it has to be lossy. Those three ingredients, and nothing else.

## The model

A point-mass planet, and a moon made of 200 point masses joined to their neighbours by about 1,200 springs. Every particle feels ordinary inverse-square gravity toward the planet, and the planet feels every reaction — it moves, which is what makes the barycentre real and lets the orbit expand later. Each bond pulls with

$$\mathbf{f}_{ij} = \Big[\,k\big(\lVert\mathbf{d}\rVert - \ell_{ij}\big) + c\,\big(\dot{\mathbf{d}}\cdot\hat{\mathbf{d}}\big)\Big]\hat{\mathbf{d}}$$

Hooke's law plus a dashpot on the rate of change of bond length. That $c$ is the only irreversibility in the entire model. Integration is velocity Verlet with the forces evaluated at the half-step velocity, because plain Verlet assumes forces depend only on position and a dashpot doesn't.

There is no tidal-force term anywhere in the code, no torque term, and nothing that checks whether the moon is locked.

## The one line the whole thing rests on

The dashpot acts strictly along the bond axis. That makes it a central force, so for each pair

$$\mathbf{x}_i\times\mathbf{f}_{ij} + \mathbf{x}_j\times\mathbf{f}_{ji} = (\mathbf{x}_i-\mathbf{x}_j)\times\mathbf{f}_{ij} = \mathbf{0}$$

Internal forces cannot change the body's angular momentum. Only the planet's gravity can.

This matters more than it might look. Had the damping carried *any* component perpendicular to the bond, it would have been friction against an absolute frame — it would have slowed the moon's rotation directly, and the simulation would have "demonstrated" tidal locking by quietly applying a brake. Every soft-body engine I know damps velocity that way by default, because it's stabilising and nobody usually cares.

The proof that it hasn't happened here is in the readout: **total angular momentum holds to about one part in 10¹⁴** over tens of millions of steps, while the moon's spin angular momentum visibly drains into the orbit.

| | Start | Orbit 2,600 |
|---|---|---|
| Spin ÷ orbit | 1.40 | 1.004 |
| Spin angular momentum | 5.609 × 10⁻⁴ | 3.603 × 10⁻⁴ |
| Orbital angular momentum | 5.4232 × 10⁻² | 5.4432 × 10⁻² |
| **Total** | **5.4792 × 10⁻²** | **5.4792 × 10⁻²** |

The spin loses 2.006 × 10⁻⁴. The orbit gains 2.006 × 10⁻⁴. The total moves by 8 × 10⁻¹⁶, which is round-off.

Energy, by contrast, is emphatically *not* conserved — 0.4% of the initial kinetic energy has become heat inside the moon. That asymmetry is the whole phenomenon: angular momentum gets redistributed, energy gets destroyed, and the moon climbs away from the planet as a consequence. Ours recedes 0.7%; the real one manages 3.8 cm a year.

## Two things that were much harder than the physics

**The random cloud has its own lumps.** A few hundred randomly placed points carry an intrinsic quadrupole asymmetry of order $N^{-1/2}$ — about 7% at $N = 200$. The tidal bulge I was trying to reveal is 0.25%. So for a long time the moon was locking beautifully and completely dishonestly: gravity had caught hold of a *permanent* lump, the way it does on a lopsided asteroid, and the locking time barely responded to the material constants at all. The fix is to squash the rest shape by the affine map that makes its second-moment tensor isotropic, killing the $\ell = 2$ term and leaving the tidal bulge as the only handle gravity has.

**Released as a sphere, the moon rings.** Dropped unstressed into a tidal field it has to grow a tidal bulge and a centrifugal bulge simultaneously, and it overshoots. The opening orbits are then dominated by a ring-down that has nothing whatever to do with tidal locking and looks *exactly* like it. So the body is settled under heavy damping first, then its velocity field is projected onto the rigid-body motion carrying the same momenta — which removes all the vibrational energy while conserving both momenta exactly — and only then does the clock start.

Both of these are the same lesson in different clothes: when you build a thing to produce an effect, it will produce that effect, and most of the work is ruling out the reasons that aren't the one you wanted.

## What you actually watch

At these rates an orbit takes a fraction of a second, so a fixed camera just strobes. The default view is the one humans actually have: standing on the planet, looking at the moon, which fills the frame. Its face turns, slows, and stops. The time lapse is paced to hold the *apparent* rotation near 1.6 turns a second rather than to advance simulated time at a constant rate — what your eye tracks is $(\Omega_{\text{spin}}/\Omega_{\text{orb}} - 1)$ turns per orbit, so a constant rate strobes at the start and crawls at the end.

The best control experiment is one slider: set the internal friction to zero. The moon still bulges, the bulge still tracks the planet, and the locking very nearly stops — over 2,500 orbits the spin ratio falls by 6%, against reaching synchronous with friction on. Nothing else in the model changed.

The planet and moon are rendered from real NASA data — Blue Marble and Black Marble for the Earth, the LRO/LOLA CGI Moon Kit for the Moon. I tried procedural surfaces first and they were never going to work: the eye rejects wrong coastlines and wrong maria immediately, however good the noise is. What procedural still wins at is anything that moves, so the clouds and the atmosphere are shaders.

## Scale

None of the numbers are the real Earth–Moon system. The classical estimate for the locking time is

$$t_{\text{lock}} \approx \frac{\omega\,a^{6}\,I\,Q}{3\,G\,m_p^{2}\,k_2\,R^{5}}$$

and that sixth power of the semi-major axis is why the real Moon took something like 10⁷ years. To make it watchable this moon orbits at 7.5 of its own radii — the real one sits at about 221 — and is far softer and far more lossy than rock. Only the constants that set the rate have been changed. The mechanism is untouched, which is the whole point: nothing in the code knows what it's supposed to do.
