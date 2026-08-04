---
title: "A house whose loops don't close"
date: "2026-08-04"
description: "Three left turns bring you back where you started. Nothing warps, nothing moves when you look away, and none of it is a trick — the house is simply not built in the space you assumed you were standing in."
tags: ["Geometry", "Three.js", "WebGL", "Game", "TypeScript"]
---

You walk around a corner. Around again. Around again. And you are back where you started, having turned only three times.

Nothing warped. Nothing moved while you weren't looking. There was no fisheye, no bending, no moment where the walls did something. Every corner you turned was square and every wall was straight, and if you go and do it again it happens again, exactly.

**[Walk through it](/demos/three-lefts/)** — eight houses, each one impossible in a different way.

## What it actually is

A first-person game, in the browser, with no combat, no timers, no fail state and no jumping. You walk around a quiet manor house at dusk with a piece of chalk and a notebook, and you work out what shape the building is.

The chalk marks walls and stays where you put it, which is how you prove you have been somewhere before. The notebook draws a map automatically as you walk, by dead reckoning — heading, paces, turns — exactly what a careful person with a pencil would produce. Because it is drawn flat, on paper, it *cannot* represent the house, and watching your own map overlap itself is the moment the whole thing lands.

There are eight levels, and each one adds a single idea to the vocabulary. The objective is always the same: find the lanterns and record them. Finding them is not the hard part. Believing where they are is.

## There is no world space

That is the one decision everything else falls out of, and it is worth stating as bluntly as it deserves: nothing in the codebase holds a global position. There is no containing space for the rooms to sit in, and no code path may assume two objects in different rooms can be compared, subtracted, or distance-tested.

What exists instead is a graph. Rooms are nodes, each with its own private copy of ℝ³ and its own origin. Doorways are edges, and each edge is labelled with a rigid transform. The player's position is always `(cell, local x, local z)` — a room, and where you are inside it. Walking through a door multiplies you by that door's transform and hands you a new room to be in.

The transform itself is short. Give every doorway a frame `F` sitting at the opening's centre with `+Z` pointing into the room it belongs to. Then the coordinate change from room A to room B is

```
T = F_B · R_y(π) · F_A⁻¹
```

The half turn in the middle is the turning-around: you approach a doorway facing its inward normal and you leave the far side facing away from *its* inward normal. And because `R_y(π)⁻¹ = R_y(π)`, the inverse comes out symmetric for free — `T[B→A]` is just `T[A→B]⁻¹` with no special case anywhere. Portals are two-way because the algebra says so, not because anything was written twice.

## The whole game is one equation failing

Walk a loop. Compose the transforms of every doorway you passed through:

```
H(γ) = T[Pₙ] · … · T[P₂] · T[P₁]
```

This is the **holonomy** of the loop. In a real building it is the identity — and that is precisely, mathematically, what "geometry is trustworthy" means. Your room is where you left it, at the distance and heading you expect, because going round and coming back composes to nothing.

Make it anything other than the identity and the loop refuses to close.

**Every impossibility in the game is that one statement and nothing else.** There is no second trick. A ring of three rooms, each of which you enter from the south and leave by the west — one left turn apiece — closes as a graph after 270° of turning, so three lefts bring you home and space is smaller than it should be. A ring of five closes after 450°, so four lefts are *not enough*, and hidden in that excess is a room Euclidean geometry has nowhere to put. That room is where the good stuff is.

The quantity is the angle defect, `δ = 2π − nθ`, and it is the same object a cosmologist means by a cone point.

## The part I got wrong

The first design document claimed the defect lives on a visible seam: the ring rooms share a corner, so the column standing in each of them is *literally the same column* seen from three directions, and you could chalk it and prove it.

That is false, and building it is what showed why.

A cone singularity needs the cells glued along the **whole walls** meeting at that corner. These rings are glued at *doorways* — small rectangles in the middle of walls — so no two rooms' corners are ever identified with each other. Space is flat and completely ordinary everywhere you can stand. The impossibility is a property of the **loop**: it is non-contractible, it encircles a region that contains no room at all, and its holonomy is not the identity. There is nothing to walk up to and touch.

Which turned out to be the better design, because it forced the payoff to be something the model could actually back. Three rooms have barred windows onto one small shrine. Not three similar shrines — one room in the graph with three windows, and chalk drawn on its wall is visible through all three. That claim survives contact with the implementation, and the one it replaced did not.

## The house never lies, and it is checked

None of this is worth a player's attention unless the house is honest, so honesty is mechanical rather than aspirational. Every authored loop declares the holonomy it is supposed to have, and the check runs at level load, in the browser, printing to the console every single time.

A door nudged two centimetres would make a loop drift, and a player would have no way to distinguish that from the impossibility being the point. So it is a load failure, not a mystery. It has earned its keep: one level's ring holonomy was declared `+90°` when nine rooms of one left turn each give `(4 − n)` quarter turns, which is `−90°`. The assertion caught it before it was ever walked.

## Later levels, and the map that lies while being correct

The first three levels teach the vocabulary — angle defect, a corridor glued to its own far end, and a Penrose staircase realised exactly. That last one is a nice piece of arithmetic: four flights and four landings, so the loop is `S⁴` with a quarter turn each time, and the horizontal part of the translation is `(I + R + R² + R³)·t`, which is identically zero for a quarter turn. Only the vertical survives. You climb 4.2 metres per lap, forever, and arrive precisely nowhere.

In all three, the notebook is the tell. It draws what you believe — flat, Euclidean, dead-reckoned — and it visibly fails: it spirals into itself around a deficit, and leaves a wedge of blank paper around an excess.

The later levels take that away. A ring of **eight** rooms turns 720°, so after four lefts your map has drawn a flawless square, closed it, and told you that you are exactly where you began. You are one room short of it, in a room you have never been in, and the map is not merely wrong — it is confidently, consistently, provably wrong, which is worse and far harder to catch. The only instrument that still works is chalk.

Then a single glasshouse whose four doorways lead back into itself. Four norths compose to precisely nothing; so do four wests. But north-then-west and west-then-north land 27 metres apart, and the commutator `n·w·n⁻¹·w⁻¹` comes out as a pure translation of about 28 metres with no rotation at all. Two loops that each close, and whose order matters. That one is not drawable.

## What portals forbid

The renderer draws the world by recursive stencil passes — mark the doorway, reset the depth inside it, recurse with the transformed camera, stamp the depth back, unmark. Three levels deep, which on the busiest level is fourteen full renders of shaded geometry per frame.

The constraint that shapes everything is that **no screen-space technique may sample across a portal boundary**. SSAO, SSR, TAA, screen-space shadows — all of them read neighbouring pixels, and across a doorway edge the neighbouring pixel is in a different room. They smear and ghost at exactly the seam the player is staring at, which is the one place the whole illusion has to hold. So the cheap route to looking good is closed, and the look has to come from baked vertex AO, a purpose-built environment map, and MSAA, the only anti-aliasing that qualifies.

Sound obeys the same graph. Audio travels the portal edges rather than any space the rooms sit in, so a lantern two rooms away arrives from the direction the *graph* says. The listener is nailed to the origin and every source is placed in head coordinates, because the vector from your head to a sound is the only frame a portal transform leaves unchanged: crossing a doorway rotates the source and the head by the same amount, and the difference is untouched. Measured across a real crossing, the apparent position moves 8 cm — against 17 cm for an ordinary walking frame. No seam.

And it pays off in the shrine. From all three barred windows the lantern reads at the same distance and the same bearing — five metres, ninety degrees right, through one barred doorway. You can prove three windows look into one room with your ears, from inside a room you cannot leave.

## Two bugs worth keeping

Triangle winding has to be derived from the shading normal, not from the call site. The surface generator mixes handednesses — a floor and a ceiling traced with the same sweep have opposite geometric orientation — and getting it wrong is invisible in the data and total on screen. Every affected face is silently backface-culled, and the room renders as *nothing at all*: no error, no warning, geometry submitted, screen black.

And the adaptive quality controller, which measures the frame and gives up resolution before samples before recursion depth, was initially written against a fixed 60 fps target. Under vsync a perfectly healthy frame delta simply *is* the refresh interval — 16.7 ms on a 60 Hz panel — so "faster than 13.7 ms means we have headroom" can never be true, and the controller becomes a one-way ratchet that lowers quality and never gives it back. It now learns the display's period as the fastest frame it has seen, which the menu establishes for free before any level loads.

---

The pitch I keep coming back to is that the house is honest and your intuition is the broken part. Every player arrives with a lifetime of assumptions — four lefts make a loop, a corridor is as long coming back as going, a room has an outside — and the game never breaks its own rules. It breaks *those*, in a fixed and discoverable way, and then hands you chalk.
