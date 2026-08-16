# TODO — committed work

Near-term work we have agreed to do, in rough priority order. Speculative
material lives in `IDEAS.md`; this file is only for things we intend to ship.

## Gameplay / content

- [x] **Campaign progression.** 8 levels, per-level tower unlocks
      (`towerDefs.unlockLevel`) + new spore types (`sporeDefs`), star
      ratings (lives kept), previous-level gating, NEW TOWER / NEW SPORE
      intro toasts. Shipped 2026-08-16.
- [ ] **Level packs.** If the campaign outgrows one list: group levels into
      packs in the menu. (Per-level unlocks already exist.)
- [ ] **Level editor.** Levels are terrain shapes + wave tables + numbers —
      an in-browser editor that emits that JSON (paint bedrock, place inlets,
      author waves, playtest in place, share via URL).
- [x] **Bot-verify all 8 levels.** Done 2026-08-16: every level's
      bot-campaign plan WINS (canal/funnel meta) and the exploit bots
      (drown-farm, blockade, idle) all LOSE; 20/20 unit tests. Verified via
      frozen `vite preview` builds on port 4173 (see CLAUDE.md).
- [ ] **Tower upgrades** (tiers bought in place) — next big system after
      the campaign lands; the registry already isolates all tower data.

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
