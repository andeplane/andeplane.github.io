# CLAUDE.md — working notes for *Sunken*

Architecture, conventions and strategy for this repo. Read this before changing
anything; it exists so a fresh session does not have to rediscover the traps.

Companion docs: [ROADMAP.md](ROADMAP.md) (what's done / next) ·
[docs/PRD.md](docs/PRD.md) (product) · [docs/DESIGN.md](docs/DESIGN.md)
(technical) · [docs/REVIEW.md](docs/REVIEW.md) (design review + corrections).

---

## 1. What this is

A first-person underwater exploration game rendered with **WebGPU**, via
**three.js r185** (`three/webgpu` + TSL). Swim a reef 10–30 m down, enter caves,
surface to see waves and an island. No combat, no fail state.

**Stack:** three@0.185.1 (pinned), simplex-noise@4, Vite. Plain JS ES modules —
no TypeScript, no bundler config beyond Vite's defaults.

```
npm run dev      # vite dev server
npm run world    # headless world validation (see §5) — run this a lot
npm run build    # production build
```

---

## 2. The two rules that hold everything together

### Rule 1 — One definition, consumed many times

Two systems must never keep their own copy of the same truth.

| Truth | Defined in | Consumed by |
|---|---|---|
| World shape | `src/world/field.js` | mesher, collision, scatter, cave validation, creature grounding |
| Wave field | `src/world/waves.js` | ocean shader, caustics shader, buoyancy, waterline test |
| Sky radiance | `src/render/sky.js` | sky dome, ocean reflection, Snell's window |
| Frame time | `src/render/frame.js` (`uTime`) | every shader **and** every CPU wave sample |
| Submersion | `src/render/waterFog.js` | fog, post-processing grade/warp/vignette, audio low-pass |

`field()` is the load-bearing one: because collision resolves against the same
analytic function the terrain mesh was built from, the visible world and the
collidable world *cannot* drift apart. Do not add a collider mesh.

### Rule 2 — The world generator is a pure Node library

`src/world/*.js` (except `chunks.js`) imports **no three.js and no DOM**. It runs
in Node, which is why `npm run world` can validate the entire world in ~1 s
instead of reloading a browser and squinting. Keep it that way:

- `field.js`, `mesher.js`, `waves.js`, `scatter.js`, `mcTables.js` — pure
- `chunks.js` — the three.js boundary (turns mesher output into `Mesh`es)

Rendering only ever *consumes* generator output.

---

## 3. Layout

```
src/
  core/       renderer, quality presets, clock, input, seeded RNG, event bus
  world/      field, mesher (+worker/pool), chunks, collider, waves, scatter   ← pure (except chunks)
  render/     sky, ocean, waterFog, caustics, terrainMaterial, frame
  geometry/   procedural mesh builders (flora, creatures)
  life/       flora, boids (fish + gulls), crabs, particles
  game/       player, torch, interact
  props/      chest (the easter egg), boats
  audio/      procedural WebAudio ambience
  ui/         screens, HUD, style
tools/        worldcheck.mjs — headless validation
docs/         PRD, DESIGN, REVIEW
```

---

## 4. TSL / WebGPU traps hit so far

These all cost real debugging time. They look like nothing and fail loudly later.

1. **A shared TSL `Fn` must not capture uniforms.** Uniform slot indices
   (`nodeUniform0`, …) are assigned *per material*, but a shared node reuses the
   indices from whichever material built it first. Symptom: a WGSL type error in
   the *second* material using it (`mix(vec2, f32, f32)`), not a wrong picture.
   Fix: pass uniforms as explicit parameters and declare `setLayout`. See
   `sky.js: skyRadiance`.
2. **`setLayout` is only safe on genuinely pure functions** — see above. Without
   captures it is *better* (one WGSL function instead of inlining everywhere).
3. **`geometry.setIndex()` only wraps plain `Array`s.** A bare `Uint16Array` is
   assigned straight through and blows up later on `index.array.byteLength`.
   Wrap it in a `BufferAttribute`.
4. **`mergeGeometries()` returns `null` on mismatched attribute sets**, silently.
   Normalise every part to the same attributes first (`geometry/flora.js:merge`).
5. **Marching-cubes bit convention.** Paul Bourke's tables treat *below
   isolevel* as inside. Our field is positive inside rock, so the bit is set for
   `field > 0`. Getting it backwards produces correct-looking geometry with
   inverted winding — you see the inside of the world.
6. **`frontFacing` is the wrong tool for "which side of the water am I on".**
   It depends on winding. `dot(I, N)` is also wrong: it uses the *perturbed*
   normal, so far wave facets flip branches and produce bright speckle. Use a
   positional test (`vWorld.y` vs `cameraPosition.y`).
7. **Specular aliasing on water is fixed by LODing the normal**, not by
   supersampling. Fade ripple detail, then flatten the wave normal with distance.
8. **Light intensity is in physical units (candela).** three has no
   legacy-lights escape hatch. A `SpotLight` at intensity 26 — which looks
   sane next to a `DirectionalLight` at 3 — emits essentially nothing once
   inverse-square decay applies. Useful torch throw needs ~900.
9. **Never toggle `light.visible` at runtime.** Adding or removing a light
   changes every material's shader permutation and recompiles the lot (~380
   pipelines here, a ~175 ms stall on the exact keypress the player is
   watching). Keep the light visible and drive `intensity` to 0 instead.
10. **`scenePass.getTextureNode()` needs the explicit `'output'` name.** The
    no-argument form does not bind the pass's colour attachment and every
    sample returns black — while costing nothing, so the frame timer says
    everything is fine. Cost hours; the whole post chain rendered black.
11. **Never feed a *computed* node to a multi-tap post effect.** `bloom()` and
    `fxaa()` sample their input dozens of times; if that input is a computed
    node (e.g. `scenePass.add(volumetrics)`) each tap re-runs the entire
    upstream graph — measured 947–1080 ms/frame vs 16.7 ms. Bind them to
    `scenePass.getTextureNode('output')` and merge afterwards with
    single-sample maths.
12. **`convertToTexture()` does not help there** — on a composite containing
    `pass()` nodes it renders black, because the RTT does not drive those
    passes. Cheap *and* empty.
13. **FXAA is unusably slow in this chain** (~1080 ms/frame) even with an
    explicitly materialised input. Disabled; we rely on DPR ≤ 2 supersampling.
    `?post=N` bisects the chain stage by stage.
14. **`maxStorageBuffersInVertexStage`** must be requested at device creation
   (`core/renderer.js`) — the GPU boids path reads storage buffers from the
   vertex stage and cannot be retrofitted onto an existing device.

---

## 5. How to verify changes

**Always, for anything touching `src/world/`:**

```
npm run world              # 17 correctness checks
npm run world -- --map     # ASCII depth map with cave mouths and skylights
npm run world -- --mesh    # triangle counts + projected build time
```

It checks depth distribution, cave connectivity, mouth separation, tunnel
clearance, that tunnels have rock above them (caves, not trenches), sky-vis
bake sanity, and worldgen budget. Add a check whenever you fix a world bug —
that is how the "caves erupting through the seabed" regression got caught.

**For rendering**, drive a real browser (WebGPU has no meaningful headless
path). `window.__game` is exposed with `{ renderer, scene, camera, player,
field, heightAt, look(), freeze() }`:

```js
window.__game.freeze(true)          // stop physics so a posed shot holds
window.__game.look(x, z, height, yaw, pitch)   // drop the camera into open water
```

Read the console for WGSL errors — they name the pipeline and the line.
Beware: the console buffer accumulates across reloads, so stale errors from a
previous load look current. Confirm against `renderer.debug.getShaderAsync()`.

---

## 6. Strategy / working order

Build in phases; **each phase must end in something runnable and lookable-at**,
and nothing is built before its predecessor visibly works. Current state and the
full remaining plan live in [ROADMAP.md](ROADMAP.md).

Guiding priorities when trading off:

1. **Beauty first.** The visual bar is the hard part; feature count is not.
2. **Measure before optimising, and before believing a budget.** The two biggest
   perf wins so far (grid-gradient normals, cached column height in the sky
   bake — together 39 s → 14 s) came from a 20-line profiling script, not from
   guessing.
3. **If the world can be wrong, add a check to `worldcheck.mjs`.**
4. **Content scales down, systems do not.** If time runs short, ship fewer
   discoveries — not a shallower world.

---

## 7. Conventions

- three.js code style: tabs, spaces inside parens — matches the upstream
  examples this borrows from.
- Comments explain *why*, especially where a simpler-looking alternative is
  wrong. The traps in §4 are all documented at their call sites.
- Determinism: everything world-shaped derives from `WORLD_SEED` via a **named**
  sub-stream (`stream('caves')`), so adding a generator never shifts an existing
  one's sequence.
- Quality presets live in `core/quality.js`; the DESIGN §9 frame budget is
  written against **medium**, not high.
- No external asset downloads. All geometry and texture detail is procedural —
  no licensing, no load time, and geometry builders can bake the attributes
  shaders need (`bend`, `bodyT`, `legIndex`).
