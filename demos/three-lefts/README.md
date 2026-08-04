# Three Lefts

A first-person game set in houses whose geometry is consistent, learnable, and impossible.

Eight of them. Three left turns bring you back where you started. A corridor is glued to its own far end and a cathedral fits behind a cupboard door. Four flights of stairs climb in a square and close, so you can climb forever and arrive exactly nowhere. Later on, a ring of eight rooms lets your map close perfectly on a room you have never been in; a single glasshouse has four doorways that all lead back into it, and going out and back is not the same journey as back and out; and a hall has three doors side by side that open onto one green room, which is three green rooms.

Nothing warps, nothing moves when you look away, and nothing in any of them is a trick. The rules are fixed and the arithmetic is exact — the console prints a verification of every impossible loop each time a level loads.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
npm run check    # typecheck
```

**Controls** — `WASD` walk, `Shift` run, mouse look, `E` chalk a numbered tally mark on the wall in front of you, `M` toggle the notebook, `V` sound (full / quiet / off), `F3` instruments, `Esc` pause. Click the canvas to capture the mouse.

Wear headphones. Sound travels these houses the same crooked way you do.

## How it works

There is no world space. The world is a *graph*: rooms are nodes with their own private coordinate systems, doorways are edges labelled with a rigid transform, and the player's position is always `(cell, local x/z)` — never a global point. Walking through a door multiplies you by that transform.

Walk a loop and compose the transforms you passed through. In a real building the product is the identity; that is what "geometry is trustworthy" means. Make it anything else and the loop refuses to close. Every impossibility in the game is that one statement, and nothing else.

Sound obeys it too. Audio travels the portal graph rather than any space the rooms are sitting in, so a lantern two rooms away arrives from the direction the *graph* says — and the shrine in the first level sounds exactly five metres to your right through all three of its grilles, because it is one room, and you can prove that with your ears before you ever find the door.

- **[PRD.md](./PRD.md)** — what the game is, and what the player is meant to feel and work out
- **[SPEC.md](./SPEC.md)** — the maths, the renderer, and the decisions that fell out of building it

## Layout

```
src/
  core/     fixed-timestep loop, input, small maths helpers
  world/    cell geometry generation, the level graph, holonomy assertions
  render/   recursive stencil portal renderer, materials, environment, post chain
  audio/    portal-graph sound propagation, procedural synthesis
  player/   capsule controller with cross-portal movement, chalk
  levels/   eight levels, in the order they teach
  ui/       menu, HUD, the dead-reckoning notebook
```

## Notes for anyone picking this up

Five things were learned the hard way and are worth not re-learning:

1. **Screen-space effects and portals are incompatible.** SSAO, TAA, SSR, and screen-space shadows all sample neighbouring pixels, and across a portal edge the neighbouring pixel is in a different room. They ghost and smear at exactly the doorway the player is staring at. The look here comes from baked vertex AO, a purpose-built environment map, and MSAA — the only anti-aliasing that doesn't sample across edges.

2. **Derive triangle winding from the shading normal, not from the call site.** The surface generator mixes handednesses — a floor and a ceiling traced with the same `(u, v)` sweep have opposite geometric orientations. Getting it wrong is invisible in the data and total on screen: every affected face is silently backface-culled and the room renders as nothing at all.

3. **Assert the holonomy of every authored loop at load.** The whole game rests on the player trusting the house is consistent. A door nudged two centimetres would make a loop drift, and the player would have no way to tell that from the impossibility being the point. It should be a build failure, not a mystery.

4. **An adaptive quality controller must measure against the display's refresh rate, not a fixed 60 fps.** Under vsync a healthy frame delta *is* the refresh interval, so "is this frame faster than 16.7 ms?" is never true on a 60 Hz screen, and the controller can only ever reduce quality. Learn the refresh period as the fastest frame you have seen — the menu gives you that for free.

5. **Nail the audio listener to the origin and put the world in head coordinates.** The obvious design — move the listener with the player — breaks at every doorway, because the coordinates it moves in stop existing when you cross one. The vector from your head to a sound is the only frame that survives a portal transform unchanged, so it is the only one a panner can be smoothed in. Same lesson as the renderer's, in a different sense.
