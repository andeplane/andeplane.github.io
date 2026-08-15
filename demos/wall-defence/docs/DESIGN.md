# Wall Defence — Design & Implementation Plan (rev 2)

JezzBall × tower defence roguelite with a client-side daily board.
Source: [issue #21](https://github.com/andeplane/andeplane.github.io/issues/21).
Rev 2 incorporates a three-lens review (game design, architecture, scope/UX);
outcomes are folded in below and summarized in §8.

## 0. Scope for v1 (this branch)

In: deterministic sim core, classic JezzBall feel, TD layer (income, 2 towers ×
3 tiers, breakers, telegraphed waves, breach/drain), roguelite layer (pick-1-of-3
at quotas, 8 upgrades, 4 ball types), **client-only** daily board (UTC date seed,
localStorage best/streak, 12×8 emoji share card). Out: backend/leaderboard,
endless mode, meta progression. Ships as `demos/wall-defence/`, a hermetic
Vite + TypeScript app, 2D Canvas, no three.js.

## 1. The load-bearing rule (as constraints)

One verb — *seal a region* — feeds four systems:

1. **Score**: `claimedPct` (CLAIMED + DRAINING cells) is the only progress metric.
2. **Economy**: income each second `= 2 + floor(claimedPct / 10)`, plus a burst
   on every capture `= floor(fresh × mult / 4)` where `fresh` counts only cells
   claimed for the **first time** this run (`everClaimed` bitmap — re-sealing
   farmed territory restores income and quota but is never a money printer)
   and mult is 1 / 2 / 3 for captures ≥ 0 / 5 / 10 % of the board (superlinear
   burst kills sliver-spam; big claims get fanfare).
3. **Build surface**: towers only on CLAIMED cells; a breached (draining) or
   unclaimed region's towers power down (grayed, inert, non-solid — balls never
   damage towers; losing the region is punishment enough).
4. **Enemy space**: balls live only in open space; claims compress them.

Money must always want spending, and tower forests must not sterilize the
board: placing a tower costs `base × (8 + towersOwned) / 8` (escalating), and
tower tiers are the other standing sink (§2 Towers).

## 2. Game definition

### Board

- **48 × 32 cells** (3:2), design size 1152 × 768, scaled to viewport with
  letterboxing. 48×32 divides exactly into 12×8 blocks of 4×4 for the share card.
- Cell states: `OPEN` (ball space), `WALL`, `CLAIMED` (solid, buildable),
  `DRAINING` (breached claim in its grace window — non-solid, counts as claimed
  for score until it fully drains).
- The perimeter is the coordinate bounds, not cells — so it is structurally
  immune to breakers.

### Cut lifecycle (the verb, specified)

- Anchor cell + orientation (H/V). Two heads grow from the anchor center at
  `WALL_SPEED` along the row/column, positions in Q8.
- Cells become **provisional** the tick a head's position enters them.
  Provisional status is an **overlay** — the underlying cell state (and any
  drain timer) is untouched until conversion, so a shattered half "reverts" by
  simply discarding the overlay. Heads treat DRAINING as passable; a DRAINING
  cell overrun by a completing half becomes WALL like any other.
- Provisional cells are **not solid** (classic JezzBall): a ball AABB
  overlapping any provisional cell of a half **shatters that half** (the other
  half keeps growing). This one rule also covers "head grows into an occupied
  cell". The anchor cell belongs to **both** halves: either shatter discards it
  unless a half already completed (completion converts anchor to WALL).
- A head completes when it reaches a solid cell (WALL/CLAIMED) or the board
  edge; its half converts to permanent WALL immediately.
- **Cooldown precedence**: each shatter event applies the cut cooldown at its
  tick — **2.5 s**, or 1.25 s if the shattering ball was a chaser (you were
  hunted, not greedy); if both halves shatter in one tick, the shorter applies.
  A later completion of the surviving half neither clears nor adds cooldown.
  Fully successful cuts have no cooldown.
- One active cut (Twin Cut upgrade: two).

### Claims, breaches, drains (recompute from scratch)

On *any* change that can affect region membership — a cut completes, a breaker
eats a wall cell, a drain expires, or a ball is removed or spawned — recompute
connected components over all non-WALL cells (4-way):

- A component containing **no ball** → all its cells become/stay `CLAIMED`
  (this is both new claims and the rescue of a re-sealed draining region) —
  but **only on a tick in which a cut completed**. Claims come from the verb,
  never from ball deaths alone: killing out a pocket leaves it open until one
  cheap cut takes it. (Rev 3: the earlier claim-on-death rule let turrets
  clear the board and auto-claim everything — the snowball that broke all
  balance.)
- A component containing a ball → its OPEN cells stay OPEN; its CLAIMED cells
  become `DRAINING` with a **4 s** timer (loud: klaxon, edge glow, paint
  visibly draining from the hole); already-DRAINING cells keep their timers.
- Ball membership = any ball AABB overlaps a cell of the component, evaluated
  after same-tick spawns.
- A ball AABB entering a DRAINING cell → that whole draining group unclaims
  immediately (grace is for repair, not cohabitation).
- Drain timer expiry → cells become OPEN.

Plugging is the Rampart moment: a 1-cell hole is resealed by a cut anchored in
the gap (both heads hit WALL almost instantly). Nested regions, walls shared by
two claimed regions, and simultaneous seals all fall out of the recompute — no
region identity is tracked across ticks. O(grid) = 1536 cells, trivially cheap.

### Run structure — 10 waves, ~5 minutes

Continuous sim; waves spawn on a fixed schedule (wave 1 at 0:05, then every
27 s — win check at ~4:38). Telegraph: portal cells on the perimeter glow 5 s
before spawn; balls enter through them. No composition text — the glow is the
telegraph. If the border is sealed, spawns relocate to the nearest open cell
(pressure follows the shrinking enemy space); a 100 %-sealed board gets a 3×3
punch. Late waves spawn tougher, faster balls (+1 HP per 3 waves, +3 Q8/tick
per 4 waves) and breakers gnaw faster (−4 ticks/wave, floor 42) so tower DPS
growth never sterilizes the board.

- **Quota**: `Q = [12, 18, 25, 32, 40, 48, 55, 62, 66, 68] %`. At the spawn
  tick of wave `w+1`, if `claimedPct < Q(w)` → run over. Quota check counts
  DRAINING as claimed, so a breach seconds before a spawn is survivable if you
  plug it.
- **Win**: 30 s after wave 10 spawns with `claimedPct ≥ Q(10)`.
- **Upgrade cadence**: first crossing of each `Q(w)` queues a pick-1-of-3 in a
  FIFO (`state.pendingPicks`); one modal at a time, and a capture that crosses
  two quotas queues two. A surviving player necessarily crosses every quota, so
  cadence has an automatic floor — first pick lands inside ~30 s.
- **All percentage boundaries compare exact rationals in integers**
  (`claimedCells × 100 ≥ Q × 1536`, same for burst tiers and Garrison);
  `floor(claimedCells × 100 / 1536)` is display-only.
- Two slow bouncers are on the board at t=0 so cutting starts immediately.
  Wave 1 is the implicit tutorial: 2–3 slow bouncers, generous spacing (seeded,
  so guaranteed), no breakers. Starting money (30) + base income guarantees the
  first turret is affordable before wave 2's breakers land.

### Ball zoo (v1: 4 types)

| Type | HP | Behaviour | Introduced |
|---|---|---|---|
| Bouncer | 3 | classic 45° ball | wave 1 |
| Breaker | 5 | steers (quantized headings) to the nearest reachable WALL cell adjacent to open space, gnaws it (1.5 s) → topology recompute; perimeter immune by construction; does not attack growing cuts (that's the chaser's job) | wave 2 |
| Chaser | 4 | steers toward the active growing head; behaves as a bouncer when no cut is active; ≤ 5 alive at once (accumulating chasers are the pressure that only killing them relieves) | wave 3 |
| Splitter | 6 | bouncer; on death splits into 2 fast 1-HP fragments | wave 6 |

Targeting/steering ties break by lowest entity id. Balls have HP so turrets can
remove them — killing is the TD half. **Towers must be mandatory**: breaker
throughput is tuned so re-sealing cannot outpace re-opening without kills, and
`npm run check` asserts a no-tower bot loses by wave ≤ 6 (§4 verification).

### Towers (v1: 2 types × 3 tiers, on CLAIMED cells)

| Tower | T1 | T2 | T3 |
|---|---|---|---|
| Turret | 20¢ — 1 dmg / 0.8 s, range 6 | 40¢ — 2 dmg | 80¢ — 2 dmg / 0.5 s, range 8 |
| Slow field | 30¢ — aura r4, ×0.6 speed | 45¢ — ×0.45 | 70¢ — r6, ×0.45 |

Hitscan (no projectiles, no line-of-sight). Slow is a per-tick displacement
modifier — canonical velocity is never mutated (preserves 45° invariant).
Tap/click a tower → upgrade/sell popup. Tiers are the standing money sink.

### Upgrades (pick-1-of-3; pool of 8, verb-mutating, no flat +stats)

1. **Sparking edge** — growing heads fire 1 dmg/s at the nearest ball.
2. **Twin cut** — two simultaneous cuts.
3. **Detonating claims** — sealing deals 3 dmg to balls within 2 cells.
4. **Armored walls** — a growing half survives one ball hit (flashes, continues).
5. **Fast hands** — +40 % wall growth speed.
6. **Fresh paint** — newly claimed regions are breaker-proof for 15 s.
7. **Garrison** — sealing a region ≥ 4 % of the board spawns a free T1 turret in it.
8. **Overclaim dividend** — +1¢/s per % above the current quota, capped at
   +12¢/s (a greed reward, not a money printer).

Offers: the daily seed fixes a **permutation** of the 8 upgrades (substream
`(seed, "offers")`); each pick deals the next 3 *unowned* upgrades in
permutation order — identical for all players until their picks diverge, never
offering owned duplicates. Fewer than 3 left → smaller offer; empty pool →
the pick is skipped entirely (no pause). With 10 quotas and 8 upgrades, late
picks are expected to shrink/skip.

## 3. Daily board + share card (client-only)

- Day boundary = **UTC**; HUD end screen shows "next board in H:MM".
  Seed = `fnv1a("wall-defence" + YYYY-MM-DD)`. Board number `#N` counts days
  from an epoch constant (set at ship date).
- Seed drives, via named substreams: initial ball placement, portal positions,
  wave composition jitter (within the fixed type-introduction order), upgrade
  offers. Free-play mode = random seed, marked practice, no streak.
- **Rules written down**: unlimited retries; localStorage keeps best result
  (waves, %, attempt number); share card shows best, labelled `try N`;
  streak = finished at least one daily run (win or lose) that UTC day.
- Share card: 48×32 grid → **12×8 emoji** (exact 4×4 blocks). Precedence:
  🟥 if any ball inside the block, else 🟩 if ≥ 9/16 cells claimed (DRAINING
  counts as claimed), else ⬜ (dark-mode safe).
  Header `Wall Defence #N · wave 7/10 · 63 % · try 2`. Copy via
  `navigator.clipboard`, `navigator.share` where available.

## 4. Architecture

```
demos/wall-defence/
  package.json          # hermetic; vite + typescript + tsx only
  vite.config.ts        # base: process.env.BASE_PATH ?? '/demos/wall-defence/'
  index.html            # canvas + #ui root
  src/
    sim/                # ZERO DOM imports — runs in Node
      constants.ts      # every tunable; all durations in ticks
      fixed.ts          # Q8 helpers, isqrt-free steering LUT (16 headings,
                        #   baked literal Q8 sin/cos — no Math.sin at runtime),
                        #   floor-division helper (never (a/b)|0 on negatives)
      rng.ts            # mulberry32 + substream(seed, label, index)
      state.ts          # GameState, init, incremental FNV-1a hash in fixed
                        #   schema field order (no JSON)
      events.ts         # StartCut, PlaceTower, UpgradeTower, PickUpgrade…
      balls.ts          # per-axis integrate+resolve (kills corner tunneling),
                        #   AABB half-extent 96 Q8, speed clamp < 1 cell/tick
      walls.ts          # cut lifecycle per §2
      claims.ts         # component recompute per §2
      towers.ts         # targeting (squared distances, lowest-id ties)
      waves.ts          # schedule, portals, quotas, composition
      upgrades.ts       # pool, offers, effects
      sim.ts            # step(state, tickEvents) — the only public entry
    render/
      draw.ts           # board, balls, walls, towers, paint flood, drain
      juice.ts          # particles, +X.X% ticks, shake, portal glow
      theme.ts          # barren open space → lush claimed paint
    ui/
      hud.ts            # ONE top bar: claimed% fill + quota tick ◆ + wave
                        #   countdown inside it; money number; cooldown ring
                        #   drawn on the ghost cursor, not in the HUD
      hints.ts          # state-triggered one-shot hints (onboarding, §5)
      picker.ts         # pick-1-of-3 modal
      radial.ts         # tower build/upgrade popup
      end.ts            # win/lose + share card + restart + next-board timer
    input.ts            # Pointer Events; desktop hover-ghost; touch
                        #   place-ghost → drag/toggle → confirm (§5)
    daily.ts            # UTC seed, localStorage, emoji card
    main.ts             # rAF loop, fixed-timestep accumulator, interpolation
                        #   (prev-tick position snapshot), wiring
  tools/
    determinism.ts      # two independently constructed runs of the same event
                        #   log → compare PER-TICK hash streams (reports first
                        #   divergent tick)
    selfplay.ts         # scripted bot, N seeds → wave/% stats + assertions
  docs/DESIGN.md
```

### Determinism rules

- All sim state is integers (Q8: 1 cell = 256 units). No floats, `Math.random`,
  `Date.now`, or transcendentals inside `sim/`; steering uses the baked LUT.
- Entity ids from a monotonic in-state counter, never reused; removal =
  in-place filter preserving order; same-tick spawns get ids in spawn order.
  All "nearest" ties over entities break by lowest id; ties over **cells**
  break by lowest row-major index; a chaser with multiple live heads (Twin
  Cut) targets the nearest head, ties by lower cut id then head A before B.
  Iteration is index order / row-major only.
- 60 Hz fixed timestep. `step(state, tickEvents)` is fully determined by
  (seed, event log). Event log format:
  `{version, constantsHash, seed, events: [{tick, event}…]}` — intra-tick order
  is array order.
- **Pause lives in the sim**: crossing a quota enqueues into
  `state.pendingPicks`; while non-empty the current head is the offer;
  `step()` no-ops (tick frozen) until `PickUpgrade` arrives, so pauses don't
  exist in the log. UI overlays (radial, end) additionally just stop calling
  `step()` — wall-clock pauses that the sim never sees. **One UX rule: any
  overlay pauses the game** (single-player; realtime placement pressure buys
  nothing, and it rescues tower placement on touch).

### Verification loop (project memory rules)

`npm run check` inside the demo = `tsc --noEmit` + `tools/determinism.ts`
(identical per-tick hash streams across two replays) + `tools/selfplay.ts`
(fast gate: expert wins sometimes; a no-tower bot never wins, median wave ≤ 7).

The full balance contract lives in **`npm run balance`** (`tools/balance.ts`):
six bot profiles — novice / average / expert skill tiers (reaction time,
sampling breadth, deliberate error rate) plus sliver-spam, turtle, and
no-tower strategy archetypes — over 20+ seeds, with instrumented metrics
(shatters, breach cells, drain rescues, towers, end-money) and eleven
criteria: the skill ladder is monotone; expert ≥ 40 % win, average 5–60 %,
novice ≤ 15 % but median wave ≥ 3; no-tower never wins (median ≤ 7, max ≤ 8);
sliver-spam and turtling never beat balanced play; walls stay contested
(shatters and breaches happen to experts); plugging rescues happen. Balance
claims are only made from these stats (self-play memory rule).

Visual verification: Playwright + real Chrome screenshots after real frames
(never `--virtual-time-budget`).

## 5. Input & onboarding

- **Desktop**: hover shows a full ghost line; click commits; Space/right-click
  toggles orientation; cooldown ring on the cursor.
- **Touch**: first tap places an adjustable ghost (drag to move; on-screen
  toggle flips orientation); tap the ✓ (or the ghost again) commits. No blind
  commits into a cooldown.
- **Tower placement (paused under overlay)**: tap claimed territory → nearest
  valid cell highlighted with a magnified cursor, drag to adjust, radial
  confirms. Portrait shows a "rotate for best experience" nudge; grid never
  changes per device (daily fairness).
- **Onboarding = wave 1 + three state-triggered one-liners** (`ui/hints.ts`),
  fired once each: "Tap to cut" (idle 3 s), "Empty regions become yours — build
  towers there" (first claim), "Keep the bar past ◆ before the wave lands"
  (first telegraph). The quota tick ◆ on the HUD bar is the loss-condition
  teacher.

## 6. Site integration

- `src/content/projects/wall-defence.ts` (`ProjectMeta`, `liveUrl:
  '/demos/wall-defence/'`, repoUrl to the tree).
- `public/projects/wall-defence/preview.png` — end-of-run trophy board.
- Demo auto-discovered by `scripts/build-demos.mjs`; root `npm run build` must
  pass before merge (a broken demo breaks site deploy).

## 7. Implementation order

1. Sim core: grid, balls, cuts, claims recompute, hash — determinism test green.
2. Playable classic: renderer, input, claim juice — JezzBall feel check.
3. TD layer: income, turret+slow tiers, breaker, waves/quotas/telegraphs,
   drain/plug.
4. Roguelite: picker, 8 upgrades, chaser+splitter, end screens.
5. Daily + share card.
6. Balance via self-play (assertions 2–3), constants tuning.
7. Site integration, preview image, root typecheck + build.

## 8. Review outcomes (what changed in rev 2)

- **Towers-mandatory is now a tested guarantee** (no-tower bot must lose), not
  an assertion; breaker throughput is the structural pressure.
- **Breach → 4 s DRAINING grace** with plug-to-rescue replaces instant unclaim
  (rubber-band complaint); balls never destroy towers (no double jeopardy).
- **Cut content**: Glass/Absorber/Bumper cut; Splitter added (wave 6); 2 towers
  with tiers (tiers = the missing economy sink); upgrade pool rebuilt with
  anti-breaker options and no flat +stats.
- **Determinism hardened**: cut lifecycle specced; claims are identity-free
  recomputes; pause is sim state; RNG substreams keyed by (seed, label, index);
  baked steering LUT; per-axis movement; id tie-breaks; schema-ordered hash;
  per-tick divergence reporting.
- **UX**: any overlay pauses; touch ghost-then-confirm; minimum HUD (one bar +
  ◆); composition text cut; onboarding hints added; board 48×32 for an exact
  12×8 share card; daily rules (UTC, retries `try N`, streak) written down.
- **Superlinear capture burst** (×1/×2/×3 tiers) counters early sliver-spam;
  chaser moved to wave 3; chaser-caused shatters halve the cooldown.

## 9. Balance outcomes (rev 3 — from the profile × seed simulation suite)

Running six bot profiles over 20–30 seeds exposed and fixed four dominant
strategies the original tuning missed:

- **Auto-claim snowball**: turrets killing the last balls claimed the whole
  board → all quotas crossed and all upgrades owned by t=60 s. Fixed by the
  verb-only claim rule (§2).
- **Breach-reclaim money printer**: every breach → re-seal cycle re-paid the
  capture burst. Fixed by first-time-only bursts (`everClaimed`).
- **Overclaim printer**: +2¢/s per % above quota dwarfed all other income.
  Now +1¢/s capped at +12.
- **Turret forests** (80–120 towers) sterilized every wave mid-flight. Fixed
  by escalating placement cost plus wave-scaled ball HP/speed and breaker
  gnaw speed.

Resulting ladder (30 seeds): novice 13 % win / median wave 8, average 60 % /
10, expert 60–65 % / 10; sliver 17 %, turtle 7 %, no-tower 0 % (median 7).
