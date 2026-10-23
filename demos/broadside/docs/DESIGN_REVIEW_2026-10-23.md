# Pirate games design review — 2026-10-23

This review followed the reported overlapping sailing HUD, cave navigation collisions, accidental ship-popup activation, unreadable popup copy, and reversed first-person ship controls. Repository guidance now requires a design review in `AGENTS.md`.

## Findings corrected

- Separated the live sailing action row from health, mission, weather and guidance. Removed branding from live gameplay and redundant menu headers. Pause hides and makes underlying live actions inert.
- Reserved one safe-area row for Back and destination actions; cave/ship titles sit below it. Movement, Jump, hints, rewards and landscape actions stay within the phone's protected areas.
- Separated Ship navigation from numbered level targets. Animated chart boats are noninteractive decorations. Ship details has a visible Close action, outside-tap and Escape dismissal, focus trapping and focus return.
- Replaced inherited grey-on-parchment popup copy (1.15:1 contrast) with dark panels and light copy (12.17:1). Added a dark backing for reward/loss text over the variable 3D scene.
- Made the short landscape regional chart two rows of five 44px targets. Short portrait opens at the current level. Landscape world cards have a separate Cave/Open world footer row.
- Improved Captain Calculus question contrast and 44px help targets. Short phones use a compact calculator layout so the keypad and Check Answer fit without scrolling. Completion decoration yields space to the primary action.
- Preserved math Ship/Cave Back origins, disabled reward navigation until ready, reserved space for save errors, and compacted large header balances with full accessible labels.
- Fixed a ship-load error handler that referenced removed home markup. Both games' treasure-hold destination now uses the shared hold; boarding the walkable ship remains a separate action.
- Corrected the private ship's right-handed camera mismatch: horizontal look and strafe match screen direction; existing cave, harbour and sailing-deck behavior is preserved.

## Review coverage and evidence

The complete declared screen inventory was inspected in source. Running browser captures used **402×874**, **320×568**, and **844×390**, with simulated portrait safe areas of top 62px/bottom 34px and landscape side areas of 62px/bottom 21px.

| Game | Running screen types inspected |
| --- | --- |
| Broadside | Home, settings, world chart, regional levels, ship dialog, navigation gameplay, cannon gameplay, storm gameplay, open sea, captain/deck controls, fishing and cancel, pause, full sea chart, ship walking, cave walking, reward reveal/results, loss, hold and unloading |
| Captain Calculus | Home/resume, operation worlds, difficulty map, endless map, question/keypad, hints and answer feedback, guide, completion, ship/reward, cave and unloading |

Additional interaction checks: outside tap closes Ship details without selecting an underlying level; Escape closes it and retains the chart; dragging maps does not open a level; recenter and level taps work; rightward ship look is correct in the running renderer. Screen-space camera regressions cover both coordinate systems at four headings. Navigation, unavailable rewards, storage failure and large-balance states have focused DOM tests.

Evidence PNGs and DOM geometry are retained locally in the ignored `artifacts/design-review-20261023/` directory. Contact sheets are review aids; individual full-resolution captures are the evidence. Loading captures are distinct from steady states. `?still=true` freezes sailing simulation only in a development QA fixture so gameplay HUDs can be reviewed without drifting into an island; it does not freeze camera or walking controls.

Full remote suite: **375 passed, 1 skipped**, plus typecheck on home-m1 after home-mini's SSH connection failed. Subsequent focused input, navigation, contrast and HUD checks: **44 passed**, plus typecheck. Later changes were scoped visual layout corrections, reviewed in the running browser.

## Proof limits

Browser sizes, source inspection and camera projection tests do not establish physical iPhone touch feel. Every transient fishing/physics phase and every possible saved-world layout was not replayed manually; their shared layouts and state logic were inspected, with representative live states and relevant automated tests. Native installation and launch results are reported separately from this design review.
