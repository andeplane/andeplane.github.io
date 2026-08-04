# Three Lefts — Product Requirements

*Working title. A first-person game set in a house whose geometry is consistent, learnable, and impossible.*

---

## 1. Vision

You wake in a quiet manor house. The rooms are warm, still, and ordinary. The doors are doors, the corners are square, the light through the windows is soft and believable.

Then you walk around a corner, and around again, and around again — and you are back where you started, having turned only three times.

Nothing warps. Nothing flickers. Nothing changes when you look away. The house is simply not built in the space you thought you were standing in, and it never was.

**The game is figuring out what space it *is* built in.**

---

## 2. The core fantasy

Not "the house is haunted." Not "the house is a trick."

**The house is honest, and your intuition is the thing that's broken.**

Every player arrives with a lifetime of assumptions: four lefts make a loop, a corridor is as long coming back as going, a room has an outside. The game never breaks its own rules — it breaks *those* assumptions, in a fixed and discoverable way, and then hands the player a notebook and lets them work out the truth.

The emotional arc we're aiming for:

1. **Comfort** — this is a nice house.
2. **Doubt** — wait, was that door there? (It was. It always was.)
3. **Proof** — the player deliberately tests it. Three lefts. Back at the start. *They did that on purpose and it worked.*
4. **Obsession** — out comes the map. The map does not close.
5. **Understanding** — the player works out that the three grilles in the west wing all look into the *same* shrine, and that the only door to it is in the wing where four left turns are not enough.

Beat 5 is the whole product. Everything else exists to deliver it.

---

## 3. Design pillars

### P1 — The house never lies
Geometry is fixed at authoring time. No rooms rearrange when unobserved, no door leads somewhere different on the way back, nothing depends on the player's state or history. If the player can't reproduce it, we did it wrong. This is a hard invariant, enforced in code (see SPEC §3.4), not a stylistic preference — it is the *only* reason the player will bother to think.

### P2 — Locally boring, globally impossible
Space is perfectly flat everywhere the player can stand. Walls are straight. Corners are 90°. There is no fisheye, no bending, no visual tell. All the strangeness lives in how the pieces are glued, and it is invisible until you walk a loop. **The horror is that it looks fine.**

### P3 — The map is the main mechanic
The player's notebook is not a convenience feature, it is the protagonist's mind. It draws what the player believes — flat, Euclidean, four-lefts-make-a-square — and it is *wrong*, and it visibly, geometrically fails. Watching your own map overlap itself is the moment the game lands.

### P4 — Smooth enough to trust
Any stutter, seam, pop, or aliasing shimmer reads as "bug", and a player who suspects a bug stops suspecting the geometry. Visual and frame-rate polish are not gloss here; they are **credibility**. A janky non-Euclidean game is just broken. A silky one is unsettling.

---

## 4. Player experience

### 4.1 Locomotion
Standard first-person: WASD + mouse look, walk/slow-walk, no jump, no combat, no fail state. Deliberately unhurried — walking speed is a design tool, because the player needs time to notice.

Passing through a doorway is **seamless**: you see the next room through the opening before you enter it, at full resolution, correctly lit, with correct parallax. There is no loading, no fade, no teleport flash. This is non-negotiable — a visible transition would let the player dismiss the effect as "it just moved me."

### 4.2 Chalk
The player carries chalk and can mark any wall, floor, or door frame. Marks are permanent and stay attached to the surface they were drawn on.

This is the player's first tool for testing the house, and it produces the first real shock: you mark a door, walk a loop you're sure is new, and find your own mark waiting. Crucially it also produces the *inverse* shock later — you follow your marks and end up somewhere they say you shouldn't be.

### 4.3 The notebook (developing map)
Opening the notebook shows a top-down map that has been drawn automatically as you walked, by dead reckoning: heading, paces, turns. Exactly what a careful person with a pencil would produce.

Because it is drawn in flat 2D, it **cannot** represent the house. Around a deficit loop it spirals inward and overlaps itself. Around an excess loop it opens out and leaves a wedge of blank paper that corresponds to real, walkable space. The player will at first assume they mis-stepped. They didn't.

Later the notebook gains annotation tools so the player can mark seams, name rooms, and record theories.

### 4.4 Landmarks
Every room is individually memorable — a distinct colour, a distinct object, a distinct sound of the floor. Cartography is impossible without confident room identification, and confident room identification is what makes "wait, I've been here" land as a fact rather than a vibe.

### 4.5 The shrine

> **Correction from the original draft.** This section used to claim that the ring rooms all share one corner, so the column standing in each of them is literally the same column seen from three directions. That is false, and building it is what showed why: the rings are glued at *doorways*, not along whole walls, so the rooms' corners are never identified with each other. The defect is real — the loop genuinely fails to close — but it is a property of the loop, not of a visible seam you can walk up to and touch. There is no shared column. Chalking one would have proved nothing.
>
> What replaced it is better, because it is true.

The west wing's three rooms each have a **barred grille** in one wall. Through all three you see the same small shrine, with the same lantern burning on the same pedestal. It is not three similar rooms — it is one cell in the graph with three windows, and chalk on the shrine's wall is visible from all three grilles. That claim survives contact with the implementation.

It is also *audible*. The lantern makes a sound, that sound travels the portal graph, and from all three ring rooms it arrives from the same bearing at the same distance — five metres, ninety degrees to the right, through one barred doorway. A player who stops and listens has the answer before they have found the door.

The lantern is the level's objective, and none of the three grilles has a door. The way in is through the room the east wing's angle *excess* makes space for — a room that Euclidean geometry has nowhere to put. So the two wings are not two demonstrations of the same idea; the deficit wing shows you the prize and the excess wing is the only thing that can reach it.

The rings still have columns. They are landmarks, so you can tell the rooms apart well enough to map them — nothing more is claimed of them.

---

## 5. What the player is meant to learn

Stated plainly, so we can check the level design actually teaches it:

- **A loop can fail to close.** Walking a path that returns you to a room does not mean you turned a full circle.
- **Angle is not conserved.** Some corners of the house have less than 360° around them; some have more.
- **Less than 360° feels like the house is smaller than it should be.** (West wing: three lefts, and you're home.)
- **More than 360° means space is hidden in a corner.** (East wing: four lefts isn't enough. There is a whole room in there that has no business existing, and that's where the good stuff is.)
- **The defect belongs to the loop, not to a place.** There is no cursed corner to avoid. Every room is ordinary; it is the *circuit* that fails to close, and it fails by an exact, repeatable amount. Learning which loops are bent is learning the house.

---

## 6. Scope

### v0.1 — Vertical slice (the current target)
The playable proof that the idea works and feels good.

- Seamless recursive portal rendering, no visible transitions
- Full first-person locomotion with correct cross-portal collision and physics
- **Central hall** + **west wing** (3-room deficit ring) + **east wing** (5-room excess ring, with one hidden room reachable only via the excess)
- Chalk marking
- Debug HUD: current room, accumulated holonomy, portal recursion depth, frame time
- Final art quality on a small number of rooms, not grey boxes — because P4 means we have to know the look holds up *before* we build twenty rooms

**Slice is done when:** a first-time player, given no instructions, independently discovers that three lefts returns them to the start, and says something out loud.

### v0.2 — The notebook
Dead-reckoning developing map, overlap rendering, annotation. Chalk marks appear on the map. This is what turns the slice from a tech demo into a game.

### v0.3 — Vocabulary expansion
Additional impossibility types beyond angle defect:
- **Translational holonomy** — the corridor back is longer than the corridor out
- **Scale portals** — a room genuinely bigger inside than outside
- **Mirror seams** — walk a loop, return left-handed; every label in the world now reads backwards
- **Recursive rooms** — a room containing itself, infinite hallway

### v1.0 — The house
A full manor built from the vocabulary, with a reason to be there and a way out. Structure and narrative TBD — deliberately deferred until we know which impossibilities are actually *fun*, which we will not know until v0.3.

---

## 7. Visual direction

**Reference feeling:** a quiet Nordic/Edwardian manor at late-afternoon dusk. Lived-in, warm, and completely credible. The opposite of a puzzle-box white void — the house has to be somewhere you'd want to be, or the wrongness has nothing to spoil.

- **Palette:** warm oak, lime plaster, brass, deep green and oxblood wallpaper, cool blue daylight bleeding in through windows. Restricted and consistent.
- **Light:** soft and indirect. Warm practicals (lamps, sconces) plus cool window light. Gentle contrast, no harsh spots.
- **Surfaces:** physically-based, slightly worn. Varnished wood with real specular response, matte plaster, small imperfections. The renderer should look like a nice architectural visualisation, not like a game engine.
- **Motion:** slow, weighty, smooth. Subtle head bob, footstep-synced, disable-able.
- **Per-wing identity:** each wing has its own colour and material story, both for beauty and because cartography *requires* it.

Hard requirement: **rock-solid 60 fps with no hitches, and no aliasing shimmer on the many, many straight edges of a house.** See SPEC §6 for how the portal renderer constrains this.

## 8. Audio direction

Underrated for this concept. Sound is the second channel through which the house can be wrong — and the one that works when the player is facing the other way.

- Each room has a distinct footstep — a second landmark system that survives not looking at the room. *Shipped, and better than specified:* the tuning is per room **style**, not per floor material, so there are eight footsteps rather than two and you can hear which wing you are in from the first pace.
- Room reverb is per-cell, and crossing a portal crossfades it. *Shipped.* It is also not authored: reverberation time comes out of Sabine's equation applied to the room's own measurements, so the cathedral rings for 3.2 seconds and the cupboard for 0.6 because those are the sizes they are. A room that measures small and sounds large would be the house lying (P1), and this makes that structurally impossible rather than merely unintended.
- Sound propagates *through the portal graph*, not through Euclidean distance. A sound made two rooms away around a ring should arrive from the direction the ring says, not the direction your gut says. *Shipped.*
- Near-silence otherwise. No score during exploration. *Shipped, after getting it wrong once.* The first pass gave lamps a hiss and rooms an air tone, and eleven continuous noise sources sounded like broken plumbing. What is left is a lantern, your own footsteps, and the room answering them — nothing else is ever making a sound.

### 8.1 What this bought, which we did not anticipate

Beat 5 of §2 — the player working out that the three grilles look into one shrine — was, on the first pass, something you could only *infer*, by chalking the shrine wall and walking round to check. Sound made it something you can **measure from where you are standing**: the lantern is five metres to your right through all three grilles, at the same distance and the same bearing, and no arrangement of three separate shrines could do that.

That moves the reveal from "clever, once you think to test it" to "available to any player who stops and listens", which is a better place for the most important beat in the game to live.

---

## 9. Non-goals

- **No combat, no enemies, no death, no timers.** Pressure destroys cartography.
- **No jump-scares.** The concept is dread-by-inference; a jump-scare would tell the player this is a horror game with a gimmick rather than a place with rules.
- **No procedural generation** in v1. Every impossibility is authored, because P1 means it has to be verifiable, and because a random impossible house is just noise.
- **No hand-holding.** No tutorial explaining the geometry, ever. Discovering it *is* the game; explaining it deletes the game.
- **No multiplayer.**
- **No curved (hyperbolic) space** for now — deferred, and only as isolated pockets if it ever comes back. It violates P2.

---

## 10. Success criteria

| | Measure |
|---|---|
| **The hook works** | A first-time player discovers the three-left loop unprompted and reacts audibly |
| **The house is honest** | A player who forms a theory can test it and be *right* |
| **The map lands** | Players open the notebook and immediately understand why it can't close |
| **It's credible** | No player attributes the effect to a bug or a glitch |
| **It's smooth** | 60 fps sustained, no hitch on portal traversal, no shimmer on edges |
| **The reveal lands** | Players work out that the three grilles look into one room, and that the only door to it is in the wing that should not have room for one |
| **The ears agree with the eyes** | A player who has stopped believing the geometry can turn away from a grille and still hear the shrine in the same place |
