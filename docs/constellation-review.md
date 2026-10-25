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
