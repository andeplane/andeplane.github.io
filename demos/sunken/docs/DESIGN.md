# Technical Design — *Sunken*

Companion to [PRD.md](./PRD.md). Covers stack, world generation, render graph,
materials, simulation, and the mission architecture.

**Status:** draft v1 · **Last updated:** 2026-08-02 · Targets **three.js r185**

---

## 1. Stack decision

### Chosen: three.js r185 (`three/webgpu`) + TSL, Vite, plain JS ES modules

**Rationale.** The requirement is "WebGPU for efficient rendering", not "write a
renderer". three.js r185's `WebGPURenderer` is a mature WebGPU backend, and TSL
(Three Shading Language) is a node graph that compiles to WGSL — so we *are*
shipping WebGPU compute and WGSL, we just aren't re-implementing shadow maps,
PBR, clustered lights, render graphs and a post-processing stack first.

Concretely, r185 ships these, each of which maps onto a PRD requirement:

| Requirement | Existing implementation we build on |
|---|---|
| GPU fish + bird flocking | `webgpu_compute_birds` — `instancedArray` storage + 2 compute passes |
| God rays / light shafts | `VolumeNodeMaterial` + layer-isolated `pass()` (`webgpu_volume_lighting`) |
| Bloom, DOF, CA, AA, AO | `tsl/display/{BloomNode,DepthOfFieldNode,ChromaticAberrationNode,FXAANode,GTAONode}` |
| Custom per-channel water fog | `scene.fogNode` (`webgpu_custom_fog`, `webgpu_fog_height`) |
| Ocean surface reference | `objects/WaterMesh.js`, `objects/SkyMesh.js` |
| Sky / sun / atmosphere | `SkyMesh` + `PMREMGenerator` |
| Procedural terrain shading | `webgpu_tsl_procedural_terrain` (triplanar + noise patterns) |
| Marching-cubes tables | `objects/MarchingCubes.js` (`edgeTable` / `triTable`, MIT) |
| Caustics algorithm | [`jeantimex/webgpu-water`](https://github.com/jeantimex/webgpu-water) (MIT) — see §6.3 |
| Noise in shaders | MaterialX nodes: `mx_noise_float`, `mx_fractal_noise_vec3`, `mx_worley_noise_*` |
| Noise on CPU | `simplex-noise` (npm, MIT) — same field must be evaluable in JS for collision |

**Rejected alternatives.**

- *Raw WebGPU + WGSL.* Would cost weeks on infrastructure (shadow atlas, PBR,
  render graph, tone mapping) before the first fish moves. The visual bar in the
  PRD is the hard part; the plumbing is solved.
- *Babylon.js.* Comparable WebGPU support, but a smaller library of directly
  relevant examples and no TSL equivalent for the compute-driven boids path.
- *TypeScript.* three's TSL is dynamically typed by nature (node proxies);
  typing it adds friction for little safety. Plain ESM + JSDoc.

**Browser support:** WebGPU only. Feature-detect via
`addons/capabilities/WebGPU.js` and show a styled fallback screen.

---

## 2. Repository layout

```
sea-game/
├─ docs/{PRD,DESIGN}.md
├─ index.html                    importmap-free; Vite resolves bare specifiers
├─ vite.config.js
├─ src/
│  ├─ main.js                    boot → load → run
│  ├─ core/
│  │   ├─ renderer.js            WebGPURenderer, RenderPipeline, quality presets
│  │   ├─ clock.js               fixed-step accumulator + render tick
│  │   ├─ input.js               keyboard, pointer lock, action mapping
│  │   ├─ rng.js                 mulberry32 seeded PRNG
│  │   └─ events.js              tiny typed event bus
│  ├─ world/
│  │   ├─ field.js               ★ the density field — single source of truth
│  │   ├─ mesher.js              marching cubes over field.js
│  │   ├─ mesher.worker.js       worker entry
│  │   ├─ workerPool.js          navigator.hardwareConcurrency fan-out
│  │   ├─ chunks.js              chunk grid, mesh assembly, culling
│  │   ├─ waves.js               ★ Gerstner sum — JS and TSL from one table
│  │   └─ scatter.js             prop placement from the field + zone rules
│  ├─ render/
│  │   ├─ ocean.js               surface mesh + Snell/Fresnel material
│  │   ├─ sky.js                 SkyMesh, sun, PMREM env
│  │   ├─ waterFog.js            ★ scene.fogNode — per-channel extinction
│  │   ├─ caustics.js            ★ sun-space projected caustics pass
│  │   ├─ volumetrics.js         god-ray volume + layer pass
│  │   ├─ terrainMaterial.js     triplanar sand/rock + caustics + baked AO
│  │   └─ post.js                bloom → CA → vignette → tonemap
│  ├─ geometry/                  procedural mesh builders (fish, crab, coral…)
│  ├─ life/
│  │   ├─ boids.js               ★ reusable GPU flock (fish AND gulls)
│  │   ├─ schools.js             species config + spawn
│  │   ├─ crabs.js               CPU agents on the seabed
│  │   ├─ flora.js               instanced kelp/coral/anemone + sway
│  │   ├─ critters.js            turtle/shark/ray/whale spline actors
│  │   └─ particles.js           marine snow, bubbles, silt
│  ├─ props/
│  │   ├─ boats.js               buoyant boats sampling waves.js
│  │   └─ wreck.js, chest.js, …  discovery set-pieces
│  ├─ game/
│  │   ├─ player.js              swim physics + field collision
│  │   ├─ state.js               ★ flags/counters, serialisable
│  │   ├─ triggers.js            ★ proximity / volume / look-at
│  │   ├─ interact.js            ★ E-to-interact registry + raycast
│  │   ├─ objectives.js          ★ objective types
│  │   ├─ missions.js            ★ mission runner
│  │   └─ hud.js                 DOM overlay
│  └─ content/
│      ├─ discoveries.js         data — the 15 discoveries as missions
│      ├─ species.js             data — creature params
│      └─ missions/              data — future missions drop in here
└─ package.json
```

★ = load-bearing, gets the most design attention below.

---

## 3. World generation

**Determinism.** One `WORLD_SEED` constant seeds a single `mulberry32` chain,
from which every generator (terrain noise, cave splines, scatter, discovery
placement) draws a named sub-stream. The world must be byte-identical across
runs and across workers — cave *validation* (§3.4) and hand-placed discoveries
are meaningless otherwise, and it makes bugs reproducible.

### 3.1 The density field (`world/field.js`)

**One function is the single source of truth for the entire world's shape.**
Terrain meshing, collision, prop scattering, cave validation and creature
navigation all call it. This is the most important architectural decision in the
project: there is no possibility of the visual mesh and the collision geometry
disagreeing, because there is only one definition.

```js
// field(x, y, z) → signed density.  > 0 = solid rock,  < 0 = open water/air.
```

Built from layered **simplex noise**, as specified:

**Layer 1 — island + seabed profile (2D).** A radial island mask times ridged
FBM, blended into an offshore seabed that falls from −8 m to −30 m:

```
h(x,z) = lerp( seabed(x,z), island(x,z), islandMask(r) )
seabed  = -14 - 10·fbm2(p·0.012, 4 oct)            // −8 … −30 m
island  =  +6 + 22·ridged2(p·0.02, 5 oct)          // cliffs to +28 m
mask    = smoothstep(R_outer, R_inner, |p − centre|)
```

**Layer 2 — reef structure (2D + 3D).** Reef ridges and coral bommies added as
positive density above the seabed, so overhangs are possible:

```
h += reefRidge(x,z) · 6          // long wall following a warped ridge line
solid = h(x,z) − y                                  // >0 below the surface
solid += 3·fbm3(p·0.08, 3 oct) · overhangMask(y)    // 3D detail → overhangs
```

**Layer 3 — caves (3D, the second noise layer).** Two independent 3D simplex
fields; a tunnel exists where **both** are near zero. The intersection of two
zero-sets in 3D is a 1-D curve, which is why this produces *tunnels* rather than
blobby pockets — the standard "double ridged noise" carve:

```
w1 = |simplex3(p·0.035 + s1)|
w2 = |simplex3(p·0.035 + s2)|
cave = caveRadius − max(w1, w2)                     // >0 inside a tunnel
cave *= depthGate(y)      // no caves above +2 m except designated sea caves
```

**Layer 4 — authored cave guarantees.** Noise alone does not guarantee that a
cave is *reachable*, *connected*, or *interesting* — PRD §4.3 requires entrances
from open water, ≥ 2 openings, skylights and a cathedral chamber. So we union
explicitly authored SDF primitives onto the cave field:

```
cave = max( cave, capsuleSDF(p, spline_i) )   // guaranteed tunnels
cave = max( cave, ellipsoidSDF(p, chamber_j) )// guaranteed chambers
cave = max( cave, cylinderSDF(p, skylight_k) )// guaranteed ceiling shafts
```

Splines are generated from a seed, then **validated** (§3.4). Their endpoints
are placed by construction at points where the rock surface meets open water,
so every tunnel has a real mouth.

**Final composition** (boolean difference, "positive inside" convention):

```js
field(p) = min( solid(p), -cave(p) )
```

**Cost control.** The 3D layers are only evaluated when `|solid2D| < band`
(within ~12 m of the rock surface). Above that, the field is trivially open
water and returns early. This removes ~70 % of 3D noise evaluations.

### 3.2 Meshing (`world/mesher.js`)

**Marching cubes, uniform 0.6 m voxels, no LOD.** Tables lifted from three's
`MarchingCubes.js` (MIT; originally Paul Bourke's public-domain tables).

- World volume: **300 × 300 m**, y from −34 to +28 → `500 × 103 × 500` voxels
  ≈ 25.7 M.
- Chunked at **40³ voxels (24 m)** → `13 × 3 × 13 = 507` chunks.
- **Measured** (see [REVIEW.md §2](./REVIEW.md)): 5.3 s single-threaded for the
  full field sweep, yielding ~900 k triangles; the band gate cuts 3D noise
  evaluations to 38 % of voxels. Across a worker pool: ~0.35 s on 16 cores,
  ~1.8 s on 4 cores.
- Empty-chunk rejection first: sample a coarse 5³ grid plus the 2D height range
  over the chunk footprint; if the field does not change sign, emit nothing.
  Expect ~35 % of chunks to contain surface (~180 real meshes).
- Meshed in a **worker pool** (`hardwareConcurrency − 1`), transferring
  `Float32Array`s back as `Transferable`s. Target **< 4 s** cold.

Uniform resolution with no LOD is chosen deliberately: LOD stitching across a
marching-cubes volume is a well-known source of cracks, and at this world size
we do not need it. Frustum culling per chunk is sufficient.

**Per-vertex attributes produced by the mesher:**

| Attribute | Use |
|---|---|
| `position`, `normal` | geometry (normal from the analytic field gradient, not face averaging — smoother) |
| `skyVisibility` (float) | ★ single vertical raymarch of the field toward +Y |
| `cavity` (float) | local occlusion, from the same march's near steps |

`skyVisibility` is baked once and does a lot of work: it masks caustics (none
inside caves), drives ambient light (caves go dark), tints rock (algae growth
only where light reaches), and gates flora scattering. Baking it here is far
cheaper than any runtime GI approximation.

**How it is baked, and why not the obvious way.** The natural implementation —
a cone of ~16 rays per vertex — was costed during review at ~450 k vertices ×
16 rays × 12 steps ≈ **86 M extra field evaluations, ~40 s single-threaded**,
which is 8× the cost of meshing the entire world. Instead:

1. **One vertical ray** per vertex, 32 steps with geometric growth (far steps
   are coarse; occluders near the vertex matter most) ≈ 14 M evaluations,
   ~3 s single-threaded, ~0.2–0.8 s across the worker pool.
2. **2–3 edge-smoothing passes** over the chunk mesh afterwards, averaging each
   vertex with its topological neighbours. This recovers the soft, cone-like
   falloff that makes the term look like ambient occlusion rather than a hard
   vertical shadow — at effectively zero cost, since it touches only vertices
   that already exist.

Same visual result, ~6× cheaper.

### 3.3 Collision (`game/player.js`)

Because `field()` is analytic and cheap, collision is exact and needs no
collider meshes:

1. Integrate velocity in **substeps capped at 0.25 m** (prevents tunnelling at
   sprint speed — PRD S10).
2. At each substep, evaluate `field(p)`. If `> 0`, the player is inside rock.
3. Compute the gradient by tetrahedral finite differences (4 evaluations) and
   push out along `−∇field`, normalised, until clear plus a 0.45 m radius skin.
4. Project the residual velocity onto the surface tangent so the player *slides*
   along cave walls rather than sticking.

~12 field evaluations per frame — negligible.

### 3.4 Cave validation

A generation step that runs at build/boot and rejects bad seeds:

- **Flood fill** the open-water voxels from a known outside point at 1.2 m
  resolution. Any cave volume not reached is either re-connected by adding a
  capsule to the nearest reachable cell, or deleted.
- **Clearance check**: every point on an authored spline must have ≥ 1.6 m of
  clearance to rock in all directions, else the capsule radius is grown.
- **Entrance check**: each system must have ≥ 2 mouths whose centres see open
  water. Failing systems get an extra bore to the surface.

This is what turns "noise caves" into caves you can actually swim through.

### 3.5 Scattering (`world/scatter.js`)

Stratified jittered sampling over the world, then per-candidate:
raymarch down the field to find the surface, reject on slope, depth band,
`skyVisibility` and zone mask, then Poisson-reject against already-placed props
of the same class. Output is per-species instance matrices + per-instance
phase/scale/tint, uploaded once into `InstancedMesh` buffers.

---

## 4. Render graph

```
                 ┌─ shadow pass (directional sun, 2048², tight ortho)
                 ├─ caustics pass  → R16F 1024² sun-space texture   (§6.3)
                 │
  scenePass ─────┤  pass(scene, camera)                → colour + depth
                 │
  volumetricPass ┤  pass(scene, camera, {layers: VOLUMETRIC}) @ 0.25 res
                 │      └─ gaussianBlur(denoise)
                 ▼
      colour = scenePass + volumetric·intensity
                 ▼
      bloom(threshold, strength, radius)      ← makes gold/diamonds/biolum sing
                 ▼
      underwater grade: chromatic aberration + edge wobble + blue lift
                 ▼
      vignette → ACESFilmic tone map → canvas
```

Notes:

- `RenderPipeline` (r185's replacement for `PostProcessing`) drives this via a
  single `outputNode` graph; the `underwater` amount is a `uniform` lerped by
  camera depth so surfacing visibly *changes the grade*.
- Depth of field is **off by default** (cost) and enabled only on the `high`
  quality preset.
- Transparency order: opaque terrain/props → boids → particles → **ocean
  surface last** (it is the only large transparent surface and must composite
  over everything).

---

## 5. Quality presets

Auto-selected from a 60-frame warm-up measurement, user-overridable.

| | low | medium | high |
|---|---|---|---|
| Render scale | 0.75 | 1.0 | 1.0 (DPR ≤ 2) |
| Volumetric pass | off | 0.25 res, 8 steps | 0.35 res, 12 steps |
| Shadow map | 1024 | 2048 | 2048 |
| Caustics map | 512 | 1024 | 1024 |
| Fish | 1 200 | 3 000 | 4 500 |
| Flora instances | 15 k | 40 k | 60 k |
| Bloom / CA / vignette | bloom only | all | all + DOF |
| Draw distance (fog) | 45 m | 60 m | 75 m |

---

## 6. Materials and effects

### 6.1 The ocean surface (`render/ocean.js`)

**Geometry.** A 400 × 400 m grid, 256 × 256 segments, recentred on the player's
XZ each frame and **snapped to the cell size** so vertices do not swim.

**Waves (`world/waves.js`).** A sum of 6 **Gerstner** waves (not sine —
Gerstner's horizontal pinch is what makes crests sharp and troughs broad, and
it is what sells "amazing waves" when the player surfaces). The wave table is
defined **once** as plain data and consumed twice:

- in TSL, for the vertex displacement and analytic normal;
- in JS, for boat buoyancy, the camera waterline test, and spray spawn points.

This shared-definition rule is the same discipline as `field.js`: no
divergence between what you see and what you collide with.

**Material.** One `NodeMaterial`, `side: DoubleSide`, **`fog: false`**,
branching on `frontFacing`.

The `fog: false` is not incidental. `scene.fogNode` (§6.2) applies water
extinction to *every* material, so leaving it on would attenuate the ocean
surface twice — once by the fog node and once by its own below-surface
shading — visibly washing out the Snell's window, which the PRD calls the money
shot. The ocean owns its own attenuation.

*Seen from above* — sky reflection from the PMREM env, sharp sun specular,
Fresnel blend to a deep-blue transmission colour, foam from
`smoothstep` on wave-crest steepness plus shoreline depth, and a subtle
normal-map detail scroll for the small ripples the vertex grid cannot resolve.

*Seen from below (the money shot)* — **Snell's window**:

```
cosθ  = dot(viewDir, surfaceNormal)
sinθ  = sqrt(1 − cosθ²)
TIR   = sinθ > 1/1.333            // ≈ 48.6° → the 96° window
inside  → refract() into the sky/sun, boosted, with chromatic fringe at the rim
outside → total internal reflection: mirror of the underwater colour + caustic glints
```

The rim of the window is where the chromatic fringe goes; it is the single most
recognisable underwater visual and worth the extra samples.

### 6.2 Water volume — per-channel extinction (`render/waterFog.js`)

Assigned to `scene.fogNode`, so it applies to *every* material with no
per-material work. This is the effect that makes the scene read as water rather
than as blue fog:

```js
// fraction of the camera→fragment ray that is actually below y = 0
const submerged = raySubmergedFraction(cameraPosition.y, positionWorld.y);
const d        = positionView.length().mul(submerged);

// per-metre extinction — red dies in ~3 m, blue survives ~30 m
const sigma    = vec3(0.35, 0.055, 0.035);
const T        = exp(sigma.mul(d).negate());          // transmittance

// in-scattered light, dimmed by how deep the ray sits
const sunAtten = exp(depthAvg.mul(-0.06));
const inscatter = waterTint.mul(sunAtten).mul(sunColor);

return vec4( output.rgb.mul(T).add(inscatter.mul(T.oneMinus())), output.a );
```

Because `sigma` is a `vec3`, distant objects go blue-green *by losing red
first*, exactly as in real water — a single scalar fog cannot do this. The
`submerged` term means the same node correctly does nothing when the player is
above water looking at the island.

### 6.3 Caustics (`render/caustics.js`)

Adapted from **[jeantimex/webgpu-water](https://github.com/jeantimex/webgpu-water)** (MIT),
whose approach is: refract light rays through the water surface, project them
onto the receiver, and derive intensity from **area compression** measured with
screen-space derivatives. Verified available in TSL: `refract`, `dFdx`, `dFdy`,
`AdditiveBlending`, render-to-target.

Our adaptation, once per frame:

1. Render a dedicated grid mesh (same Gerstner surface, 256²) with an
   **orthographic sun camera** into a 1024² R16F target, additive.
2. Vertex stage: displace by the wave field, compute the analytic normal,
   `refract(sunDir, normal, 1/1.333)`, march the refracted ray to a reference
   receiver plane, and emit that projected position as the clip position.
3. Fragment stage: intensity ∝ `1 / |dFdx(P) × dFdy(P)|` — where neighbouring
   rays converge, the area shrinks and the caustic brightens. Three slightly
   offset IORs give the chromatic rainbow fringe for free.

Sampling in `terrainMaterial.js` and the prop materials:

```
uv        = sunViewProj · worldPos
caustic   = texture(causticsMap, uv).rgb
caustic  *= saturate(normal.y)              // up-facing surfaces catch it
caustic  *= skyVisibility                   // ★ zero inside caves
caustic  *= exp(-depth · 0.05)              // fades with depth
```

Multiplying by the baked `skyVisibility` is what stops caustics from leaking
onto cave ceilings — a common and immediately-noticeable artefact.

**Fallback** (if the projection pass proves too costly on `low`): the layered
`mx_worley_noise_float` fake, driven by world XZ.

### 6.4 God rays (`render/volumetrics.js`)

Straight adaptation of `webgpu_volume_lighting`:

- A `VolumeNodeMaterial` box spanning the underwater play volume, on layer
  `VOLUMETRIC`, with `scatteringNode` = 3D noise (drifting) × depth falloff, so
  shafts are denser near the surface.
- `volumetricMaterial.depthNode = scenePass.getTextureNode('depth').sample(screenUV)`
  so terrain **occludes** the shafts.
- `volumetricMaterial.offsetNode = bayer16(screenCoordinate)` to dither away
  banding.
- Rendered by `pass(scene, camera, {depthBuffer:false})` with
  `setLayers(volumetricLayer)`, `setResolutionScale(0.25)`, then
  `gaussianBlur()`, then added.

**Risk:** the reference example drives this with point and spot lights; we need
a **directional** sun. If directional shadows do not produce shafts through the
cave skylights, the mitigation is a very-far-away, narrow-angle `SpotLight`
standing in for the sun, aimed down — which additionally gives per-skylight
control. Decided at implementation time; both are cheap.

Bioluminescent cave corals are real `PointLight`s, also layer-enabled, so they
glow volumetrically in the dark chambers.

---

## 7. Life systems

### 7.1 GPU flocking (`life/boids.js`) — one system, two uses

Directly adapted from `webgpu_compute_birds`: `instancedArray` storage buffers
for position / velocity / phase, a `computeVelocity` pass implementing
separation / alignment / cohesion, a `computePosition` integrator, and an
`InstancedMesh` whose `vertexNode` reads the storage buffers to place and orient
each instance and to animate it.

Two deliberate changes from the reference:

1. **Per-school buffers, not one global flock.** The reference loops all 8 192
   birds against each other — O(N²) = 67 M iterations/frame. We split ~3 000 fish
   into 6 schools of ~500, each only interacting within itself: 6 × 500² = 1.5 M,
   a **45× reduction**, and it gives per-school species parameters for free.
2. **Bounds are the field, not a box.** Each school gets a home volume and a
   soft return force, plus repulsion from the player sphere (fish part around
   you — PRD P4) and a cheap terrain-avoidance term using the seabed height.

Animation is in the vertex shader: a travelling sine along the body axis
(`sin(phase − z·k)`) whose amplitude grows toward the tail — real fish
undulation, versus the reference's two-vertex wing flap.

**Gulls reuse this entire system** with different parameters (above-water home
volume, gravity-free wander, higher cohesion) and a bird geometry. This is why
`boids.js` is written as a configurable class rather than inline in a fish file.

### 7.2 Crabs (`life/crabs.js`)

CPU agents (~120) — they need to *walk on a surface*, which is a poor fit for a
GPU flock. Each has a small state machine (`idle → wander → scuttle → hide`),
sticks to the seabed by raymarching `field()` downward, and aligns its up-vector
to the field gradient so it crawls over rocks correctly. Player proximity
triggers `scuttle` (sideways, fast) then `hide`.

Rendered as one `InstancedMesh`. Legs are animated procedurally in TSL from two
custom vertex attributes (`legIndex`, `limbSegment`) plus a per-instance gait
phase — no skinning, no bones, one draw call for every crab in the world.

### 7.3 Flora (`life/flora.js`)

Instanced per species. Sway in the vertex shader:

```
bend = (heightAlongPlant)² · (sin(t·ω + worldPos.x·k) · A + gustNoise)
```

Squaring the height factor pins the base and lets the tip travel — the standard
foliage trick, and the reason kelp reads as heavy and seagrass as light (just
different `A`). A slow large-scale `gustNoise` makes the whole forest breathe
together instead of each plant wobbling independently.

### 7.4 Spline actors and particles

Turtle, shark, rays and the whale are single meshes following Catmull-Rom
patrol loops with banking, plus a local avoidance nudge. The turtle's escort
behaviour is a trigger that swaps its spline for a player-following one.

Particles are `InstancedMesh` sprites integrated on the GPU: marine snow drifts
in a player-centred toroidal volume (recycled when it exits, so density is
constant and count is bounded), bubbles rise and wobble, silt puffs spawn on
crab scuttles and fin kicks near the bottom.

---

### 7.5 Audio (`audio/`)

A small WebAudio graph, started on first user gesture (browser autoplay policy):

```
 sources ──► per-bus gain ──► submersionFilter (BiquadLowpass) ──► master ──► out
   above-water bus  ────────────────────────────────────────────┘  (bypasses filter)
```

The **submersion filter** is the whole trick: a lowpass whose cutoff is driven
by camera depth (≈ 18 kHz in air → ≈ 700 Hz at 2 m down), smoothed over ~0.3 s,
with the above-water bus cross-faded out over the same ramp. Twenty lines of
code that carry the single most important moment in the game (PRD §3.1 step 2).

Positional sources (`PannerNode`) for bubble vents, the reef crackle bed and
boat rigging; non-positional beds for the ocean rumble and whale song.
Discovery stings are one-shots ducking the beds by −3 dB.

## 8. Mission-ready architecture

PRD §7 requires that a new mission be **data only**. The mechanism:

```
 input events ──► triggers.js ──► events.js ──► objectives.js ──► missions.js
                                     │                                │
                  interact.js ───────┘                                ▼
                                                              state.js  +  hud.js
```

**`state.js`** — a flat, serialisable store of flags, counters and sets, with
change subscriptions. Everything a mission can care about lives here, which is
also what makes save/load a later afternoon's work rather than a refactor.

**`triggers.js`** — declarative trigger definitions evaluated each tick:
`proximity` (radius to a point/entity), `volume` (AABB/sphere), `lookAt`
(dot-product cone), `depth`, `stateChange`. Each emits a named event.

**`interact.js`** — objects register `{ id, position, radius, prompt, onInteract }`.
A forward raycast each frame picks the best candidate, HUD shows the prompt,
`E` fires it. The chest, clam, geode, bottle, idol, amphora and lighthouse are
all just registrations.

**`objectives.js`** — objective *types*, each a small pure evaluator over state
and events: `interact`, `reach`, `observe`, `collect`, `escort`, `deliver`,
`survive`(timer). Adding a type is the only case that needs engine code, and the
seven above cover every example mission in PRD §7.

**`missions.js`** — the runner. A mission is:

```js
{
  id: 'find_the_chest',
  title: "The Captain's Hoard",
  steps: [
    { objective: { type: 'reach',    target: 'cathedral_chamber' },
      hint: 'Something glints deep in the reef wall…' },
    { objective: { type: 'interact', target: 'chest_main' },
      onComplete: [ { type: 'discover', id: 'treasure_chest' },
                    { type: 'setFlag',  key: 'chest_opened' } ] },
  ],
  reward: { log: 'treasure_chest' },
}
```

**The 15 discoveries ship as missions in this exact format.** That is the proof
the pipeline works — we are not building a speculative system and hoping, we are
building the system the game already runs on. Later missions drop a file into
`content/missions/` and are auto-registered by a glob import.

---

## 9. Performance budget

Target: **60 fps (16.6 ms) at 1080p on Apple M-series** (PRD S1), budgeted
against the **`medium`** preset — the one auto-selected on that hardware.
`high` is explicitly a "fast machines only" preset and is allowed to miss 60.

| Item | Budget | Notes |
|---|---|---|
| Terrain draw | 2.0 ms | ~180 chunk meshes, ~900 k tris, frustum-culled |
| Flora + props | 2.0 ms | ~40 k instances across ~15 instanced draws |
| Fish + gulls | 1.5 ms | 2 compute dispatches + 7 instanced draws |
| Crabs + actors | 0.5 ms | 1 instanced draw + ~8 singles |
| Particles | 0.8 ms | 3 instanced draws |
| Ocean surface | 1.2 ms | 65 k verts, heavy fragment shader |
| Shadow pass | 1.0 ms | 2048², tight ortho around the player |
| Caustics pass | 0.6 ms | 1024², 65 k verts |
| Volumetric pass | 1.5 ms | 0.25 res, **8 steps**, + blur |
| Post chain | 1.5 ms | bloom dominates; no DOF at `medium` |
| CPU (game logic) | 1.5 ms | crabs, triggers, boids uniforms |
| **Total** | **13.1 ms** | **3.5 ms headroom** for driver overhead, GC and spikes |

An earlier draft budgeted 15.6 ms and called the remaining 1 ms "headroom".
That was not a real margin; the numbers above are the corrected ones (see
[REVIEW.md §C2](./REVIEW.md)). If the budget is exceeded, things are dropped in
this order: DOF → volumetric resolution → volumetric steps → fish count →
shadow resolution → render scale.

Load budget (PRD S2, < 8 s): field + meshing < 4 s in workers (§3.2), geometry
build < 1 s, PMREM + pipeline warm-up < 1 s, first frame < 2 s.

Shader compilation stalls are a real WebGPU hazard: **pre-warm every pipeline**
during the loading screen by rendering one off-screen frame containing one
instance of every material.

---

## 10. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Marching cubes too slow / stutters the load | ~~med~~ **low** | **Measured** at 5.3 s single-threaded → ~0.35 s on 16 cores, ~1.8 s on 4 ([REVIEW.md §2](./REVIEW.md)). Worker pool + empty-chunk early-out + band gate. Fallback: 0.75 m voxels |
| R2 | Directional light gives no volumetric shafts | med | Substitute a distant narrow `SpotLight` for the sun (§6.4) |
| R3 | Caustics projection pass too costly | low | Worley-noise fallback already specified (§6.3) |
| R4 | Noise caves are disconnected or unswimmable | **high** | This is why §3.4 validation exists — authored splines + flood fill + clearance growth |
| R5 | Snell's window looks wrong / has seams at the waterline | med | Per-pixel `frontFacing` branch rather than a camera-position test; test explicitly at the transition |
| R6 | Frame budget blown on integration | med | Quality presets (§5) with auto-detect; volumetrics and DOF are the first things dropped |
| R7 | TSL API drift vs. the r185 examples | low | Pin `three@0.185.1` exactly; examples were read from the `r185` tag |
| R8 | Scope — 15 discoveries + 6 zones is a lot of content | **high** | Build the golden path (PRD §3.1) end-to-end first, then add discoveries in priority order; the chest is P0 |

---

## 11. Build order

Each phase ends in something runnable and lookable-at. Nothing is built without
its predecessor visibly working.

1. **Skeleton** — Vite, WebGPU boot (**requesting the
   `maxStorageBuffersInVertexStage: 3` device limit up front**, needed later by
   the boids vertex shader and awkward to add once a device exists), fallback
   screen, loading screen, pointer-lock free-fly, HUD depth readout.
2. **World** — `field.js` + marching cubes + worker pool + chunk rendering. Grey untextured terrain with caves. *Gate: you can fly through a cave.*
3. **Water** — `waterFog.js` extinction, ocean surface with Gerstner waves, Snell's window, sky + sun. *Gate: PRD §3.1 step 2, the surface transition, looks right.*
4. **Swim** — player physics, field collision, torch. *Gate: PRD S8, −30 m to the summit.*
5. **Light** — shadows, caustics, volumetrics, baked sky-visibility. *Gate: PRD S4.*
6. **Life** — boids, crabs, flora, particles. *Gate: PRD S5.*
7. **Content** — mission system, the 15 discoveries, the chest set-piece. *Gate: PRD S6, S7, S9.*
8. **Polish** — post chain, audio, quality presets, perf pass. *Gate: PRD S1.*
