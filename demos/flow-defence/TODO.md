# TODO — committed work

Near-term work we have agreed to do, in rough priority order. Speculative
material lives in `IDEAS.md`; this file is only for things we intend to ship.

## Gameplay / content

- [ ] **Level packs.** Group levels into packs (menu shows packs → levels);
      each pack introduces a new tower or mechanic, unlocked when the pack
      opens. Levels are already pure data (`config.ts#levels`), so this is
      menu structure + an `unlocks` field per pack.
- [ ] **Per-pack tower unlocks.** The tool row / build UI only offers towers
      the current pack has introduced, so early levels stay simple.
- [ ] **Level editor.** Levels are terrain shapes + wave tables + numbers —
      an in-browser editor that emits that JSON (paint bedrock, place inlets,
      author waves, playtest in place, share via URL).
- [ ] **Bot-verify levels 2 and 3.** The self-play matrix (win bots must win,
      degenerate bots must lose) currently gates level 1; run and tune the
      same matrix on the serpentine and narrows arenas.

## Platform

- [ ] **Phone playability.** Touch controls (draw walls with a finger, a
      touch-friendly replacement for the hold-right-mouse jet, tool palette
      sized for thumbs), responsive HUD layout, and a perf preset for mobile
      GPUs (lower sim/dye resolution, cheaper post).

## Housekeeping

- [ ] Push branch + open PR once the current balance batch is verified.
- [ ] `CLAUDE.md` still predates thirst/flood — update the working notes
      (counters layout now includes escapes/flux/backflow/suffocated; thirst,
      flood escalation, per-level `nominalFlux`).
