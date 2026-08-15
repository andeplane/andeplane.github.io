# CLAUDE.md — working notes for *Flow Defence*

Tower defence where the map is a fluid. Design doc: andeplane/andeplane.github.io#8.
Stack: TypeScript + Vite + Babylon.js (`WebGPUEngine`, plain-WGSL `ComputeShader`s).

Core loop (2026-08 redesign): enemies are discrete **spores** — GPU particles
advected by the real velocity field (`enemies.wgsl.ts`) — arriving in announced
**waves** (`config.ts#levels`). Escape costs a **life**; kills pay flat bounty.
Player verbs: walls (re-route the river; repaint = repair), neutralizer rings,
impellers, and the **jet** (hold right mouse = radial water blast, stamina in
`Engine.jetCharge`). Surge waves slam the water hammer. The old biomass field
is now the cosmetic glow/trail field (`glow.wgsl.ts`), rendered via `bioTex`.

```
npm run dev      # vite dev server (needs a WebGPU browser)
npm run test     # vitest — CPU reference physics + engine tests
npm run check    # headless validation (wraps vitest)
npm run build    # tsc + vite build
```

## Architecture rules

1. **One source of truth for solver math.** `src/sim/core/constants.ts` and
   `erosionRule.ts` are imported by BOTH the CPU reference solver (`lbmRef.ts`,
   `CpuSim.ts`) and the WGSL kernels (template literals in `sim/gpu/shaders/`).
   Never duplicate a lattice weight or threshold into shader source.
2. **Purity split.** `engine/`, `ai/`, `sim/core/`, `sim/CpuSim.ts`, `stats/`
   import no DOM and no Babylon — that's what makes vitest/headless possible.
   `sim/gpu/` and `render/` are the browser boundary.
3. **GPU→CPU quantities are monotone accumulators** (`counters` buffer:
   [0] breaches, [1] tower kills (pay bounty), [2] escapes, [3] outlet flux
   out, [4] outlet backflow, [5] suffocated (pay NOTHING — sealed basins
   must not be bounty farms)). The engine consumes diffs between snapshots,
   so readback staleness can never lose or double-count. Alive count =
   spawned − kills − escapes (all CPU-known). Enemy positions read back
   every 10 ticks (32 KB) purely for overlay beams/dots, extrapolated by
   each spore's stored per-tick velocity.
4. **Walls are painted with per-cell partial buffer writes** (`paintWall`).
   A full upload from the CPU mirror would resurrect cells the GPU erosion
   pass has already breached. The CPU mirror is *optimistic*, the GPU is truth.
5. Towers exist only as a CPU list (`engine/towers.ts`); the GPU sees splatted
   fields (biomass decay rate, body force), re-uploaded when `towersVersion`
   changes.

## Physics notes

- LBM D2Q9, fused pull-stream+BGK collide, Smagorinsky LES (τ0 floor 0.58),
  Guo forcing, velocity clamp 0.25. K=3 substeps per 60 Hz tick.
- Partial bounce-back (Walsh–Burwinkle–Saar): wall solidity ∈ (0,1) blends
  transmitted and reflected populations — eroding walls leak physically.
- **The outlet must anchor pressure** (feq at ρ=1, extrapolated u). A
  zero-gradient copy outlet never sets the domain's pressure level; the inlet
  then pressurizes the whole domain without bound. Cost a debugging session.
- Spores suffocate below `enemies.stagnantU` flow speed — sealing an arm is
  a real defense (no bounty) instead of creating trapped zombies that stall
  the wave forever. But becalmed spores first HUNT for current (`seek*` in
  config): they sniff the local speed gradient and crawl toward moving
  water, holding their breath while any is in reach. Only genuinely sealed
  pockets drown quietly. This is the anti-exploit rule: a dam with a hair
  canal leaks the swarm through the canal, and a rotting blockade funnels
  spores to its cracks — verified by bot-farm/bot-blockade LOSING.
- The base must drink: intake (30 s net outlet volume window) below
  `thirstFraction × nominalFlux` starves the base (lives drain, flood
  pressure ramps until blockades burst). `nominalFlux` is per level,
  measured with scratchpad `flux-measure.mjs` — REMEASURE when
  `inlet.choke` or an arena changes.
- Erosion = shear above threshold + pressure head above threshold × porosity
  (porosity grows as integrity falls → breaches cascade). Tuning lives in
  `config.ts#erosion`; the same rule runs in `erosionRule.ts` and WGSL.
  `inlet.surgeRho` is deliberately BELOW `erosion.pipeThreshold`: a surge
  alone must strain seals (shear), not auto-dissolve them — full dams build
  bigger heads and still fail by piping.

## WebGPU / Babylon traps hit so far

1. **Never trust `--headless --virtual-time-budget` screenshots.** Virtual
   time starves the fixed-step accumulator (deltas ~0) and produced a
   convincing "standing shock" that was pure artifact. Drive a real browser:
   `scratchpad drive.mjs` pattern — playwright-core + real Chrome with
   `--headless=new --enable-gpu --use-angle=metal --enable-unsafe-webgpu`,
   wait real seconds, read `console` + screenshot.
2. **WGSL: don't dynamically index module-scope `const` arrays** (lattice
   vectors etc.) — some validators reject it silently through Babylon. Use
   `var<private>`. Also: `target` is a WGSL reserved keyword — a variable
   named `target` fails shader compilation (silently, pass just never runs).
3. Babylon compute: bind textures' samplers by name `<texName>Sampler` in
   materials; in `ComputeShader`s pass a `TextureSampler` explicitly.
   Ping-pong = two ComputeShader instances with fixed bindings.
4. **`StorageBuffer.read()` cadence matters**: per-tick readback throttles the
   whole queue (staging-buffer churn). 2 Hz (`readbackEvery = 30`) is plenty
   and costs nothing.
5. The counters buffer must be allocated at its full layout size (16 × u32);
   WGSL out-of-bounds atomics fail silently and the CPU-side view throws.
6. `UniformBuffer`: `addUniform(name, 1)` per f32, packed sequentially —
   matches a WGSL struct of consecutive f32s.

## Verifying changes

- Physics: `npx vitest run` (mass conservation, Poiseuille ≤2%, porous-plug
  monotonicity, spores-reach-outlet, neutralizer-kills, dam-breach timing,
  Engine wave/lives/win logic).
- Gameplay balance: self-play bots (scratchpad `bot-play.mjs` = seals +
  middle-jet ring gauntlet + throttled repair, must WIN level 1;
  `bot-idle.mjs` must LOSE). Never edit demos/ files while a bot runs — HMR
  reloads the page mid-match. Bots repaint seals at most every ~25 s: repair
  costs gold per sweep and repainting every poll bankrupts the economy.
- Visuals: dev server + a playwright script (scratchpad `smoke-waves.mjs`,
  `jet-check.mjs`). Useful query params:
  `?warmup=N` (pre-roll ticks) · `?probe` (fps + wave/lives + observables) ·
  `?field=speed|pressure|dye` (debug views) ·
  `?seed=N` · `?readback=N` (0 disables) · `?tau=`, `?smag=` (solver overrides).
- The `#errlog` overlay surfaces console errors in screenshots.
