# CLAUDE.md — working notes for *Flow Defence*

Tower defence where the map is a fluid. Design doc: andeplane/andeplane.github.io#8.
Stack: TypeScript + Vite + Babylon.js (`WebGPUEngine`, plain-WGSL `ComputeShader`s).

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
   breaches, outlet-absorbed, neutralized). The engine consumes diffs between
   snapshots, so readback staleness can never lose or double-count mass.
   Instantaneous slots (in-flight total, per-segment rho) are cleared by CPU
   writes each tick.
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
- **Biomass injection is a Dirichlet source** (inlet cells hold a fixed
  concentration). Accumulating (`+=`) explodes: the clamped boundary makes
  inlet cells retain their own content forever, and gather-advection then
  duplicates the giant reservoir downstream. Cost another session.
- Erosion = shear above threshold + pressure head above threshold × porosity
  (porosity grows as integrity falls → breaches cascade). Tuning lives in
  `config.ts#erosion`; the same rule runs in `erosionRule.ts` and WGSL.

## WebGPU / Babylon traps hit so far

1. **Never trust `--headless --virtual-time-budget` screenshots.** Virtual
   time starves the fixed-step accumulator (deltas ~0) and produced a
   convincing "standing shock" that was pure artifact. Drive a real browser:
   `scratchpad drive.mjs` pattern — playwright-core + real Chrome with
   `--headless=new --enable-gpu --use-angle=metal --enable-unsafe-webgpu`,
   wait real seconds, read `console` + screenshot.
2. **WGSL: don't dynamically index module-scope `const` arrays** (lattice
   vectors etc.) — some validators reject it silently through Babylon. Use
   `var<private>`.
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
  monotonicity, biomass boundedness, dam-breach timing).
- Visuals/gameplay: dev server + a playwright script (see scratchpad
  `drive.mjs` / `match-test.mjs` patterns). Useful query params:
  `?warmup=N` (pre-roll ticks) · `?probe` (fps + observables overlay+console) ·
  `?field=speed|pressure|dye` (debug views) · `?ai=steady|burster|prober` ·
  `?seed=N` · `?readback=N` (0 disables) · `?tau=`, `?smag=` (solver overrides).
- The `#errlog` overlay surfaces console errors in screenshots.
