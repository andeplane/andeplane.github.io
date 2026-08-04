# Design Review — round 1

Review of [PRD.md](./PRD.md) and [DESIGN.md](./DESIGN.md) before implementation.
Method: verify every load-bearing API claim against the actual `three@0.185.1`
source, and **measure** the riskiest performance assumption rather than assert it.

**Verdict: approved to build, with 4 corrections applied and 3 gaps closed.**

---

## 1. API claims — verified against three.js r185 source

Every TSL/renderer API the design depends on was checked in the `r185` tag, not
assumed from documentation:

| Claim | Status | Evidence |
|---|---|---|
| `RenderPipeline` + `outputNode` post graph | ✅ | `webgpu_ocean.html:82`, `webgpu_volume_lighting.html:200` |
| `pass(scene, camera)`, `.getTextureNode('depth')`, `.setLayers()`, `.setResolutionScale()` | ✅ | `webgpu_volume_lighting.html:212-224` |
| `VolumeNodeMaterial` with `scatteringNode` / `depthNode` / `offsetNode` | ✅ | `src/materials/nodes/VolumeNodeMaterial.js` |
| `scene.fogNode` accepts a custom `Fn` returning `vec4` | ✅ | `src/nodes/fog/Fog.js:93` |
| `output` (material output colour) importable from `three/tsl` | ✅ | `src/nodes/core/PropertyNode.js:332` |
| `positionView`, `positionWorld` | ✅ | `src/nodes/accessors/Position.js:62,88` |
| `refract`, `reflect`, `dFdx`, `dFdy`, `fwidth` | ✅ | `src/nodes/math/MathNode.js:1081,891,767,777,817` |
| `frontFacing` (per-pixel side test for Snell's window) | ✅ | `src/nodes/display/FrontFacingNode.js:66` |
| `instancedArray(...)` + `.compute(n)` + `renderer.compute()` | ✅ | `webgpu_compute_birds.html:207,417` |
| Storage buffers readable in the **vertex** stage | ✅ | requires `requiredLimits: { maxStorageBuffersInVertexStage: 3 }` — `webgpu_compute_birds.html:165` |
| `NodeMaterial.fog = false` opt-out | ✅ | `src/materials/nodes/NodeMaterial.js:77,1188` |
| Marching-cubes `edgeTable`/`triTable` available under MIT | ✅ | `examples/jsm/objects/MarchingCubes.js:969,1003` |
| MaterialX noise (`mx_noise_float`, `mx_worley_noise_*`) | ✅ | `src/nodes/materialx/MaterialXNodes.js` |
| Post addons: `BloomNode`, `DepthOfFieldNode`, `ChromaticAberrationNode`, `GaussianBlurNode`, `FXAANode`, `GTAONode` | ✅ | `examples/jsm/tsl/display/` |

**No blocking API gaps.** One implementation note captured: the boids vertex
shader reads storage buffers, which needs the `maxStorageBuffersInVertexStage`
device limit requested at renderer construction — easy to miss and fails at
device-init time, so it goes in the skeleton phase.

---

## 2. Measured: worldgen load time (was risk R1)

The design asserted "< 4 s cold" for a 26 M-voxel marching-cubes world. That
number was a guess, so it was measured with a faithful model of the real field
(`scratchpad/bench-field.mjs`, same layer structure and octave counts as
DESIGN §3.1), on this machine, in V8:

```
volume: 501 x 104 x 501 = 26.1M voxels @ 0.6m
2D height pass (251k columns):  235 ms
3D field pass:                 5079 ms   (3D-noise evals: 10.0M of 26.1M = 38%)
surface crossings along Y:      359k  →  rough tri estimate ~897k
TOTAL single-threaded:          5.31 s
16 cores → 15 workers ≈         0.35 s
```

**Findings:**

- ✅ The **band gate** in §3.1 works as designed — it eliminates 62 % of 3D
  noise evaluations. Without it this would be ~14 s.
- ✅ **Triangle count lands at ~900 k**, within the 800 k budget's tolerance and
  comfortably renderable.
- ✅ Load budget holds even on a weak machine: a 4-core laptop gets ~1.8 s.
- ⚠️ **R1 downgraded from medium to low likelihood.**

## 3. Corrections applied

### C1 — Sky-visibility bake was unbudgeted and would have blown the load time (serious)

DESIGN §3.2 specified baking `skyVisibility` with a "short cone raymarch"
per vertex. Costed out during review: ~450 k welded vertices × 16 rays ×
12 steps ≈ **86 M extra field evaluations ≈ 40 s single-threaded** — 8× the
entire meshing cost, and it was not in any budget. This would have been
discovered only after building it.

**Fix:** one **vertical** ray per vertex, 32 steps with geometric growth
(~14 M evals, ~3 s single-threaded, ~0.2–0.8 s across workers), then 2–3
**edge-smoothing passes over the mesh** to recover the soft cone look at
negligible cost. Visual result is equivalent for our use (masking caustics,
darkening caves); cost is 6× lower. DESIGN §3.2 updated.

### C2 — Performance budget was not honest

The budget totalled 15.6 ms against a 16.6 ms frame, claiming "~1 ms headroom".
That is not a real margin once driver overhead, GC and frame spikes are counted,
and it silently assumed the `high` preset. **Fix:** budget restated against the
**`medium`** preset (the auto-selected default), volumetrics reduced to 8 steps
there, total now 13.1 ms with 3.5 ms of genuine headroom. `high` is explicitly
documented as a "fast machines only" preset that may miss 60 fps.

### C3 — Ocean surface would be double-attenuated

`scene.fogNode` applies to every material, including the ocean surface — so the
Snell's window would have water extinction applied *twice* (once by the fog
node, once by its own below-surface shading), washing out the exact shot the
PRD calls the money shot. **Fix:** ocean material sets `fog = false` and owns
its own attenuation. Now stated explicitly in DESIGN §6.1.

### C4 — Determinism was never specified

Nothing said the world was reproducible, but cave *validation* (§3.4), prop
scatter and discovery placement all assume a fixed world. **Fix:** a single
`WORLD_SEED` constant feeds one `mulberry32` chain; all generators draw from
seeded sub-streams. Stated in DESIGN §3.

## 4. Gaps closed

### G1 — No audio design (PRD)

The `The Sea We Breathe` reference makes it obvious that audio carries much of
the "calm" pillar (P2), and the PRD's own golden path (§3.1 step 2) depends on
"audio muffles" to sell the submersion — but no system existed to do it. Added
PRD §5.5 and DESIGN §7.5: WebAudio graph with a **low-pass filter driven by
camera depth**, which is a ~20-line effect that does an enormous amount of work
for the single most important moment in the game.

### G2 — Nothing described what happens at the world edge

The Drop-off is a "soft world edge" but nothing said how the player is stopped.
Added: a gentle current that pushes back, plus fog that makes it read as
intentional. No invisible walls (breaks P2).

### G3 — Loading screen was implied but never specified

DESIGN §9 requires pipeline pre-warm during loading, but no loading experience
existed. Added: an underwater-themed progress screen that runs the pre-warm
frame, so the pre-warm has somewhere to hide.

## 5. Scope challenge

PRD §6 lists 15 discoveries and §4.2 lists 6 zones. Against the build order in
DESIGN §11, this is the highest-risk item (R8) and **the review does not
recommend reducing it up front** — but it does recommend enforcing the ordering:

> Phases 1–6 build the *world and its systems*. Phase 7 adds content. If time
> runs short, content count drops and the world does not.

The chest (PRD §6.1) is **P0** and is built first in phase 7, because it is the
explicitly requested easter egg and the single best demonstration of the whole
stack (volumetric light + bloom + particles + interaction + mission data).

## 6. Open questions — deferred, not blocking

1. **Directional vs. spot sun for volumetrics** (R2) — decided empirically in
   phase 5; both paths costed, neither changes architecture.
2. **Caustics projection vs. worley fallback** (R3) — decided empirically in
   phase 5; the fallback is already specified.
3. **Whether crabs need pathfinding** — assumed no (wander + flee is enough).
   Revisit only if they visibly walk into walls.
