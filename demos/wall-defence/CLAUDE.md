# Wall Defence — working notes

JezzBall × tower defence roguelite with a client-side daily board. Full design
and the rules the code implements: `docs/DESIGN.md` (read it before touching
`src/sim/`).

## Commands

- `npm run dev` — vite dev server
- `npm run check` — typecheck + determinism replay test + fast self-play gate.
  **Run after any change to `src/sim/`.**
- `npm run balance` (`tsx tools/balance.ts [seeds]`) — the full balance
  contract: 6 bot profiles (novice/average/expert + sliver/turtle/no-tower)
  × N seeds, 11 criteria (skill ladder monotone, win-rate bands, degenerate
  strategies lose, walls stay contested, plugging works). **Run before
  claiming any balance change is an improvement**, with ≥ 20 seeds.
- `npm run build` — typecheck + vite build (site deploy builds every demo, so a
  broken build here breaks the whole site deploy)

## Hard rules in src/sim/

- Zero DOM imports; everything runs headless in Node (tools/ depends on it).
- Integers only: Q8 fixed point (1 cell = 256 units), no `Math.random`,
  `Date.now`, floats, or transcendentals (heading table is baked literals).
- All iteration index-order/row-major; "nearest" ties break by lowest entity id
  (cells: lowest row-major index). Entity ids come from `state.nextId`, never
  reused.
- Percentage boundaries compare exact rationals (`cells * 100 >= pct * CELLS`);
  `floor` percentages are display-only.
- Any new randomness that must be identical for all daily players goes through
  `substream(seed, label, index)`, never `state.rngState`.
- `state.fx` is render-only, cleared every tick, excluded from `hashState` —
  never let sim logic read it.
- New sim state fields MUST be added to `hashState` (determinism test will not
  catch a field you forgot to hash — it catches divergence, not omission).

## Tools

- `tools/determinism.ts` — bot game recorded + replayed, per-tick hash compare.
- `tools/selfplay.ts` — fast balance gate (subset of balance.ts).
- `tools/balance.ts` — full profile × seed matrix; `tools/bot.ts` holds the
  profiles (reaction cadence, sampling, error rate, plug/turtle/sliver flags).
- `tools/record.ts <seed>` — emit an event log JSON for browser replay.
- `tools/inspect.ts <log> <tick>` — replay a log headless, dump cell counts.
- In the browser, `window.__wd` exposes `state`, `emit(event)`,
  `startSeed(seed)`, and `advance(ticks, log)` for scripted screenshots
  (Playwright with real Chrome; see the repo memory rule — never trust
  `--virtual-time-budget` shots).

## Traps hit

- Wave 1's telegraph tick is 0 but the tick counter starts at 1 — schedule
  checks must be `>=` with a fired-guard, not `===`.
- Sealing the whole border used to stop all spawns: portals must relocate to
  the nearest open cell (BFS), and punch a 3×3 breach if the board is 100%
  sealed.
- A completing cut half must stop *short* of the solid cell boundary
  (`cellOf(head)` lands on the blocker otherwise and converts a CLAIMED cell to
  WALL).
- `(a/b)|0` truncates toward zero; use floor division for negative velocities.
- Claims may ONLY happen on a tick where a cut completed (`recomputeClaims`'s
  `allowClaims` flag). Letting ball deaths claim regions re-opens the
  "turrets clear the board → everything auto-claims" snowball that broke all
  balance in rev 2.
- Capture bursts pay only for never-before-claimed cells (`everClaimed`);
  paying on re-claims re-opens the breach-farm money printer.
