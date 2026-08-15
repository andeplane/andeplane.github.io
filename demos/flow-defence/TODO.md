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
- [ ] **Bot-verify all 8 levels.** bot-campaign.mjs plays any level via the
      ?bot=1 API; every level's plan must WIN and the exploit bots must
      still LOSE. In progress — the release gate for the campaign build.
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
