# PRD — *Sunken* (working title)

A WebGPU first-person underwater exploration game.

**Status:** draft v1 · **Owner:** Anders · **Last updated:** 2026-08-02

---

## 1. Vision

You are a free-diver on a sunlit coral reef ringing a small rocky island. You
swim down through shafts of green light to a seabed 10–30 m below, thread
through cave mouths in the reef wall, and find things nobody has found in a long
time. There is no combat, no oxygen meter, no way to lose. The reward loop is
*discovery* and *beauty*.

The one-line pitch: **ABZÛ's calm, Subnautica's curiosity, in a browser tab.**

### Why it should exist

Browsers just got a competent GPU API. Almost nothing on the web looks
genuinely beautiful in real time. An underwater scene is the ideal showcase:
volumetric light, caustics, wavelength-dependent absorption and dense
instanced life all read as "impossible in a browser" to a lay viewer, and all
are achievable with WebGPU compute + node materials.

---

## 2. Design pillars

Every feature is judged against these four. If it does not serve a pillar, it
gets cut.

| # | Pillar | What it means in practice |
|---|--------|---------------------------|
| **P1** | **Beauty first** | The scene must be screenshot-worthy from any angle at any moment. Visual budget beats feature count. |
| **P2** | **Calm and unpressured** | No fail state, no timers, no enemies. Movement is buoyant and slow-damped. Sound and pace are meditative. |
| **P3** | **Rewarded curiosity** | Every dark hole, overhang and silhouette on the horizon leads to *something*. Nothing is a dead end. |
| **P4** | **Alive, not decorated** | Fauna reacts — fish part around you, crabs scuttle, birds wheel. The world must not read as a diorama. |

---

## 3. Player experience

### 3.1 The first 90 seconds (the "golden path")

This is the sequence we tune hardest, because it is what most people will ever see.

1. **0:00** — Fade in floating at the surface. Waves lap the camera; the
   waterline bisects the screen; the island's cliffs and a moored sailboat are
   visible ahead; gulls call. *(Sells: above-water beauty, scale, orientation.)*
2. **0:10** — Player presses `Ctrl`/`C` and sinks. The waterline sweeps over the
   lens; audio muffles; colour drains to blue-green. *(Sells: the transition —
   the single most important shot in the game.)*
3. **0:25** — Descending through a shaft of god rays, a school of ~800 sardines
   parts around the player. *(Sells: volumetrics + GPU boids.)*
4. **0:45** — Seabed at −18 m. Caustics ripple over sand and coral. A crab
   scuttles sideways under a rock. Kelp sways.
5. **1:10** — A dark cave mouth in the reef wall, with one god-ray shaft falling
   through a hole in its ceiling. A `[F] torch` hint appears.
6. **1:30** — Inside: a treasure chest, rim-lit. `[E] Open`.

### 3.2 Controls

| Input | Action |
|-------|--------|
| `W A S D` | Swim relative to look direction |
| Mouse | Look (pointer-locked) |
| `Space` | Ascend |
| `Ctrl` / `C` | Descend |
| `Shift` (hold) | Sprint — a stronger fin kick, with a wider FOV and bubble trail |
| `E` | Interact with the highlighted object |
| `F` | Toggle dive torch |
| `Tab` / `J` | Dive log (discoveries found) |
| `Esc` | Release pointer lock / pause |

Design notes:

- Momentum is **heavily damped, never instant**. Buoyancy pulls the player
  gently upward when neutral; this is what makes it feel like water and not
  like a flying camera. Non-negotiable (P2).
- The camera has a slow breathing bob and a small look-lag. Sprinting adds FOV
  punch and a bubble trail.
- Interaction uses a short forward raycast; eligible targets get a soft outline
  and a world-space prompt.

### 3.3 Feedback and UI

Diegetic-leaning, minimal, never blocking:

- **Depth gauge** — bottom-left, reads e.g. `18.4 m`.
- **Compass strip** — top-centre, with markers for discovered landmarks.
- **Interaction prompt** — world-anchored `[E] Open chest`.
- **Discovery toast** — a small card slides in: name, one line of flavour text.
- **Dive log** — a grid of found/undiscovered slots (`? ? ?` for unfound).
- **No health, no oxygen, no minimap.**
- **Loading screen** — a slowly drifting underwater scene with a progress bar,
  shown while the world meshes and, critically, while every render pipeline is
  pre-warmed (see design doc §9). It must never cut to a frozen first frame.

---

## 4. The world

A single hand-tuned, seeded-procedural island and its reef. Not endless — a
bounded, *authored-feeling* place roughly **400 × 400 m**, which is about
6–8 minutes of swimming end to end.

### 4.1 Vertical layout

```
 +25 m ┤ island summit — rock, scrub, gulls circling
   +4 m┤ beach / cliff base, sea caves at the waterline
    0 m┤ ══════ SEA SURFACE — Gerstner waves, foam, sun glint ══════
   −4 m┤ shallow reef crest — brightest caustics, warm colour
  −12 m┤ reef slope — coral gardens, cave mouths           ← main play depth
  −22 m┤ sand flats — kelp forest, wreck, rays
  −30 m┤ reef base / drop-off into blue fog (soft world edge)
```

Depth band **−10 to −30 m** is the stated design target and is where ~80 % of
play happens.

### 4.2 Zones

Each has a distinct silhouette, palette and inhabitants so the player can
navigate by memory.

| Zone | Depth | Identity |
|------|-------|----------|
| **The Shallows** | 0 → −6 m | Turquoise, hot caustics, staghorn coral, clownfish + anemones. The tutorial space. |
| **The Reef Wall** | −6 → −20 m | A long ridge pierced by **cave mouths**. Sea fans, sponges. Main cave access. |
| **The Kelp Forest** | −14 → −24 m | Tall swaying kelp, dim green, shafts of light. Hides things. |
| **The Sand Flats** | −20 → −28 m | Open, calm, rippled sand. The **shipwreck**. Long sightlines. |
| **The Drop-off** | −28 m → fog | Deep blue, sparse, a passing whale silhouette. The world's soft edge. |
| **The Island** | 0 → +25 m | Above water. Rock, beach, gulls, moored boats. Provides orientation and the "wow" of surfacing. |

**The world edge.** Past the drop-off, the player is turned back by a gradually
strengthening **current** plus thickening blue fog — never an invisible wall.
Being shoved by the sea reads as the ocean being big; hitting a glass pane reads
as the game being small, and breaks pillar P2.

### 4.3 Caves — the core of the game

Three to five cave systems, procedurally carved but validated for playability:

- **Entrances are always visible from open water** — a dark mouth in a lit wall.
- **Tunnels are 3–8 m across** — wide enough to never feel like a corridor
  collision test.
- Each system has **at least two openings** (no dead-end panic) and at least one
  **skylight** — a hole in the ceiling admitting a single god-ray shaft. This is
  both a lighting showpiece and a navigational breadcrumb.
- One system ends in a **cathedral chamber**: large, dark, bioluminescent coral
  as real point lights.
- Sea caves at the island's waterline connect the above-water and underwater
  worlds.

Caves are dark. The torch is what makes them navigable, and the contrast
between the blue outside and the warm torch cone is a deliberate visual hook.

---

## 5. Life

"Rich in life" is a hard requirement, not flavour. Target: **at no point is the
screen without something moving.**

### 5.1 Fauna

| Creature | Count | Behaviour |
|----------|-------|-----------|
| **Sardine / anthias schools** | ~3 000 across 4–6 schools | GPU boids; flee the player; tighten when startled |
| **Reef fish** (angel, parrot, butterfly) | ~200 | Loose wander, graze near coral |
| **Clownfish** | ~40 | Bound to anemones, dart in and out |
| **Crabs** | ~120 | **Walk on the seabed**, 8 animated legs, scuttle sideways away from the player, hide under rocks |
| **Jellyfish** | ~60 | Drift, pulse, emissive |
| **Sea turtle** | 1–2 | Slow spline patrol; will swim alongside you |
| **Reef shark** | 1 | Circles the drop-off, indifferent |
| **Rays** | 3 | Glide over the sand flats, kick up silt |
| **Whale** | 1 | Distant silhouette in the drop-off fog, rare, timed |
| **Gulls** | ~150 | GPU boids **above water**, wheel around the island and boats |

Fish and gulls share **one** GPU boids implementation with different parameters
and geometry — this is a deliberate reuse decision (see design doc).

### 5.2 Flora and static life

Instanced, sway in the vertex shader, scattered by density rules per zone:

Kelp · seagrass · staghorn coral · brain coral · sea fans (branching) ·
sponges (barrel, tube) · anemones · sea shells · starfish · urchins ·
barnacles · rock encrustation.

Target ≥ 40 000 instances total, all GPU-instanced.

### 5.3 Ambient particles

Marine snow (drifting motes), bubble streams from seabed vents, silt puffs
kicked up near the bottom, the player's own bubble trail, and surface spray.

### 5.4 Audio

Audio is not decoration here — it carries pillar P2, and the golden path (§3.1
step 2) is *defined* by the moment the sound muffles. Requirements:

- **Above water:** wind, wave lap, gull cries, rigging clink from the boats.
- **Below water:** a low ocean rumble, distant whale song, the player's own
  breathing and bubble bursts, a click-and-crackle reef bed layer.
- **The transition:** a low-pass filter whose cutoff tracks camera depth, so
  submerging *audibly* closes the world down. This single effect does more for
  immersion than any other 20 lines in the project.
- **Discovery stings:** a short warm swell on each find; a bigger one for the
  chest.
- Everything ducks and fades — no hard cuts. Muted until first user gesture.

### 5.5 Boats

- A **moored sailboat** near the island, bobbing on the wave field.
- A small **fishing boat** with a trailing rope, slowly circling.
- A **sunken wreck** on the sand flats — swim-through hull, a discovery site.

Floating boats sample the same Gerstner wave function as the surface mesh, so
they sit and roll correctly in the swell.

---

## 6. Discoveries and easter eggs

The collectible layer. **15 discoveries**, shown in the dive log. Finding one is
purely a reward — no gating, no currency.

### 6.1 The hero easter egg — the treasure chest

Explicitly requested; it gets the most polish of any single object.

- Located deep in the cathedral cave chamber, half-buried, barnacle-crusted.
- Approach → `[E] Open`.
- On open: lid creaks up on a hinge, **volumetric golden light** floods out of
  the chest, hundreds of **gold coins and cut diamonds** spill and settle with
  physics-ish motion, the diamonds throw caustic sparkles, bloom blooms, a
  swell of music, and a cloud of disturbed silt drifts up.
- The chest stays open forever and keeps glowing — it becomes a landmark.

### 6.2 Full discovery list

| # | Discovery | Where | Interaction |
|---|-----------|-------|-------------|
| 1 | **Treasure chest** | Cathedral cave | `E` — the hero moment |
| 2 | **Message in a bottle** | Kelp forest | `E` — reads a handwritten note |
| 3 | **Giant clam** | Reef wall | `E` — opens, reveals a pearl |
| 4 | **Crystal geode** | Deepest cave | `E` — cracks open, glows |
| 5 | **Stone idol** | Sand flats, half-buried | `E` — brushes off silt |
| 6 | **The shipwreck** | Sand flats | Proximity — swim inside |
| 7 | **Ship's anchor + chain** | Reef base | Proximity |
| 8 | **Amphora hoard** | Sea cave | `E` — one is intact |
| 9 | **Bioluminescent grotto** | Cave branch | Proximity — lights bloom on entry |
| 10 | **The turtle** | Roaming | Proximity — it escorts you |
| 11 | **The whale** | Drop-off | Proximity — distant song |
| 12 | **Skylight shaft** | Cave ceiling | Proximity — swim up through it |
| 13 | **Octopus in a jar** | Wreck interior | Proximity — it retreats, ink puff |
| 14 | **Gull's nest** | Island cliff (above water!) | Proximity — rewards surfacing |
| 15 | **The lighthouse lamp** | Island summit | `E` — lights up, sweeps the sea |

Nos. 14–15 exist specifically to reward the player for going **up**, closing the
loop on the "you can swim all the way to the surface" requirement.

### 6.3 Hidden extras (not in the log)

A rubber duck bobbing in a cave pool · a diver's lost GoPro still recording ·
the developers' initials scratched into a rock · a fish that is *very* slightly
too large.

---

## 7. Built for missions later

Explicit requirement: this must become a real game later, not stay a tech demo.

The discovery system **is** the mission system — discoveries are authored as
mission data, so shipping them proves the pipeline. See the design doc for the
schema. What that buys us later, with **no engine changes**:

- *"Photograph three species of coral"* — objective type `observe`.
- *"Recover the captain's log from the wreck"* — `fetch` + `deliver`.
- *"Guide the turtle back to the nesting beach"* — `escort`.
- *"Find all five amphorae before the tide turns"* — `collect` + optional timer.
- Dialogue / journal entries, waypoint markers, mission chains, unlockable
  areas — all data, all already supported by the objective + trigger + state
  machinery.

**Requirement:** adding a new mission must mean adding one data file and zero
engine code.

---

## 8. Success criteria

The build is done when all of these hold:

| # | Criterion | Measure |
|---|-----------|---------|
| S1 | Runs at **60 fps** at 1080p on an Apple M-series laptop | frame timer |
| S2 | Loads to playable in **< 8 s** on a warm cache | timed |
| S3 | The surface transition (§3.1 step 2) looks *correct* — Snell's window, colour shift, muffling | eyeball + screenshot |
| S4 | Caustics, god rays, per-channel absorption all visibly present | screenshot |
| S5 | ≥ 3 000 fish, ≥ 100 crabs, ≥ 40 000 flora instances on screen budget | counters |
| S6 | All 15 discoveries reachable and logged | playthrough |
| S7 | The chest easter egg is a genuine "whoa" | eyeball |
| S8 | Player can swim from −30 m to the island summit uninterrupted | playthrough |
| S9 | A new mission can be added as data only | write a test mission |
| S10 | No collision tunnelling into terrain at sprint speed | stress test |

## 9. Non-goals

Explicitly **out of scope** for v1, to protect the schedule:

- Multiplayer, save/load, settings persistence beyond a quality preset.
- Mobile / touch controls.
- WebGL2 fallback. **WebGPU only** — a clear "your browser needs WebGPU" screen.
- Day/night cycle or weather (one hand-tuned golden-hour lighting setup).
- Character model / third-person view / visible hands.
- Voice acting, story cutscenes.
- Inventory, crafting, economy, combat, damage, oxygen.
- Procedural infinite world — the world is bounded and authored.
