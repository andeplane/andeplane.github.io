# Levels 4–8 — design plan

*Revision 3 — **built and verified**. Levels 1–3 ship and stay as the on-ramp; the verdict on them was "cool, but too easy", which is the right difficulty for teaching and the wrong one for the rest of the game.*

---

## What "harder" can and cannot mean here

Stated first, because it constrains everything below.

**Holonomy cannot gate access.** Where the player can go is decided entirely by the cell graph. Walking a loop with non-trivial holonomy returns you to the *same cell*, only turned or displaced in belief. There is no "you may only enter on the third lap" — the third lap is the same room as the first.

So difficulty comes from three places, and only these:

1. **Grilles.** The graph has two connectivities: what you can *see* through (all portals) and what you can *walk* through (passable ones). A room can be visible from everywhere and reachable from one place. This is the only genuine gate the engine has. Levels 1–3 use it once each; it can carry far more.
2. **Self-similarity.** If two cells are indistinguishable by eye, the player cannot navigate by memory, only by evidence. Chalk stops being a toy and becomes the instrument.
3. **Graph size and structure.** Twelve rooms that lie are harder than five rooms that lie.

**No new mechanics.** No keys, no locks, no switches. The thesis is that geometry alone is the puzzle, and a key would be an admission that it isn't. The one addition is multi-objective collection, which is a *reason to traverse*, not a new rule.

---

## What the review changed

The first draft was reviewed by building the risky parts and running them, rather than by re-reading. Four findings, three of them corrections:

| | Finding | Effect on the plan |
|---|---|---|
| **1** | `Wall = 'N'\|'S'\|'E'\|'W'` — **there are no floor or ceiling doors**. The Ascent's "grille down into the court" is a *wall* grille pair whose transform makes it read as a drop. | **L7 and L8 rewritten.** "Look down through a floor grille onto the lap below" was unbuildable without major `buildCell` surgery. |
| **2** | Paired doors must agree on `sillRel`, so a portal between two **flat** cells has exactly zero rise. Vertical holonomy requires ramps. | Constrains L7's helix to the Ascent's flight-and-landing shape. |
| **3** | Doorways are glued, not walls — so a self-glued cell is not a torus. | **L5 reframed**: not "a room that wraps" but "a room whose doorways lead back into itself". Honest, and the picture is the same. |
| **4** | A cell portalled to itself **renders correctly** — 9 cell draws, depth 3, for one cell. *(E3 resolved.)* | L5 is viable. |

Maths confirmed by probe, not by reasoning:

```
8-ring, one left turn each   4 lefts → r5, holonomy EXACTLY identity
12-ring                      4 → r5, 8 → r9, 12 → home, all identity
helix, 6 flights + landings  1 lap = 180° + 5.1 m rise + 11.5 m sideways
                             2 laps = (0, −10.2, 0) — horizontal drift cancels exactly
self-glued cell N↔E, S↔W     4 norths = identity; commutator N,S,E,W = (24.9, 0, 24.9)
```

---

## Engine work required

| | Change | Why |
|---|---|---|
| **E1** | `goal` → `goals: { cell, message }[]`, collect all, HUD shows `2/3` | Forces return trips. A one-way walk can be luck; going *back* requires having understood. Levels 1–3 keep working as single-element lists. |
| **E2** | Load-time assertion that every goal cell is reachable from spawn **through passable doors only** | Five levels built largely out of grilles is exactly how an unwinnable one ships. Same spirit as the holonomy check (SPEC §3.4): a load failure, not a mystery. |
| ~~E3~~ | ~~Verify self-recursive rendering~~ | **Done — it works.** |

---

## L4 — The Cloister
### *A closed map is not a proof.*

**Mechanism.** A ring of **eight** rooms, each one left turn. 8 × 90° = 720°.

```
four lefts  → r5, a different room, holonomy exactly identity (yaw 0, translation 0)
eight lefts → r1, home
```

**Why it is the right next level.** In levels 1–3 the notebook is the tell: it visibly fails to close, spirals, leaves a wedge. Here **the notebook is perfect and still wrong.** Four lefts draws a flawless square, says *you are exactly where you began*, and you are one room short. Dead reckoning is not merely inaccurate — it is confidently wrong, which is worse and much harder to catch.

The only instrument that works is chalk. This is the level where the player stops trusting the map and starts trusting evidence, which is the skill L5–L8 assume.

**Layout.** Eight rooms as four visually identical pairs — `r1≡r5`, `r2≡r6`, `r3≡r7`, `r4≡r8`. Same style, props, lamp colour, painting. An entrance hall with a door into `r1` and a **grille into `r6`**: before entering the ring you have already seen a room you will later swear you are standing in.

**Objective.** Two lanterns, in `r3` and `r7` — the identical pair. Take the first, walk what the map insists is a full circuit, arrive in a room matching your memory exactly, and the counter still reads 1/2.

---

## L5 — The Orangery
### *One room, and its doors lead back into it.*

**Mechanism.** A single cell, self-glued: north doorway ↔ west doorway, south ↔ east.

Not a torus — the engine glues doorways, not walls, so the room does not wrap. You walk *out* of one doorway and *in* through another, and it happens to be the same room. Four norths return exactly to the start; the commutator `N,S,E,W` is a translation of ~35 m. **Two loops that each close, whose order of travel matters.** The first non-abelian house in the game.

**What it looks like.** The renderer draws the room inside itself to depth 3 — the same colonnade receding through every doorway. Confirmed working.

**What the player does.** A dense colonnade splits the floor into regions with no walkable route between them *inside* the room; you cross by leaving through one doorway and returning through another. Three lanterns, one per region. Columns are the only free-standing collider the engine has besides crates, and a colonnade is what an orangery has anyway.

**Contrast.** After L4's sprawl, a level with one cell. All the difficulty is conceptual.

---

## L6 — The Aviary
### *Seeing is not connectivity.*

**Mechanism.** Nine cells, densely inter-glued, **mostly by grilles**. The walkable subgraph is one specific path.

The consequence that makes the level: the lantern is visible from six rooms and **from a different apparent direction in each**, because each sightline is a different path through the graph and therefore a different composed transform. There is no direction the lantern "is in". The audio does exactly the same thing, from the same transforms, so the ears agree with the eyes and both disagree with intuition.

**Fairness.** Grilles render bars and doors do not, so the player can always *see* which openings are walkable. The puzzle is routing, not hunting for a hidden door.

**Thesis.** Levels 1–5 teach the player to trust what they see through a doorway. This one makes that trust the trap.

**Objective.** Three lanterns; the hard one is in the cell with the most grilles and the fewest doors.

---

## L7 — The Campanile
### *Height and heading are entangled.*

**Mechanism.** Six flights and six landings, each flight ramped, each landing a 90° turn.

```
one lap    yaw 180°, rise 5.1 m, and 11.5 m sideways
two laps   yaw 0°, translation (0, −10.2, 0) — pure vertical, drift cancelled exactly
```

One lap leaves you facing backwards, higher, and displaced. Two restore your heading and double the climb. The tower has no top.

**Escalation over L3.** The Ascent's stair had *pure* vertical holonomy in a single lap, and is legible once you spot it. Here rotation and rise are coupled and the period is two laps, so "the same landing" means one thing to your feet and another to your compass.

**What sells it, given no floor doors.** Wall grilles between landings that are a lap apart, and one from a high landing back into the entrance court — the Ascent's proven trick. You look across, level, into a room whose floor is five metres below yours.

**Objective.** Three lanterns on three landings deliberately hard to tell apart — L4's trick, with height as an extra axis of confusion.

---

## L8 — The House
### *The house is a group, and you have been learning its presentation.*

**Mechanism.** A **triple cover**: twelve rooms in a ring, each a left turn. 4 lefts closes the map, 8 lefts closes the map, only 12 bring you home. Which lap you are on is undecidable by eye and by notebook. Only chalk knows.

**Multiplied by** (replacing the unbuildable vertical stacking): the hub has **three doors into the ring**, at `r1`, `r5` and `r9` — three rooms that are visually identical and are not the same room. The hub proves the triple cover by itself: three doorways in one wall, leading to what appears to be one room, and it is three.

**Objective.** Five lanterns spread across all three laps, placed so that every hub door must be used. Finishing requires knowing not just where you are but *how many times you have been there*.

---

## Difficulty curve

| | Level | New idea | Instrument it forces | Cells |
|---|---|---|---|---|
| 1 | Three Lefts | angle defect | — | 10 |
| 2 | The Long Gallery | translational holonomy | — | 7 |
| 3 | The Ascent | vertical holonomy | — | 11 |
| **4** | **The Cloister** | **a correct map that lies** | **chalk** | 9 |
| **5** | **The Orangery** | **non-commuting loops** | **chalk, and thinking** | **1** |
| **6** | **The Aviary** | **sight ≠ reachability** | **the notebook, seriously** | 10 |
| **7** | **The Campanile** | **coupled rotation and rise** | **chalk + counting** | 13 |
| **8** | **The House** | **triple cover** | **everything** | 20 |

The alternation is deliberate — big graph, one cell, medium, tall, everything. Five levels of "bigger maze" would be tedious rather than harder.

---

## Known risks

1. **L6 could be frustrating rather than hard.** Mitigated by bars being visible, but it needs walking before it ships.
2. **"Collect N lanterns" is right where returning is hard and a chore where it is merely long.** Watch it in L6 especially.
3. **L5 may be too short.** If one cell does not sustain a level, add a vestibule with a grille into it so the orchard is seen before it is entered.


---

## What implementation changed (revision 3)

All five are built, wired into the menu, and asserting green. Five more corrections came out of building them, none of which reading the plan would have found:

| | Found | Fix |
|---|---|---|
| **1** | **The Aviary's ring holonomy had the wrong sign.** `n` rooms of one left turn give `(4 − n)` quarter turns, so nine rooms is −450° ≡ −90°, not +90°. | Assertion corrected. The load-time check caught it, which is exactly what it is for. |
| **2** | **The Campanile threw at construction**: a court grille at `sill: 1.4` paired with an oriel grille at the default `0.95`, and paired doors must agree on `sillRel`. | Matched the sills. |
| **3** | **The Orangery's colonnade had a 1.2 m hole at each wall.** `for (x = −7.4; x <= 7.4; x += 1.15)` stops at 6.4. A barrier with a gap in it is a doorway. | Place columns by dividing the span into equal parts, so both ends always reach the wall. Verified by walking at every metre across the room. |
| **4** | **A painting hung across a doorway.** Alternate Campanile landings put an oriel door on the E wall at offset 0, where the painting already was. | Painting moved to offset −1.2. |
| **5** | **The claim that the Campanile's oriels sit at three visible heights was false.** Both cells are flat-floored, so that portal carries no rise. | Replaced with what is actually true, and better: you climb ten metres and every oriel window looks *level* into the courtyard you started in. The Penrose payoff, visible through a window. |

| **6** | **The House's five chambers sat at rooms 2, 4, 7, 10 and 12, which is not symmetric under the four-room shift.** The three sheets therefore had different neighbourhoods, and a player could eventually tell them apart by walking — which is the one thing this level cannot allow. | Six chambers on the even rooms (2, 4, 6, 8, 10, 12), a set that maps to itself under the shift, and three hall grilles, one per sheet. Verified by comparing the door-and-prop signature of each sheet: all three are now byte-identical. Six lanterns instead of five. |

Items 3, 4 and 6 are the interesting ones, because the holonomy assertions cannot catch any of them. A level can be mathematically perfect and still have a barrier you walk through or a picture hung over a door. The colonnade was verified with the real physics loop rather than by reading the numbers, which is the only way that class of bug shows up.

### Final shape

| Level | Cells | Checks | Mechanism |
|---|---|---|---|
| The Cloister | 12 | 5 | 8-ring double cover; four lefts close the map on the wrong room |
| The Orangery | 2 | 8 | one self-glued cell; `n·w ≠ w·n`, commutator = 28 m of pure translation |
| The Aviary | 13 | 6 | 9-ring criss-crossed with grilles; sight ≠ reachability |
| The Campanile | 16 | 6 | 6-flight helix; one lap = 180° + rise, two laps = pure vertical |
| The House | 19 | 10 | 12-ring triple cover; three hall doors onto one room that is three |
