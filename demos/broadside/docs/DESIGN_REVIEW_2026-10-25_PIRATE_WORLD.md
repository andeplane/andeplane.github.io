# Pirate presentation migration review — 25 October 2026

The cave, hold and cargo experience now have one controller and implementation for Broadside and Captain Calculus. Reward rules and saves stay in each game. This review covers the browser experience and compiled native resources; physical iPhone interaction is unverified. Captain Reader was not implemented or changed.

## Screens and states inspected

The [viewport record](review/pirate-world-20261025/viewport-record.json) contains 51 browser captures across 390×844, 320×568 and 844×390. The final matrix used a touch/coarse-pointer phone context, reduced motion and simulated top/right/bottom/left safe insets of 47/12/34/12, 24/8/18/8 and 0/47/21/47 px respectively. Both portrait-to-landscape and reverse orientation changes were also exercised in the same running cave.

| Game | States at each viewport |
| --- | --- |
| Broadside | Empty and forty-voyage caves; empty hold; three-chest hold; forty-chest hold/keepsake reveal; reward reveal; unload; walkable public ship/harbour |
| Captain Calculus | Empty and 1,000,000-gold caves; empty hold; three-chest hold; twenty-chest hold; reward reveal; unload; delayed loading; scene-error fallback |

The large Calculus balance retains its 990,000-gold secured reserve plus a 10,000-coin loose pile. No bank balance or reward was capped. The [purchased ship variant](review/pirate-world-20261025/private-viewport-record.json) was additionally inspected at all three viewports with zero, four and forty pending chests, using its existing model/manifest. Its imported physical deck geometry checks also passed locally.

Representative retained captures:

| Experience | Broadside | Captain Calculus |
| --- | --- | --- |
| Narrow cargo/reward | [320px hold](review/pirate-world-20261025/broadside-pending-ship-narrow.jpg) | [320px hold](review/pirate-world-20261025/calculus-pending-ship-narrow.jpg) |
| Short landscape cave | [844×390 cave](review/pirate-world-20261025/broadside-empty-cave-landscape.jpg) | [844×390 cave](review/pirate-world-20261025/calculus-empty-cave-landscape.jpg) |
| Completed real unload | [1,000 gold banked](review/pirate-world-20261025/broadside-unload-complete.jpg) | [1,000 gold banked](review/pirate-world-20261025/calculus-unload-complete.jpg) |

## Interaction and visual findings

- Inspected framing, labels and navigation for clipping/overlap. The final matrix reported no enabled control smaller than 44×44 CSS pixels and no control outside its simulated safe rectangle. Fixed the under-height helm/inspection action and the empty-hold action's bottom safe-area placement.
- Completed real 1,000-coin browser unloads in both games and returned to cave exploration. In Calculus, cancelled a pour with Back, observed the chest still aboard, returned and completed it once. Scene telemetry showed one presentation scene after returning to exploration.
- Exercised forward walking and screen-right look in both shared caves; reviewed their rendered views after orientation changes. Also checked the purchased ship's screen-right input using the wrapped angular difference for its right-handed camera. The existing Babylon projection tests verify screen-right/up/forward/strafe directions in both handedness conventions and several headings; sailing camera/deck tests also pass.
- Faulted the shared chest asset request. Verified the error dialog focuses Back, Escape closes it, cargo stays aboard, and reopening retries the asset in the same session. Checked ship-details focus containment, Escape with focus return and outside-tap dismissal. The [supplemental interaction record](review/pirate-world-20261025/interaction-record.json) records these checks.
- Fixed the discovered Broadside Back bug: direct click-handler assignment passed a MouseEvent into `menu(preserveChart)`, leaving the hold/chart hidden. The affected Back controls now invoke navigation without an event argument, with regression tests.
- Inspected control/label contrast and inherited gold/parchment action colors. Representative opaque foreground/background ratios: new error text `#fff4db` on `#132a34` 13.64:1; error action `#17212a` on `#edc279` 9.78:1; cave text `#e0e9dc` on `#071923` 14.38:1; light control text `#fff0cf` on `#1b3947` 10.81:1; dark gold-action text `#173b3b` on `#e9bf73` 7.05:1. Ordinary text was reviewed against the 4.5:1 minimum and large text against 3:1; disabled controls are intentionally dimmed.
- Reviewed reduced-motion views and the full real physics path. DOM/native interruption, stale completion, exact 100/900/1,000-coin counts, ledger conservation, namespace isolation, storage refusal, listener removal and partial-scene cleanup have automated checks.

## Build evidence and limits

Heavy validation ran through `codex-home` on home-mini after storage recovery, with its checkout on `/Volumes/NO NAME/HomeProjects/home-mini/agent-workers/`. The final suite passed 420 tests (two purchased-asset tests skipped on the worker); TypeScript, the import boundary and the both-entry public browser build passed. Two private-model geometry tests were run locally because purchased ignored assets are not copied to the worker. Native Release packages use the local current Xcode/SDK and local purchased assets, with two compile jobs.

Both iPhone Release `.app` packages were built with signing disabled. Their web bundles must have equal runtime/shared-core/common-asset fingerprints, and `tools/verifyPiratePackages.mjs` checks every generated web file against the packaged copy and current source. The accompanying `pirate-world-build.json` identifies the exact source content even when built from an uncommitted checkout.

Full captures, matrix details, real-unload screenshots, private-ship screenshots, build/test logs and package comparison records are retained locally under `artifacts/pirate-world-20261025/`; native outputs are under `artifacts/pirate-world-native/`. The selected review images and viewport/interaction records above are committed for review.

Physical iPhone appearance/touch feel, actual lock/background audio behavior and long-session performance are unverified. Native app compilation and browser interruption tests do not establish those device behaviors. No installation, production deployment or App Store submission was performed. Existing installed apps require an update to receive the shared implementation.
