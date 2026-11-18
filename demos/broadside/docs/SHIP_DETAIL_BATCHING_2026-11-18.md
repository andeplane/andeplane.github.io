# Ship detail batching review — 18 November 2026

The review of `91f3fddd` found that its wheel, brass fittings and four deck
lanterns used 54 separate meshes, although the parts share four materials and
only two moving frames. These additions accounted for 48 avoidable draws.

`shipDetailBatch.ts` merges each material within its rigid parent frame. The
stationary helm base, turning wheel and fixed lanterns now use six meshes.
The wheel remains a child of its animated pivot; lantern lights select the
surviving meshes after merging. Triangles, materials, shadow-receiving flags,
lighting, controls and camera placement are retained. No geometry was removed
or visual quality reduced to obtain the saving.

This follows the explicitly active gameplay branch rather than incorporating
the unrelated Captain Reader merge. The maintained repository is
`andeplane/andeplane.github.io`, `demos/broadside/`; fetched `origin/main` had
advanced to `dc7b785`, while this requested review starts from the previously
reviewed `91f3fddd` commit on `codex/broadside-gameplay-cinematic`.

## Validation

- TypeScript and 21 focused tests across eight ship/deck/camera/chest files
  passed. The new regression covers per-material triangle positions under a
  moved and rotated ship/wheel, later parent motion, shadow flags and disposal.
- The independent reviewer compared the running result with an immutable
  `91f3fddd` archive. All 11,928 triangles in six material/parent-frame groups
  retained exact ordered local coordinates, with maximum error zero.
- Both deck lights include all six surviving detail meshes and no disposed
  mesh references. Materials, texture count, light count and total vertex
  count are unchanged.
- Actual steering changed heading from 0 to .289 and wheel rotation from .016
  to -.600 radians; the wheel followed the ship. Walk deck→Take helm and
  captain/deck orientation changes at 390, 320 and 844px passed with simulated
  phone safe areas. Before/after captures show the same wheel and lanterns.
- The production build passed. The independent reviewer fetched the actual
  manifest at `http://127.0.0.1:5199/` and verified source hash
  `a602a74d2d48b0c56cd4fa3ffd9388b76cb43a3c670f036eedba0de5bbc2517c`
  plus loaded `broadside-bNhQuAgs.js` and `broadside-_z7ndJQN.css`.
  Normal Play→Open world→Captain→Walk deck→Take helm passed without a QA
  badge or browser errors. Shared runtime and common-asset hashes are
  unchanged; packaging after commit updates the revision stamp only.
- `git diff --check` passed. This package has no formatter or lint script.
  The previous full suite is not repeated for this bounded construction-only
  change. No new detector run is needed because the earlier session already
  completed its one combined pass and this change adds no UI styling.

## Measured effect

The independent comparison uses 390×844 DPR1, public Black Pearl,
`seed=81723`, frozen free sailing, and 120 frames. These are desktop browser
CPU submission samples, not GPU timings or physical-phone benchmarks.

| Metric | Before `91f3fddd` | Batched |
| --- | ---: | ---: |
| Draws/frame | 385 | 337 |
| Scene meshes | 2,557 | 2,509 |
| Mean scene CPU ms | 3.132 | 2.910 |
| p95 scene CPU ms | 3.50 | 3.40 |
| FPS | 60 | 60 |

Draw calls fall 12.5%, bringing the enriched scene below the earlier
pre-redesign count of 339 without losing any detail. CPU timing varies;
these samples establish the observed saving for this fixture, not sustained
device performance, thermal behavior or battery life.

Evidence lives outside Git at
`/Users/anderhaf/Documents/Codex/2026-11-18/broadside-improvement-review/`,
including before/after captures, geometry comparisons and the independent
runtime acceptance record. No screenshots are committed. Physical-device
touch feel, WebKit GPU behavior and long-session memory remain unverified.
