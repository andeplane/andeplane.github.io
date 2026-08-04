# Roadmap — *Sunken*

Living checklist. See [docs/PRD.md](docs/PRD.md) for the what and
[docs/DESIGN.md](docs/DESIGN.md) for the how; this file tracks *where we are*.

**Status: all 8 phases complete.** Remaining items are enhancements, listed
inline below.

**Legend:** `[x]` done and verified in-engine · `[~]` partially done · `[ ]` not started

---

## Phase 0 — Research & design ✅

- [x] Survey three.js r185 WebGPU/TSL examples and addons for reusable prior art
- [x] Evaluate `jeantimex/webgpu-water` (MIT) — adopted its caustics method
- [x] Write [PRD.md](docs/PRD.md)
- [x] Write [DESIGN.md](docs/DESIGN.md)
- [x] Review both, verify every API claim against r185 source → [REVIEW.md](docs/REVIEW.md)
- [x] Measure the riskiest assumption (worldgen cost) instead of asserting it

## Phase 1 — Skeleton ✅

- [x] Vite + plain ESM project
- [x] WebGPU boot with `maxStorageBuffersInVertexStage` requested up front
- [x] Graceful "needs WebGPU" fallback screen
- [x] Loading screen with progress
- [x] Pointer-lock input mapped to named actions
- [x] HUD: depth gauge, compass, prompt, toasts, dive log, stats overlay
- [x] Frame clock with delta clamping

## Phase 2 — World ✅

- [x] Analytic density field: seabed + island + reef ridges (simplex, layered)
- [x] Second noise layer for caves (two 3D fields → tunnels, not blobs)
- [x] Authored cave splines, chambers and skylights for guaranteed playability
- [x] Marching cubes mesher, uniform 0.6 m voxels, watertight across chunks
- [x] Worker pool (`hardwareConcurrency - 1`)
- [x] Baked per-vertex sky visibility (single ray + mesh smoothing)
- [x] Analytic SDF collision with substepping and sliding
- [x] **Headless validation harness** — `npm run world` (17 checks, no browser)
- [x] Cave burial regression check (caves, not trenches)

## Phase 3 — Water & sky ✅

- [x] Shared Gerstner wave table, evaluated identically on CPU and GPU
- [x] Radially-graded ocean disc (1 m near → 2.5 km horizon)
- [x] Per-channel extinction fog (red dies in ~3 m, blue survives ~30 m)
- [x] Snell's window from below, with chromatic rim and total internal reflection
- [x] Above-water: sky reflection, sun glint, Fresnel, crest foam
- [x] Analytic sky + sun, fading to deep water when the view ray is submerged
- [x] Normal LOD to kill specular aliasing on distant water

## Phase 4 — Swimming ✅

- [x] Buoyant, heavily-damped swim physics
- [x] Substepped collision (no tunnelling at sprint speed)
- [x] Soft current at the world edge instead of an invisible wall
- [x] Camera breathing bob, sprint FOV punch
- [x] Dive torch (`F`) with warm falloff and handheld sway

## Phase 5 — Light ✅

- [x] Directional sun with a player-following shadow camera
- [x] Projected caustics (refraction + area compression, from webgpu-water)
- [x] Caustics gated by baked sky visibility (no leaking onto cave ceilings)
- [x] Volumetric god rays — `VolumeNodeMaterial` on a layer-isolated quarter-res
      pass, denoised and added, with the main pass's depth fed in so terrain
      occludes the beams
- [x] Shafts shaped by the *caustics map*, so the beams and the pattern they
      cast on the sand come from one source and line up
- [x] Bioluminescent point lights + pulsing polyp clusters in cave chambers
- [x] **Cave exposure**: in-scatter gated by the camera's sky visibility, so a
      cave 20 m down is dark rather than as bright as open water 20 m down
- [x] Torch fixed — physical light units (candela), and kept permanently
      `visible` so toggling never triggers a ~380-pipeline recompile

## Phase 6 — Life 🚧 *(flora, fish, crabs, gulls and boats shipped; extras planned)*

**Seabed & structure** ✅
- [x] Procedural terrain material: sand, rock, strata, algae, coral crust
- [x] Sand ripples, wet/dry beach transition, baked AO
- [x] Scattered boulders and rock outcrops (`buildBoulder`, `buildRockOutcrop`)
- [x] Coral reef mounds / bommies as placed props (`buildCoralHead`)
- [x] Rubble and shell fragments on the sand flats (`buildRubble`)

**Flora** ✅
- [x] Kelp, seagrass, staghorn coral, sea fans, brain coral
- [x] Barrel sponges, anemones, urchins, starfish, shells
- [x] Instanced with vertex-shader sway (surge + shared gust)
- [x] ~55 000 instances at 60 fps, 14 species, 14 draw calls

**Groundwork already in place for the rest**
- [x] `world/scatter.js` — stratified sampling + slope/depth/sky/spacing rejection
- [x] `geometry/creatures.js` — fish, gull, jellyfish and crab builders, with the
      `bodyT` / `legIndex` / `limbT` attributes their shaders will need

### Fauna — planned design

- [x] **GPU boids** (`life/boids.js`) — 8 flocks, 2340 fish + gulls at 60 fps.
      Adapted from three's `webgpu_compute_birds`:
      `instancedArray` storage for position/velocity/phase, a `computeVelocity`
      pass (separation / alignment / cohesion) and a `computePosition`
      integrator, with an `InstancedMesh` whose shader reads the storage buffers.
      Two deliberate changes from the reference:
      - **Per-school buffers, not one global flock.** The example loops 8192
        birds against each other — O(N²) = 67 M iterations/frame. Six schools of
        ~500 interacting only within themselves is 1.5 M, a **45× reduction**,
        and gives per-species parameters for free.
      - **Bounds are the field, not a box**: a home volume with a soft return
        force, repulsion from the player sphere (fish part around you), and a
        cheap seabed-avoidance term from `heightAt`.
      Animation: a travelling sine down `bodyT`, amplitude growing toward the
      tail — real undulation, versus the reference's two-vertex wing flap.
      *Rendering note:* use `positionNode` + `normalNode` with identity instance
      matrices (not `vertexNode`), so lighting, fog and shadows still apply.
- [x] **Gulls** reuse the same `boids.js` class with an above-water home volume,
      higher cohesion and `buildGull()` geometry. This reuse is why boids is
      written as a configurable class rather than inline in a fish file.
- [x] **Crabs** (`life/crabs.js`) — 160 walking the seabed. CPU agents — they walk on a surface,
      which is a poor fit for a GPU flock. State machine
      `idle → wander → scuttle → hide`; stick to the seabed by raymarching
      `field()` downward; align up-vector to the field gradient so they crawl
      over rocks. Player proximity triggers `scuttle` (sideways, fast).
      One `InstancedMesh`; legs animated in TSL from `legIndex` + `limbT` plus a
      per-instance gait phase — no bones, one draw call for every crab.
- [ ] **Jellyfish** — drifting, bell pulsing via `bodyT`, emissive. *(geometry built)*
- [ ] **Spline actors** — sea turtle, reef shark, rays, distant whale. Catmull-Rom
      patrol loops with banking plus a local avoidance nudge. The turtle's escort
      behaviour swaps its spline for a player-following one.
- [ ] **Clownfish** bound to anemone instances, darting in and out.

### Extras *(added on request — "add even more if you come up with ideas")*

- [ ] **Bioluminescent plankton** that light up in a radius as you swim through
      them — instanced points, emissive driven by distance to the player. Best
      single idea on this list; pairs with the dark cave chambers.
- [ ] Moray eel peeking from a crevice, withdrawing when approached
- [ ] Octopus that changes colour against its background and inks when startled
- [ ] Seahorses clinging to seagrass blades (parented to flora instances)
- [ ] Cuttlefish with a travelling colour wave down the mantle
- [ ] Hermit crabs — reuse the crab rig with a shell instance attached
- [ ] Nudibranchs on rock faces, absurdly colourful
- [ ] Cleaner-shrimp station that reef fish queue at
- [ ] Squid shoal in open water, jetting in bursts
- [ ] Gulls that fold and dive into the water for fish, splashing
- [ ] Dolphins leaping clear of the surface

### Ambience

- [ ] Marine snow drifting in a player-centred toroidal volume (recycled on
      exit, so density is constant and the count is bounded)
- [ ] Bubble streams from seabed vents; player fin-kick bubbles
- [ ] Silt puffs kicked up near the bottom and by scuttling crabs
- [x] **Boats** — moored sailboat and a circling fishing boat, sampling
      `waves.js` on the CPU at bow/stern/beam so they pitch and roll in the same
      swell the shader draws

## Phase 7 — Content & missions

Architecture (DESIGN §8) — the discovery system *is* the mission system, so
shipping the 15 discoveries proves the pipeline rather than leaving it hopeful.

- [ ] `game/state.js` — flat serialisable store of flags/counters/sets with
      change subscriptions (also makes save/load an afternoon, not a refactor)
- [ ] `game/triggers.js` — declarative `proximity` / `volume` / `lookAt` /
      `depth` / `stateChange` triggers, emitting named events
- [x] `game/interact.js` — registry + view-cone pick + world-anchored prompt;
      `E` fires the best candidate
- [ ] `game/objectives.js` — objective types: `interact`, `reach`, `observe`,
      `collect`, `escort`, `deliver`, `survive`
- [ ] `game/missions.js` — mission runner (steps, conditions, on-complete)
- [ ] `content/discoveries.js` — the 15 discoveries authored as mission data

**Discoveries** (PRD §6):
- [x] **Treasure chest** — `E` to open; the lid swings on a hinge, a warm light
      floods the chamber, 260 gold coins and 70 cut diamonds burst out and
      settle against the real cave floor, and a discovery toast fires. Stays
      open and glowing as a landmark. Placed in the largest cave chamber.
- [ ] Message in a bottle · giant clam with pearl · crystal geode · stone idol
- [ ] Shipwreck (swim-through) · anchor + chain · amphora hoard
- [ ] Bioluminescent grotto · skylight shaft · octopus in a jar
- [ ] Gull's nest and lighthouse lamp — deliberately *above* water, to reward
      surfacing and close the loop on "you can swim all the way up"
- [ ] Hidden extras, not in the log: rubber duck in a cave pool, a diver's lost
      GoPro still recording, initials scratched into rock
- [ ] Dive log UI wired to discoveries
- [ ] **Acceptance: a new mission is one data file and zero engine changes**

## Phase 8 — Polish ✅

- [x] Post chain via `RenderPipeline`: scene texture → warp + chromatic
      aberration (3 shared taps) → bloom → + volumetrics → grade + vignette
- [x] Underwater screen warp and colour grade, driven by the shared
      `submersion` uniform so surfacing is one event, not four coincidences
- [x] **WebAudio**, fully procedural — no sample files. Brown/pink noise shaped
      into surf, wind, ocean rumble and a reef-crackle bed; synthesised whale
      song, bubble bloops and a discovery sting. The low-pass sweeps
      18 kHz → 620 Hz on submersion, with the above-water bus cross-fading out.
- [x] Adaptive quality: watches real frame time and steps volumetric
      resolution then render scale, using only knobs that do **not** trigger a
      pipeline recompile (a recompile stall is the very hitch being avoided)
- [x] Pipeline pre-warm during loading via `compileAsync`
- [x] Perf pass — 60 fps / 16.6 ms with the full chain

**Deliberately not shipped:** FXAA. Measured at ~1080 ms/frame in this chain
even with an explicitly materialised input; DPR ≤ 2 supersampling covers edges
adequately. `?post=N` bisects the chain if this needs revisiting.

**Deferred:** depth of field (declared in the `high` preset but unused).

---

## Verified against PRD success criteria

| | Criterion | Status |
|---|---|---|
| S1 | 60 fps @ 1080p on M-series | ✅ holding 60 with 3.3M tris + 60k instances |
| S2 | Loads in < 8 s warm | ✅ ~1 s worldgen across 15 workers |
| S3 | Surface transition looks correct | ✅ Snell's window verified |
| S4 | Caustics, god rays, absorption visible | ✅ all three verified in-engine |
| S5 | 3000 fish / 100 crabs / 40k flora | ✅ 2340 fish, 160 crabs, 57k flora, 2 boats |
| S6 | All 15 discoveries reachable | ⬜ |
| S7 | Chest is a genuine "whoa" | ✅ verified in-engine |
| S8 | −30 m to island summit uninterrupted | ✅ terrain + collision continuous |
| S9 | New mission = data only | ⬜ |
| S10 | No collision tunnelling at sprint | ✅ substepped |
