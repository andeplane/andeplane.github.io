# Constellation review — 25 October 2026

## Reviewed experience

The standalone story route, its six narrative chapters, opening, playback,
ending, family editor, validation feedback, audio controls, exported SVG,
project-card navigation, and direct-load HTML shell are in scope. The app uses
ordinary scrolling when content exceeds a short viewport. No game UI or shared
game styling changed.

## Browser checks performed

Using the Codex in-app browser against the local Vite server:

- Desktop at the default viewport and 1280 × 900: opening, chapter navigation,
  silent play/pause, restart, each chapter's sky, scrub to the exact ending.
- Phone portrait at 390 × 844: narrative, sky, labels, timeline, editor,
  long names, eight people, invalid ending age, save and persistence on reload.
- Narrow 320 × 740 portrait: final sky, long names, scrollable editor, minimum
  one-person sky, disabled removal of the last person, eight-person add limit.
- Short 844 × 390 landscape: story, controls, scrollable editor and close
  button. Orientation changes preserved story/editor state.
- Simulated nonzero phone safe areas: temporary review-only padding of 44 px
  top, 34 px bottom, and 24 px left/right at 390 × 844. No horizontal overflow;
  padding override removed after review. Shipped CSS uses `env(safe-area-inset-*)`.
- Native dialog Escape and backdrop dismissal; focus returned to “Make it yours”.
- Generated silent 8-second WAV: duration adapted to 8 seconds; playback,
  mute, 2× speed, natural completion at progress 1, and seek to chapter 4 at
  audio time 3.36 seconds matched progress 0.42. No real song was created.
- SVG download completed. Export has embedded gradients, labels, a dark
  background, and explicit 800 × 800 dimensions.
- No horizontal overflow at the checked phone/landscape widths. No captured
  browser warnings or errors during the final chapter pass.

Review fixes: enlarge star labels; avoid label collisions and wrap long names;
compact the phone intro after playback begins; preserve input padding beside
color dots; provide an accessible name for the phone song icon; use 44 px editor
remove controls and return focus from the dialog.

A final computed-size audit caught a 24 px timeline hit area and a small credit
link. The timeline keeps its thin track inside a 44 px input; transparent padding
enlarges the credit link. Both have at least 44 px targets, and their dimensions and timeline keyboard interaction were
rechecked after the fix.

Representative screenshots were saved locally under `/tmp/constellation-review/`.
This is simulated viewport evidence, not physical iPhone/Safari validation.

## Automated checks and limits

- First `home-mini` run: 5 constellation tests passed, TypeScript passed, Vite
  production site bundle passed; process exit 0.
- Full `npm run build` on `home-mini`: constellation tests passed, existing
  demo tests/builds progressed, then staging an existing tidal-locking texture
  directory failed with ENOSPC. Process exit 1; this is not a full-build pass.
- Complete repository CI and Pages deployment are checked through GitHub before
  delivery, with their concrete result reported in the chat.

Not manually verified: physical phone safe areas/touch feel, real-song codecs
other than the WAV fixture, storage-quota failure, native fullscreen across
browsers, assistive-technology speech, and runtime reduced-motion emulation.
Reduced-motion copy styling and storage/audio failure handling are implemented
but do not count as browser-tested claims.

## Expanded living-story revision

The current version is 48 seconds and eight chapters, with no SVG age axis.
It adds a childhood friend (5–28, then fading), college friends (18–35, then
fading), the son's wife, and two grandchildren. The narrator and wife become
stars; four younger relatives retain their paths in the final sky.

Revised checks performed:

- Natural silent playback completed at 48 seconds and progress 1. Desktop final
  composition was visually inspected at 1280 × 900; no browser errors/warnings.
- 390 px and 320 px portrait: transient friends, next-generation ending,
  revised chapter navigation, and long-name wrapping. No full age scale remains.
- A maximum sixteen-person saved sky was inspected at 320 px. Adding a
  seventeenth was disabled; labels were spaced without horizontal overflow.
- Ending selector changed a childhood friend into a remembered star. Reset
  restored fading; after reload the friend was absent by the new-life chapter,
  while college friends still appeared. Exact legacy sample upgrade and custom
  name/age preservation are covered by tests.
- Revised editor and native ending selectors inspected in short 844 × 390
  landscape. Local WAV fixture remained synchronized: Love at progress 0.24
  sought to 1.92 seconds of an eight-second file.
- Nine focused model tests passed locally and on home-m1. The first revised
  site bundle, TypeScript, and HTML-shell generation passed on home-m1 (exit 0).
  Later rendering refinements are included in the subsequent repository CI run.
- Computed interactive targets were audited; the timeline is 44 px high and
  the credit link has transparent padding to meet the same target size.

The earlier physical-device and codec limitations still apply. The current
version's final CI and deployment outcomes are reported in the chat.
