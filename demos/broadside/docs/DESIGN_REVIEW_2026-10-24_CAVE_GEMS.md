# Cave gold and gemstones — 24 October 2026

Delivered in both Broadside and Captain Calculus, iPhone build 2026102403.

## Change

Cave doubloons have brighter gold shading and sharper specular reflections. Eight small, depth-tested glints per bank catch the light slowly; Reduce Motion suppresses their animation. Ship-hold coin materials retain their existing appearance.

Diamonds, rubies, emeralds and sapphires use flat, polished facets. Their rendered vertices also define their Rapier convex collision hulls. New stones occupy the same physical chest simulation as new coins, contact its moving walls, the rocky floor, previously settled gold, other stones and visible obstacles, and settle under gravity. Completion waits for both coins and stones. Earlier settled stones become permanent colliders, as earlier coins already do.

These are bonus visual treasures, with no conversion to currency and no change to earned gold, exact chest rewards, or either game's ledger. Four stones accompany the first 250-gold band, up to 32 per bank. Instancing bounds the gemstone rendering to four meshes per bank; sparkle adds no lights, bloom or render passes. Existing saves acquire stones through an initial physical settling pass, queued one bank at a time to avoid four simultaneous WASM worlds. Normal play acquires them during earned chest pours. Separate, versioned cosmetic caches retain their settled poses; invalid or unavailable caches cannot alter monetary progress. Leaving the scene cancels pending work and terminates its worker.

## Reviewed running UI

Evidence: `artifacts/cave-gems-20261024/`, including screenshots, DOM state records in `checks.json`, remote tests and build verification. All test fixtures disable normal player saves.

- Broadside: empty cave; 10,000-gold first bank; fully cleared 40,000-gold cave with 128 gems; initial settling; walking and forward movement; bank inspection and Escape return; portrait-to-narrow orientation/layout change; landscape safe areas; unloading flow.
- Captain Calculus: empty and 10,000-gold cave; walking to the first pile; return to entrance; Back to Home; first 1,000-gold unload; completed reward; Explore your cave; Visit your ship with no cargo.
- Sizes: 390×844, 320×568 and 844×390, with simulated portrait top/bottom and landscape left/right/bottom phone safe areas. Saved screenshots show the controls, headers and rewards inside the viewport without new overlap or clipping. Shared UI styling was unchanged by this feature; the broader contrast, touch-target and navigation audit remains documented in `IOS_RELEASE_REVIEW_2026-10-24.md`.
- Broadside's four full banks completed their initial settling and retired every worker. The observed initial simulations took about 5.4–9 seconds each, serially, while the cave remained interactive. Settled browser rendering reported 60 fps. This is desktop browser evidence, not an iPhone performance claim.
- Captain Calculus visibly credited exactly 1,000 gold only after all 1,000 coins and 16 stones settled; physics became inactive, cargo became zero, and one scene remained. The UI retained the full bank after visiting the ship.

## Validation

- M1 worker: TypeScript passes; 384 tests pass, two private-asset tests skipped because their private GLBs are absent remotely.
- New real-WASM regressions cover closed convex gemstone geometry, bounded counts with million-gold balances, settling on all four saved gold banks without changing coin poses, gravity-driven motion, worker retirement, and a combined 1,000-coin / 16-gem chest pour.
- Existing coin simulations, exact 100/900/1,000-gold rewards, separate math bank accounting and scene lifecycle regressions pass.
- Both signed Release builds succeed and install on the connected iPhone as 2026102403. Every generated web file matches its installed app payload by SHA-256: 94 Broadside files and 81 Captain Calculus files, zero mismatches. Source hashes are saved alongside that verification.

## Proof boundaries

Physical iPhone gameplay, touch feel, thermals, battery cost, long sessions and native Reduce Motion appearance have not been tested for this change. Reduced-motion suppression was inspected in source; the available browser tooling has no OS preference emulation. Cosmetic-cache corruption and worker-error presentation were not visually fault-injected. The pre-existing million-gold pile-height issue and App Store release blockers in `IOS_RELEASE_REVIEW_2026-10-24.md` remain open; this feature does not establish public-release readiness.
