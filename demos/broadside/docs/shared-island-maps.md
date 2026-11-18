# Pirate family map implementation plan

1. Build a local chart library with island artwork, world choices, and shore labels. Use stable island identities across sessions and upright text independent of the route geometry.
2. Integrate Broadside’s world selection and ten-stop routes first. Preserve ship travel anchors, world access, stars and relic progression.
3. Bind Calculus operations and Reader languages to the shared world picker. Use a common bounded island chart for learning packs and a common extendable trail for levels. Keep save formats, rewards, localisation and navigation in the games.
4. Walk each normal world → pack (where applicable) → level route, inspect portrait, narrow portrait and landscape, and exercise map boundaries, current/locked/completed states and Back. Build the iOS apps from the reviewed source.

## Implementation

The shared UI lives in `src/ui/islandChart.ts`, `difficultyMap.ts`, `expeditionTrail.ts` and `mapPan.ts`. World choices take a game-owned action, ID, illustration, accessible name, optional subtitle, progress and disabled state. Level markers use a separate illustration and number so viewport aspect ratio cannot deform the label. Twelve transparent WebP shore illustrations live in `public/assets/map/islands/`. The water texture comes from the existing nautical chart.

Broadside supplies world and voyage data through `voyageHud.ts` and keeps its ship travel anchors. Calculus supplies operations, number ranges and rewards from `math/main.ts`. Reader supplies languages, reading packs and read-aloud progress from `reading/main.ts`. Both learning games use bounded pack charts and windowed trails. Pack and level cameras are retained while navigating during a session. Choosing the compass returns to the current island.

## Review and packaging, 18 November 2026

- Walked all three routes in the headless browser at 402 × 874, 320 × 568 and 844 × 390 with simulated safe insets. Captured worlds, packs where applicable, and levels. Exercised finite pan extremes, zoom and recenter in all three games, and extended both learning trails from 36 to 60 nodes.
- Walked all three routes in WKWebView on the iPhone 18 Pro simulator. Reviewed world selection, learning pack selection, the level route and landscape rotation. Calculus continued into a saved question. Browser and native screenshots are under the ignored `artifacts/family-island-charts/` directory.
- The full Linux run passed 480 tests. Its two optional paid-ship geometry tests also passed separately with the private assets available. In a later local run, the Reader listening test hit its five-second timeout during concurrent Xcode builds. It passed when rerun alone with the original timeout.
- Physical iPhone inventory confirmed all three apps at build 2026111805. Verified packaged HTML, JavaScript, CSS, provenance and island images against their production build output. Visual and gesture evidence comes from browser and simulator.
- Maintained source was based on `dc7b785`. The physical Broadside build also included the committed cinematic changes through `550f4bd` and the private ship assets. Its world selections respect the feature branch’s World 1 completion gate. The integration used a separate source snapshot and did not include concurrent uncommitted cabin work.
