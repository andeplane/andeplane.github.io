# Island, water and chest correction review — 18 November 2026

This follows the user's report that the chest flickered and the islands and
water still fell short of the supplied video. The maintained source is
`andeplane/andeplane.github.io/demos/broadside`, on the existing reviewed
`codex/broadside-gameplay-cinematic` branch from `b5d5330`. The unrelated
Captain Reader merge on `origin/main` was not folded into this active work.
The chest repair is kept in its own commit, `76decf3`, separately from the
island/water refinement.

## Changes and review iterations

- The chest's upper gold rim previously shared the timber's top depth, while
  lid straps competed with the curved wood surface. The fix separates those
  surfaces, makes corner bars meet rather than overlap and preserves the
  common lid hinge. It changes presentation geometry only. A regression checks
  cap clearance and lid-band separation through closed/open poses.
- Islands now have layered, shaded fronds and ground planting, clearer
  vegetation groupings and improved rock/sand surface treatment. The review
  requested a second pass rather than accepting the initial static result.
  Existing island definitions, route geometry and gameplay modules are unchanged.
- The water now reveals actual submerged terrain and reef heads through a
  bounded color pass, with optical tint, absorption, caustics, broken shore
  wash and restrained detail across the deep water. The first water pass was
  rejected. A later muted-gray shelf was corrected by changing two optical
  color expressions. Translated hold water was checked separately and skips
  the seafloor pass when there is no island list.

Independent visual review accepted the final island/water view and the
truthfully labeled comparison sheet. This is a concrete refinement of the
running game, not visual parity with the generated cinematic reference.

## Temporal and browser checks

Natural before/after chest recordings were captured in both Broadside and
Captain Calculus at 390×844. Broadside's opening-to-settled comparison spans
9.667 seconds before and 10.334 seconds after. Review found no coarse
alternating wood/gold flecks after the fix. A fixed-camera comparison was
unchanged both before and after; it isolates camera motion and is not, by
itself, proof of the fix.

The reduced-motion control held its camera exactly at `[0,4.05,-5.4]` over 180
rendered frames. Across 51 decoded corner frames, mean adjacent RGB change was
0.0355, with no pixels above mean RGB change 10. The remaining signal was
consistent with lossy encoding. Safe-area layouts at 320 and 844px and actual
Next level→play navigation passed. Independent review closed the reported
coplanar rim/lid issue within this browser scope.

The final canonical before/after views use
`/?qa=0&island=3&preview=island&still=true&safe=44,0,34,0`, 390×844 DPR1,
camera `[6.5,63.6,23.8]`, seed 4100. BEFORE was freshly captured from an
immutable `b5d5330` archive on port 5209. AFTER uses final source fingerprint
`f510731ae707f5dd4b17bd2d047c9dc14c5cec50f7c3e6b3fd0b6b1907bf4fbb`.
The generated video frame is labeled as a different-scene visual target.

Both translated hold-water hosts were checked at water Y=-3: `waterLevel=-3`,
`seabedReady=0`, no active render target, one scene, ready shader and no page
or compilation errors. WebGL1 and WebGL2 shaders were ready. The exact final
production manifest and loaded Broadside script/stylesheet matched the
reviewed source. Normal Broadside captain/deck/chart navigation and Calculus
empty hold/Back passed without page errors. The final full reveal recording
is `final-broadside-opening390.webm`, 9.734 seconds/146 frames at 390×844 and
15 FPS; its MP4 is a viewing copy, with the original retained as evidence.

## Automated checks and package

The full cloud check passed for candidate 1, source
`cc57c6f5567c9078c54db24236aff312af7e5873070bdf78a441a1bafa122c8e`:
77 test files passed, one skipped; 469 tests passed, two optional purchased-
model tests skipped. TypeScript, the 62-module shared-library boundary and
production build passed. Coverage was 98.37% statements/lines, 97.61% branches
and 98.68% functions. The actual exit status was zero at
`/home/anderhaf/.cloud-ci/jobs/20261118-102810-29958-23030` on the existing
cloud worker.

After that run, exactly two GLSL optical-color lines changed in `water.ts`.
The final source passed TypeScript and the exact local production build;
the final source fingerprint matched the independent runtime fingerprint.
The full unchanged suite was not repeated for that bounded tint correction.
`git diff --check` passed. This package has no format or lint script.

Production preview: `http://127.0.0.1:5199/`. Matched development scene:
`http://127.0.0.1:5198/?qa=0&island=3&preview=island&still=true&safe=44,0,34,0`.
Production ignores QA parameters. Source/shared/asset hashes are verified
against the built bundle; post-commit packaging updates only its revision stamp.

## Cost and evidence

The final canonical scene measured approximately 239.6 draws/frame, 2.005ms
mean browser CPU submission, 2.30ms p95 and 59.9 FPS. Its immutable before
sample was about 226.5 draws, 1.785ms mean and 2.0ms p95. The seafloor target
was 355×768 with 27 restricted entries and no disposed references. These are
desktop browser samples for this scene, not physical-phone GPU benchmarks.

Evidence is outside Git at
`/Users/anderhaf/Documents/Codex/2026-11-18/broadside-temporal-review/`:

- `reference-before-after-island-water.png` and `comparison-manifest.json`
- `final-comparison-before-b5d5330-390.png`, `final-comparison-after-390.png`
- Natural chest videos, fixed/reduced-motion controls and corner strips
- `candidate-1-cloud-check.log`, `candidate-2-production-check.log`,
  candidate manifests and `final-optical-delta.diff`

The sheet adds only labels/layout and proportional fitting of the reference;
live captures retain native pixels. No crop, image retouching or paid asset
generation was used, and no screenshots are committed. Physical devices,
Safari/WKWebView GPU behavior, long-session thermal/memory behavior and the
unavailable purchased ship remain unverified. No native installation or
deployment is part of this delivery.
