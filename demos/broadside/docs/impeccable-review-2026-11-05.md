# Impeccable review: Broadside and Captain Calculus

Reviewed 5 November 2026 using [Impeccable](https://github.com/pbakaus/impeccable), commit `c8891a9ae865d6ee311836ae5199bfce0fe115b1` (skill 4.8.0). Used its audit, adapt, harden and polish guidance and mechanical detector. This is a scoped refinement of the existing pirate design, not a replacement visual system or a claim of full game acceptance.

## Findings and changes

- **P1: Insufficient home text contrast.** The Play subtitle measured 4.17:1 against the darker gold gradient endpoint; the footer measured 3.54:1 against the brightest home background. Darkened the subtitle to `#4c3d24` (5.00:1 minimum) and lightened the footer to `#b9cdca` (5.26:1 minimum). Final rendered scans report no low-contrast findings on either home screen.
- **P2: Small supporting text.** Home descriptions and Play subtitles fell to 11px on small phones, treasure detail and the footer to 10px. Descriptions, Play detail, treasure balances and secondary actions now use 14px; supporting treasure detail and the footer use 12px. Removed the redundant 8–10px genre label above the title.
- **P2: Undersized secondary target.** “Choose another level” was 40px tall. It now has a 44px minimum. All measured home actions are at least 44 by 44 CSS pixels.
- **P2: Incomplete side safe-area handling.** Side insets were applied only to the short-landscape breakpoint. Home padding now includes both side safe areas at every breakpoint, with a content gutter beyond the inset. Adjusted the Broadside short-landscape top reservation so its footer clears the bottom safe area in the reviewed fresh/saved states.
- **P2: Long content resilience.** Both games now share wrapping for treasure balances/details and Play detail, and the Play arrow cannot shrink when text expands.

The existing typefaces, colors, ship artwork, navigation hierarchy, gold reward rules, saves and gameplay are preserved. No assets, runtime dependencies, global skills or automatic hooks were installed in the games.

## Browser evidence

All screenshots were captured with an isolated **headless agent-browser Chromium** session. The matrix includes both home screens with empty saves and large saves (Captain Calculus: 20 chests, 1,000,000 banked gold and 120 cleared levels; Broadside: all 36 levels cleared).

| Viewport | Simulated safe areas: top / bottom / left / right | Coverage |
| --- | --- | --- |
| 390 × 844 | 62 / 34 / 0 / 0 | Both games, empty and saved |
| 320 × 568 | 62 / 34 / 0 / 0 | Both games, empty and saved |
| 667 × 375 | 0 / 21 / 62 / 62 | Both games, empty and saved |
| 768 × 1024 | 62 / 34 / 0 / 0 | Both games, empty and saved |
| 1280 × 800 | 0 / 21 / 62 / 62 | Both games, empty and saved |

All 20 cases have home actions inside the safe viewport, no undersized home buttons, and no action/text overlap observed in the screenshots. Decorative tablet artwork extends beyond its grid and is intentionally clipped by the home surface; it does not expose horizontal page scrolling.

Additional checks:

- Captain Calculus Continue state at 320 × 568: 44px “Choose another level”; the page deliberately scrolls for the longer state. Scrolling moves the footer action fully above the bottom safe area. This was a browser scroll/layout check, not physical touch verification.
- Captain Calculus operator selection, question/keypad, empty ship, cave and instructions at all three phone sizes. Opened a hint at 320px and used Escape back to the level map.
- Broadside world selection, settings and privacy at all three phone sizes; Escape dismisses privacy and Back returns to the main menu.
- Keyboard Tab gives the home Play button a visible outline; Enter opens operator selection; Escape returns home.
- Privacy opens with focus on Close and restores focus to Privacy & support after Escape.
- Simulated Captain Calculus scene-load failure explains that chests are safe; Back returns to the home menu.
- Inspected the final public build's two entrypoints in the browser, separately from the development server. No page errors were reported in that packaged smoke check.

Screenshots and machine-readable results are kept outside Git at `/Users/anderhaf/.codex/artifacts/pirate-impeccable-20261105/`. PR images are uploaded as GitHub attachments.

## Detector interpretation

The final rendered scan produced 14 design-pattern findings: four warnings and ten advisories, with **zero low-contrast findings**. Reviewed rather than automatically removing them:

- The “gray on color” warnings describe the existing lightly teal text, which passes the measured contrast bound.
- SVG illustration and hard-shadow advisories describe the established ship artwork and raised gold button.
- Radial wash, repeated-gradient, organic-clip and grid findings include existing art and styles from underlying/hidden game surfaces. These do not establish visible home layout defects.

The detector is evidence for particular rules, not a quality score or proof of accessibility. No ignores were added to conceal findings. The earlier axe home check had no violations but could not establish gradient contrast, so contrast was checked separately.

## Source and build verification

Checks ran in an isolated `home-mini` checkout using the project's npm lockfile:

- `npm run check`: typecheck, **420 tests passed / 2 imported-private-asset tests skipped**, coverage thresholds passed (98.18% statements/lines, 97.54% branches, 98.25% functions), and Vite production build.
- After the final contrast/layout correction, rebuilt `build:ios`, `build:calculus:ios`, and the public Vite package successfully. These are web resources for native packaging, not signed app/device validation.
- Matched SHA-256 of all four changed source files between the local reviewed source and the final remote package checkout. Retrieved those packages for the packaged browser smoke check.
- No formatter or lint command/config is defined for this game. Preserved its existing formatting and ran `git diff --check`.

## Explicit gaps

Physical iPhone/iPad behavior, Safari/WKWebView, VoiceOver, touch feel, synthesized touch/pan gestures, orientation changes during an active run, and mobile performance profiling were not verified. The viewport matrix reloads between orientations. Live Broadside sailing/deck/first-person control directions, result/reward animations, populated cave pours, and a full gameplay playthrough were not reviewed in this pass. Those controls/scenes are outside the home component changes and must not be described as verified by this work. No deployment, native signing, device installation or App Store action was performed.
