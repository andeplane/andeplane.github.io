# Three Lefts — Technical Specification

Implementation spec for the v0.1 vertical slice described in [PRD.md](./PRD.md).

---

## 1. Stack

| | |
|---|---|
| Language | TypeScript, strict |
| Renderer | three.js (WebGL2) — custom render loop, **not** the stock `renderer.render()` path |
| Build | Vite |
| Target | Desktop browser, WebGL2 required, pointer-lock |
| Performance target | 1920×1080 @ 60 fps sustained, no frame over 20 ms |

three.js is used for its scene graph, material system, PMREM/IBL, and loaders. The portal pass replaces its render loop entirely, so we stay on `WebGLRenderer` and hand-drive `renderer.render()` per cell with explicit stencil and clipping state.

---

## 2. The core abstraction

> **There is no world space.**

This is the single decision the whole codebase rests on. Nothing anywhere holds a global position, and no code may assume two objects in different cells can be compared, subtracted, or distance-tested.

### 2.1 Cells
A **cell** is one room or corridor segment: its own flat ℝ³ with its own origin, containing geometry, lights, props, and chalk marks, all in **cell-local coordinates**. Cells know nothing about each other.

Because only one cell is ever drawn at a time and always with an identity world matrix, three.js "world space" is, during any given draw, exactly that cell's local space. Clipping planes, lights, and env maps therefore all work unmodified.

### 2.2 Doors
A **door** is an oriented rectangle on a cell wall, defined by a rigid frame `F` in cell-local coordinates:

- origin at the door's centre
- `+Z` = **inward** normal (pointing into that cell's interior, i.e. toward a player approaching it)
- `+Y` = up
- `+X` = `Y × Z` (right, when facing into the room)

plus a `width` and `height`.

### 2.3 Portals
A **portal** is an unordered pair of doors `{A, B}` in cells `P` and `Q`. It induces the coordinate change

```
T[A→B] = F_B · R_y(π) · F_A⁻¹        (maps P-local coords → Q-local coords)
```

The `R_y(π)` is the turn-around: you approach A facing its `+Z`, and you leave B facing *away* from its `+Z`, i.e. into `Q`.

Because `R_y(π)⁻¹ = R_y(π)`, the inverse comes out symmetric and free:

```
T[B→A] = F_A · R_y(π) · F_B⁻¹ = T[A→B]⁻¹
```

which is what makes portals two-way without special-casing.

`T` is always a rigid motion (rotation + translation, det = +1) in v0.1. Scale and mirror are deferred to v0.3 and will require touching lighting and normal handling.

### 2.4 The world
A graph: cells are nodes, portals are edges labelled with `T`. **That is the entire level format.** All impossibility is data.

---

## 3. The mathematics

### 3.1 Holonomy
For a loop `γ` that leaves cell `C` and returns to it through portals `P₁ … Pₙ`, the **holonomy** is

```
H(γ) = T[Pₙ] · … · T[P₂] · T[P₁]        (a map from C's chart to itself)
```

`H(γ) = I` for every loop ⟺ the world embeds in Euclidean space ⟺ the house is ordinary.

**So: `H(γ) ≠ I` is the game.** Every impossibility in the design is a statement about the holonomy of some loop, and nothing else.

### 3.2 Angle defect
Take a ring of `n` cells, each of which the player traverses with a left turn of `θ`. The ring closes as a graph, so the player returns; but the total turning is `nθ`, and

```
δ = 2π − nθ
```

is the **angle defect** of that loop. (The original draft said it was "concentrated on a vertical seam line where the cells meet" — see §3.3 for why that is not true of this construction.)

| | | |
|---|---|---|
| `δ > 0` | **deficit**, cone angle < 360° | fewer turns than you expect close the loop; space is *smaller* than it should be |
| `δ = 0` | flat | an ordinary building |
| `δ < 0` | **excess**, cone angle > 360° | more turns needed; space is *hidden in the corner* |

Space is **flat everywhere the player can stand** — which is why P2 holds and nothing looks warped. The defect lives in the region the loop encircles, which is exactly the region the level does not let you into. Glue whole walls rather than doorways and this becomes a genuine cone singularity, the same object as a cosmic string in GR; glue doorways, as these levels do, and you get the same holonomy with no singular line anywhere in the accessible space.

The two slice structures:

| Wing | `n` | `nθ` | `δ` | Cone angle | Player experience |
|---|---|---|---|---|---|
| West | 3 | 270° | **+90°** | 270° | Three lefts and you're home. |
| East | 5 | 450° | **−90°** | 450° | Four lefts isn't enough. There's a room in there that can't fit. |

### 3.3 Where the defect actually lives
The original draft of this section claimed the ring rooms share a single corner, making the defect a visible seam line with a column standing on it. **That is wrong**, and the correction matters enough to keep here rather than quietly delete.

A cone point requires the cells to be glued along the *whole walls* meeting at that corner. These rings are glued at **doorways** — small rectangles in the middle of walls — so no two rooms' corners are ever identified. The space is flat and perfectly ordinary everywhere the player can stand, and the impossibility is a property of the **loop**: it is non-contractible, it encircles a region with no room in it, and its holonomy is not the identity. There is nothing to walk up to and touch.

That turns out to be a better design, not a worse one, because it forces the payoff to be something the data model can actually back: the **grille** (§4.2). Three rooms with barred windows onto one genuinely shared cell is a claim chalk can verify, and it is true.

### 3.4 The developing map (and how we enforce P1)
Pick a base cell. Walking a path, accumulate `D ← T[P] · D` at each crossing. `D · p` "unrolls" the manifold into a single flat chart — precisely what a person drawing a map by dead reckoning computes.

`D` is path-dependent exactly when holonomy is nontrivial, so the unrolled map **overlaps itself** (deficit) or **leaves gaps** (excess). This is not a rendering trick for the notebook; it is the notebook. Same function, two consumers:

- **The notebook (PRD §4.3)** plots `D · p` projected to the XZ plane.
- **The test suite** enumerates every cycle in the level graph and asserts `H(γ)` equals the value the level author declared. A loop that drifts because a door was nudged 2 cm is a **build failure**, not a mystery. This is how P1 ("the house never lies") becomes mechanical rather than aspirational.

---

## 4. Level data model

```ts
type CellSpec = {
  id: string
  size: [w: number, h: number, d: number]  // interior; floor at y=0, centred on XZ
  style: StyleId                            // materials, palette, floor sound
  doors: DoorSpec[]
  props: PropSpec[]                         // column, furniture, lights
}

type DoorSpec = {
  id: string
  wall: 'N' | 'S' | 'E' | 'W'   // N = −Z, S = +Z, E = +X, W = −X
  offset: number                 // along the wall, from centre
  width: number                  // default 1.25
  height: number                 // default 2.25
  kind?: 'door' | 'grille'       // see §4.2
  sill?: number                  // 0 for doors, 0.95 for grilles
}

type PortalSpec = [doorRef: string, doorRef: string]   // "cellId.doorId"

type LevelSpec = {
  cells: CellSpec[]
  portals: PortalSpec[]
  spawn: { cell: string; pos: [number, number, number]; yaw: number }
  assertions: LoopAssertion[]    // §3.4 — declared holonomy of named loops
}
```

Geometry is generated procedurally from `CellSpec` (walls, floor, ceiling, door openings, jambs, skirting) so that authoring stays in the graph rather than in a mesh editor. Props are placed instances.

### 4.2 Grilles

A **grille** is a portal that renders exactly like a door and blocks movement exactly like a wall: barred, sealed to collision, and skipped by the crossing test. It was not in the original design and turned out to carry two of the three levels, because *showing the player somewhere they cannot get to* is most of what makes a house feel wrong. It costs almost nothing — the renderer needs no special case at all, since the bars sit inside the reveal and occlude the portal quad through the ordinary depth test.

Paired doors must agree on width, height, and sill height **relative to their own floor** — validated at load, because a mismatch makes the floor jump as you step through. Absolute sill heights are free to differ, and on the staircase they must: that difference is precisely what puts the rise into the portal transform.

### 4.1 Slice layout

| Cell | Size (m) | Notes |
|---|---|---|
| `hall` | 13 × 3.6 × 9 | Warm oak, entry point, doors to both wings |
| `w1 … w3` | 6 × 3.0 × 6 | Deep green. Doors on S and W walls → left turn. Each has a grille onto `shrine` |
| `shrine` | 3 × 3.4 × 3 | One cell, three grilles, one lantern. The objective |
| `e1 … e5` | 6 × 3.0 × 6 | Oxblood. Same pattern; `e4` holds the only door into `shrine` |

Ring gluing: `wᵢ.W → wᵢ₊₁.S`, closing `w3.W → w1.S`. Likewise for `e1…e5`. `w1` and `e1` each carry a third door back to `hall`.

Declared assertions: west ring holonomy = rotation of **90°** about the column axis; east ring = **−90°**; every hall↔wing round trip = identity.

---

## 5. Movement and collision

Fixed timestep, **120 Hz**, decoupled from rendering, with render-time interpolation of camera pose. Non-negotiable for P4: variable-timestep physics produces the micro-jitter that reads as "buggy".

Player is a vertical capsule (r = 0.3 m, h = 1.75 m, eye at 1.65 m). No jump.

### 5.1 Cross-portal integration
Per substep, in the current cell's local coordinates:

1. Compute desired displacement `d`.
2. Test the segment `[p, p + d]` against every door rectangle of the current cell.
3. On a crossing at parameter `t`:
   - advance to the crossing point,
   - apply `T`: `p ← T·p`, `v ← R_T·v`, `yaw ← yaw + yaw(R_T)`,
   - switch current cell, and continue with the remaining `(1−t)·d`.
   - Cap at 4 crossings per substep (a diagnostic assert, not a real case at walking speed).
4. Otherwise resolve against the cell's collision brushes and slide.

Doorway openings are gaps in the wall brushes, so "walk at the wall next to the door" clamps and "walk at the door" crosses, with no special case.

### 5.2 The eye/body split
The camera must switch cells at the instant the **eye** crosses the portal plane, or the player sees through the wall for a frame. The body capsule crosses at a different moment.

Within `ε = 0.5 m` of a portal plane, the capsule is resolved against **both** cells (its own, and the neighbour's brushes pulled through `T`). This is standard portal-game practice and removes the entire class of "clipped through the door frame" bugs.

### 5.3 Raycasts, sound, props
Every query is cell-local and follows the same recursive-transform pattern as movement. Audio uses graph distance, never Euclidean distance — see §7.

---

## 6. Rendering

The visual quality bar (PRD P4, §7) is a genuine architectural constraint here, not a polish pass, because **portals are incompatible with most screen-space effects.** SSAO, SSR, TAA, and screen-space shadows all sample neighbouring pixels, and across a portal edge the neighbouring pixel is in a different universe — they leak, smear, and ghost precisely at the doorway the player is staring at. So:

> **Rule: no screen-space technique may sample across a portal boundary.** Anything spatial is either baked, or per-cell, or doesn't ship.

That rules out the cheap route to good-looking, and forces the quality to come from lighting and materials instead. Which is fine — it's also how architectural visualisation gets its look.

### 6.1 Recursive stencil portal pass

Render into an **HDR multisampled render target** (`RGBA16F`, `samples: 4`, `stencilBuffer: true`). MSAA is chosen over TAA/FXAA specifically because it is the only AA that doesn't sample across portal edges — and a house is nothing but long straight high-contrast edges, so AA quality is a first-order visual concern.

```
render(cell, camera, level, clipPlane):
    stencilFunc(EQUAL, level); stencilOp(KEEP, KEEP, KEEP)
    drawCellGeometry(cell, camera, clipPlane)

    if level == MAX_DEPTH: return

    for portal in visiblePortalsOf(cell, camera):       # §6.2
        # 1. mark the portal's pixels, where they pass depth
        colorMask(off); depthMask(off)
        stencilFunc(EQUAL, level); stencilOp(KEEP, KEEP, INCR)
        drawQuad(portal)

        # 2. reset depth inside the new region so the far side draws freely
        colorMask(off); depthMask(on); depthFunc(ALWAYS)
        stencilFunc(EQUAL, level + 1)
        drawFullscreenQuadAtFarPlane()
        depthFunc(LESS)

        # 3. recurse through the looking glass
        render(portal.dest,
               T[portal] · camera,
               level + 1,
               portalPlaneIn(portal.dest))

        # 4. unmark
        colorMask(off); depthMask(off)
        stencilFunc(EQUAL, level + 1); stencilOp(KEEP, KEEP, DECR)
        drawQuad(portal)

    # 5. stamp the portal's own depth so later siblings occlude correctly
    depthMask(on); colorMask(off); stencilFunc(EQUAL, level)
    for portal in visiblePortalsOf(cell, camera): drawQuad(portal)
```

`MAX_DEPTH = 3`, adaptive down to 1 under frame-time pressure. Stencil buffer is 8-bit, so depth is bounded at 255 regardless.

Implementation notes:

- three.js applies `material.stencilWrite/Func/Ref/ZPass/FuncMask` per draw call from material state, so a `setStencilState(ref, op)` helper mutating a registry of the ~20 shared materials is sufficient. No `needsUpdate` churn, no shader recompiles.
- The camera is driven by writing `matrixWorld` directly with `matrixWorldAutoUpdate = false`.
- Cell selection is by toggling `Group.visible`; only one cell group is ever visible per draw.

### 6.2 Clipping and culling

Geometry in the destination cell that sits *between* the portal and the transformed camera must not draw. We clip with **exactly one** `renderer.clippingPlanes` entry at all times — the portal plane pushed into the destination cell's coordinates, with a small epsilon.

The count is fixed at one (the root pass uses a plane placed far outside the level, clipping nothing) because three.js compiles a shader variant per clipping-plane count, and letting it vary would cause a compile hitch mid-traversal — a visible stutter exactly when the player walks through a door, which is the worst possible moment for P4.

Portal visibility test before recursing, cheapest first: backface (camera on the `+Z` side of `F`), then screen-space AABB of the quad's four projected corners against the viewport, then a solid-angle threshold to drop portals too small to matter.

### 6.3 Lighting and materials

Everything spatial must be baked or per-cell (§6 rule):

- **Indirect light:** one prefiltered PMREM environment, built procedurally in `render/env.ts` — a dim warm interior with a single cool window. Not three's stock `RoomEnvironment`: that is a bright photographic studio, and every floor in this game is large and seen at a grazing angle, where Fresnel drives reflectance towards 1 and a dark oak board renders as a sheet of white. Shared across cells rather than per-cell, with per-cell colour coming from the light rig.
- **Direct light:** a small number of per-cell lights — warm practicals plus cool window light. Light never crosses a portal in v0.1. This is a real limitation (a lit room seen through a doorway is lit by *its own* lights, correctly, but casts nothing into yours) and it happens to be invisible in practice.
- **Shadows:** **none.** This is the largest deviation from the original spec, and it is forced: a cell is drawn once per recursion path that reaches it, so a per-cell shadow map would have to be re-rendered several times a frame, and shadows still could not cross a portal. Vertex AO does the contact darkening and a fill light (below) does the rest. In a diffuse interior with this much soft indirect light, almost nothing is missing.
- **Fill:** a second directional light opposite the key, tinted towards the room's ground colour. With no global illumination, surfaces facing away from the key would receive hemisphere fill only and read as black; this stands in for the bounce. The light rig's composition is fixed (hemisphere + key + fill + four point lights, unused ones at zero intensity) so the shader variant count stays at one.
- **Ambient occlusion:** **baked**, into vertex colours and AO maps at content-build time. Not SSAO — SSAO across a doorway is exactly the leak §6 forbids, and corner-darkening is most of what sells interior geometry.
- **Materials:** `MeshPhysicalMaterial` for varnished wood (clearcoat), `MeshStandardMaterial` elsewhere. Full linear workflow; scene renders with `NoToneMapping` into the HDR target, tonemapping happens once in the composite.

### 6.4 Post chain

Runs **after** the portal pass resolves, so it never sees stencil or portal structure and cannot leak across boundaries:

1. Bright-pass + separable Gaussian bloom, subtle — for window light and practicals only
2. Composite: ACES filmic tonemap → sRGB
3. Gentle vignette
4. Fine film grain, ~1% — hides banding in the large flat plaster gradients that this kind of soft lighting produces

Explicitly excluded: SSAO, SSR, TAA, motion blur, depth of field. All of them leak across portals (§6).

### 6.5 Traversal seamlessness

The single most important frame in the game is the one where the player crosses a doorway. It must be **bit-identical either side of the crossing** or the illusion dies.

- Camera near plane `0.02 m`, so the portal quad is never clipped by it.
- The cell switch happens at the eye plane crossing (§5.2), and the pre- and post-switch views are the same view by construction — before the switch it is drawn as recursion level 1 through the portal, after the switch as level 0 directly. Same geometry, same camera, same lights, different code path.
- **Verification:** *not yet built.* The intent stands — an automated test walking the player through every portal at several angles and speeds, comparing the frames either side of the switch — but it is the largest remaining gap. Regressions here are subtle and fatal, and eyeballing them does not scale.

---

## 7. Audio

Sound is the second channel through which the house can be wrong (PRD §8), and it has one advantage over the picture: it works when the player is facing the other way. The whole subsystem follows from two decisions.

### 7.1 The listener never moves

The WebAudio listener sits at the origin looking down −Z, permanently, and every sound is placed in **head coordinates** — where it is relative to the player's eyes and facing.

This is §2 restated for the ears. A cell-local position is meaningless the moment you cross a portal, and so is a listener position expressed in one. But the vector from your head to a source is continuous across a doorway: the portal transform rotates the source and the head by the same amount, so the difference is untouched. Formally, if the camera in cell `A` is `C` and the acoustic image of cell `E` is `M : E → A`, the head-space position of a source at `p` is `C⁻¹ · M · p`. After crossing into `B` both become `T·C` and `T·M`, and

```
(T·C)⁻¹ · (T·M) · p = C⁻¹ · T⁻¹ · T · M · p = C⁻¹ · M · p
```

— unchanged. Head coordinates are the *only* frame in which the panner can be smoothed without glitching on traversal, which matters because a click at a doorway is a click at exactly the moment the player is deciding whether to believe the house.

Measured: walking through a portal moves the lantern's head-space position by 0.081 m on the crossing frame, against 0.171 m for the worst ordinary walking frame. There is no seam.

### 7.2 Sound travels the portal graph

`audio/propagation.ts` runs Dijkstra over the portal graph, ordered by **acoustic path length** — doorway to doorway, never Euclidean distance. It returns, per reachable cell, the composed transform (its *acoustic image*), the path length, the hop count, and whether every doorway on the path was open.

Three consequences, all of them the point:

- **Direction is the image's, not the doorway's.** The house's claim is that the room really is over there; the ear makes the same claim the eye does through a grille. Around a ring with non-trivial holonomy, a sound two rooms away arrives from where the *ring* says, which is not where the player's gut says.
- **A room can be acoustically far and geometrically near**, and in these houses it routinely is. Distance is path length; the panner is then placed along the image direction *at that distance*, so the two disagree exactly as much as the house does.
- **Keeping only the shortest path is correct, not just cheap.** The shrine in Three Lefts sits behind three separate grilles; you hear it through whichever is nearest, and walking the ring swings the source round to the next one as it takes over. That is simply what one room with three windows sounds like.

Occlusion is a lowpass driven by hop count (`18 kHz · 0.3ⁿ`), halved again for a path through a grille. Reverb send rises with hop count, because the further round the graph a sound comes, the more of it arrives as reflection rather than as a straight line.

The load-time check for this is the same shape as the holonomy assertions (§3.4): the shrine reads **5.0 m, bearing 90°, one doorway, barred** from w1, w2 *and* w3 identically. PRD §4.5's claim that the three grilles look into one room is now audible, and provable by ear.

### 7.3 Everything is synthesised

No audio files. `audio/synth.ts` generates noise, impulse responses, and one-shots from arithmetic.

Room reverb is **computed from the room's own measurements** via Sabine's equation, `RT60 = 0.161·V/A`, with absorption coefficients from the cell's floor material and a furnished-plaster interior. Nobody authored a single reverb time: the cathedral rings for 3.2 s and the cupboard-sized vestibule for 0.59 s because those are the sizes they are. A room that measures small and *sounds* large would be a lie, and P1 does not allow the house any.

Two convolvers crossfade on a cell change, for the same reason there is no fade at a doorway.

Footsteps are a resonant noise burst plus a body thump, tuned per **room style** rather than per floor material — eight styles instead of two, because PRD §4.4 wants rooms identifiable without looking at them, and cartography needs that when you are walking backwards down a corridor counting paces.

### 7.4 Cost

One `AudioContext`, one positional voice per lantern, a 20 Hz propagation tick over a graph a dozen cells wide, and impulse responses cached by acoustic profile. Nothing here appears in the frame budget (§8).

The first pass also gave every wall lamp a hiss and every cell an air tone — eleven continuous noise sources, which together sounded like a fault rather than a house. Near-silence (PRD §8) is a real constraint and it was violated by accretion, one reasonable-sounding source at a time. What remains that is *continuous* is the lantern alone, and it is three quiet sine partials rather than filtered noise: noise localises badly, and this is the one sound that has to be findable.

`?mute` prevents the context from ever being created, for automated testing — a loaded page keeps playing after the dev server is gone, and a tab nobody can find is somebody's afternoon.

---

## 8. Performance budget

| Item | Budget |
|---|---|
| Frame | 16.6 ms, hard ceiling 20 ms |
| Portal draws per frame | ≤ 8 (depth 3, adaptive) |
| Draw calls per cell | ≤ 40 (merged static geometry, instanced props) |
| Triangles visible | ≤ 400 k |
| Shadow maps | none — see §6.3 |
| GC allocation in hot loop | **zero** — all vectors, matrices, and quaternions preallocated |

Zero-allocation is listed as a budget item because a GC pause is a hitch, and a hitch reads as a bug (P4).

### 8.1 Adaptive quality

Measured on The House: **115 draw calls, 23k triangles, 14 cell draws** per frame. So the frame is not geometry-bound or draw-call-bound — it is bound by fill rate and bandwidth. Fourteen passes of shaded geometry onto a half-float target with 4× MSAA is 32 bytes per pixel, and on a 2× display that is ~200 MB of framebuffer traffic per frame.

Rather than pick a setting that is right on one machine, `render/quality.ts` measures the frame and climbs a ladder: resolution scale first (cheapest to lose, hardest to see), then MSAA samples, then portal recursion depth last — because rooms flattening to darkness two doorways away changes what the house *is*, and P4 says anything that reads as a glitch costs more than it saves.

> **The trap, which the first version fell into.** Thresholds must be multiples of the display's *own* refresh period, not of 1/60. Under vsync a perfectly healthy frame delta **is** the refresh interval, so a fixed "faster than 13.7 ms means we have headroom" test can never pass on a 60 Hz panel, and the controller becomes a one-way ratchet: it walks quality down and never brings it back. The refresh period is learned as the fastest frame seen, which the menu establishes for free before any level loads.

Backoff handles the other failure mode: if a step up is immediately undone, the delay before retrying that rung doubles, so a machine sitting exactly on a boundary settles instead of oscillating.

---

## 9. File layout

```
src/
  core/         fixed-timestep loop, input, pointer lock, small maths helpers
  world/        CellSpec → geometry, mesh builder, vertex AO, level graph,
                portal transforms, holonomy assertions
  render/       portal renderer, stencil state, materials, environment, post chain
  player/       capsule controller, cross-portal collision, camera, chalk
  audio/        portal-graph propagation, procedural synthesis, the engine
  levels/       eight, in teaching order — see LEVELS.md for the design plan
  ui/           menu, HUD, dead-reckoning notebook
```

Transform and holonomy maths ended up in `world/world.ts` next to the graph that uses it rather than in a separate `geom/`; it is about eighty lines and splitting it would have separated the two halves of one idea.

`audio/propagation.ts` is deliberately not in `world/`, even though it is graph maths over portal transforms: it answers an acoustic question, and the renderer and the controller have no business depending on it.

Loop assertions run **at level load**, in the browser, and print to the console — rather than in a separate test process. That was deliberate: the check needs the real built geometry, and having it run every single time anyone opens a level is stronger than having it run in CI.

---

## 10. Milestones

| | Deliverable | Done when |
|---|---|---|
| **M1** ✅ | Portal engine — cell graph, transforms, stencil rendering | You can look through a doorway into a room that isn't there |
| **M2** ✅ | Player — capsule, collision, cross-portal movement, eye switch | You can *walk* three lefts and arrive home |
| **M3** ✅ | Three levels — hall + both wings, the gallery, the Penrose stair | The geometry teaches itself without a word of text |
| **M4** ✅ | The look — materials, IBL, baked vertex AO, fill light, post chain | It stops looking like a demo (PRD §7) |
| **M5** ✅ | Chalk, notebook, menu, debug HUD | A player can prove the loop to themselves |

M4 is deliberately before content expansion, per PRD §6 — we need to know the look holds up before building twenty rooms on top of it.

---

## 11. Risks

| | Risk | Mitigation |
|---|---|---|
| **R1** ✅ | three.js multisampled render target + stencil buffer may not work cleanly on all WebGL2 drivers | **Resolved.** `Pipeline.resize` probes framebuffer completeness at 4× MSAA and silently falls back to 1.5× supersampling if it fails; the HUD reports which path is live. Working with MSAA on the machines tested so far. |
| **R2** | Recursion cost with many co-visible portals | Solid-angle culling, adaptive depth, and a hard portal-draw cap (§8) |
| **R3** | Motion sickness from rotation on traversal | Portal transforms are yaw-only in v0.1 — no roll, no pitch. Column axis is always vertical. |
| **R4** | Players read the effect as a bug rather than a rule | This is the whole of PRD P1 and P4. Mitigated by consistency, chalk, and load-time holonomy assertions. The traversal-seamlessness test (§6.5) is **still outstanding** and is the main remaining risk here. |
| **R5** | Baked AO / lightmap pipeline is a content-tools project of its own | v0.1 ships vertex-AO computed procedurally at cell build time from the box geometry; texture-space baking deferred |


---

## 12. What shipped, and what did not

Built and verified by walking it, not just by loading it:

- Recursive stencil portal rendering, depth 3, with darkness fallback past the limit
- Cross-portal movement, collision, and the eye-plane cell switch
- All three levels, every declared loop asserting green at load
- Grilles (§4.2) — not in the original design, and now load-bearing
- Chalk with numbered tally marks, and the dead-reckoning notebook — both were scoped to later versions and were cheap enough to pull forward, and the notebook in particular is too central to P3 to have left out
- Menu, pause, level completion, progress persisted to `localStorage`
- **Levels 4–8** (see [LEVELS.md](./LEVELS.md)) — a double cover, a self-glued cell with non-commuting loops, a grille maze, a coupled rotation-and-rise helix, and a triple cover. Plus multi-lantern objectives, and a load-time check that every objective is *walkable* from spawn and not merely visible, which is the specific way a level built out of grilles ships broken.
- **Audio (§7).** Listed here as the highest-value gap in the first pass, and built in the second: portal-graph propagation, Sabine reverb from room measurements, per-style footsteps, all of it synthesised. It turned out to be the cheapest way yet found to make the house's strangeness *provable* — the shrine reads identically from all three grilles, and that is a fact a player can check with their ears from inside a room they cannot leave.

Not built:

- **The traversal-seamlessness image test (§6.5).** The largest remaining gap. The audio equivalent now exists (§7.1, measured across a crossing); the picture still has no automated version.
- **Dynamic shadows.** Deliberate, see §6.3; would need re-rendering per recursion path.
- **Mirror and scale portals (PRD §6, v0.3).** The renderer tracks no winding parity, so a `det < 0` transform would need face-culling flipped per pass, and the player's yaw would have to become a full frame rather than a scalar.
