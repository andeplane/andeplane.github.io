# Shared pirate presentation

Broadside, Captain Calculus and Captain Reader consume one internal library at `src/shared/pirate-world/`. Its `PirateWorld` controller owns the ship hold, cave, cargo queue, delivery animation and scene lifetime. All three hosts call this controller; `math/goldCave.ts` is now an engine/UI host, not a second cave controller.

The library owns chest and cargo geometry, carrying/opening/tipping/withdrawal, physical coin pouring and settlement workers, cave treasure/reserves and effects, coin sound playback, first-person controls and cameras, mobile rendering limits, and the optional purchased ship and harbour presentations. General ocean/island scenery and simulation math remain reusable support modules outside the directory; the boundary checker walks their runtime imports too. No game ledger or progression module is reachable from the shared runtime.

`index.ts` exposes the controller, input binding and public types. Lower-level subpaths remain available to existing sailing renderers and the isolated coin debug lab. Applications must not construct replacement cave or hold scenes. `npm test` runs `tools/checkPirateBoundary.mjs` before the tests: it rejects game progress/rules imports, duplicate named scene/animation owners, cave/hold construction outside the controller, and new scene implementations in math/reading modules.

## Game boundary

`game/pirateAdapter.ts` converts sailing voyages/fishing cargo and keepsakes into `TreasureState`; `math/pirateAdapter.ts` supplies operator banks and actual chest values; `reading/pirateAdapter.ts` supplies independent language banks and reading cargo. An adapter supplies configuration, supported banking areas, bank/room labels, optional keepsake slots/theme/sound, banked gold and pending `{id, area, gold}` records. The library never awards a reward or chooses a lesson/voyage. A future game supplies another adapter and host, not another controller.

Delivery is synchronous and idempotent at the ledger boundary. The adapter prepares a cloned ledger, validates delivery and persists it before publishing the new in-memory state. Failed storage leaves the old cargo pending. The shared generation token rejects cancelled/stale completions; duplicate completion cannot credit a chest twice. Previewing a pour changes presentation only. The existing games support chests of at most 1,000 gold, and every poured unit is one simulated coin, including 100- and 900-gold rewards. The common controller does not reprice either game.

The existing currency/progression formats and keys remain unchanged: sailing uses `broadside.v1`, Calculus retains its existing academy save/version and migration logic. Gold pose persistence is injected through `PosePersistence`; the adapters preserve `broadside.coin-poses` and `captain-calculus.coin-poses`, including reserve/gem cache suffixes. Reader uses `broadside.reading.v1` and `captain-reader.coin-poses`. Cosmetic pose caches never own currency.

Public chest/hoard binaries, cave textures and coin recording remain at their existing single `public/` paths, named centrally in `assets.ts`. All three bundles load these same assets. Purchased ship files remain ignored in `.private`, are supplied only to Broadside when available, and are never added to this repository.

## Lifetime and recovery

Use `showShip`, `showCave` or `beginUnload`, then call `render` with frame delta and the current reduced-motion preference. Each transition disposes the other presentation scene. `cancel` discards animation state and leaves unfinished cargo in the adapter; reopening starts from its stable ID. Partial scene-construction failure disposes any newly allocated scene. Asynchronous asset/physics failures stop the experience and report an error; returning/reopening retries failed chest asset loads.

`bindWorldControls` owns cave keyboard/drag/pinch/pointer capture and optional movement pad/jump bindings. It clears input during transitions and DOM/native interruptions. Backgrounding freezes presentation completion; returning resumes without applying elapsed wall time. Its disposer aborts DOM listeners and removes the native app listener, including late registration. Hosts dispose the world/engine at their own lifetime boundary. Broadside's sailing navigation, arrival curtain, deck simulation and UI remain in Broadside; its cave/hold cargo behavior is shared.

## Validation and packages

Run `npm run typecheck`, `npm test`, and browser builds after shared changes. Native selection remains the separate Broadside/Calculus/Reader packaging scripts. `pirate-world-build.json` records the Git base revision plus exact runtime-source, shared-core and common-asset SHA-256 fingerprints, including uncommitted source content. Compare fingerprints rather than assuming a clean revision from the revision field alone.

After native builds, run:

```sh
node tools/verifyPiratePackages.mjs /absolute/path/Broadside/App.app /absolute/path/Calculus/App.app /absolute/path/Reader/App.app
```

This verifies current source fingerprints and every packaged web file against each generated native web bundle. See [the migration review](DESIGN_REVIEW_2026-10-25_PIRATE_WORLD.md) for the performed checks and their limits. Installed apps receive this library through a later app update.
