# Captain Calculus language review — 17 November 2026

Ported to the maintained `andeplane/andeplane.github.io` source at `67d35a3`, preserving first-try rewards, per-operator banks, cargo, unloading, shared rendering, and walking controls. The standalone prototype was not copied over the current game.

English, Norwegian Bokmål, Swedish, Danish, Finnish, German, Spanish and French are available. Automatic mode uses the first supported browser/device language, falling back to English. Norwegian `no`/`nb`/`nn` use Bokmål. A native selector in How to play (also reachable through the header language button) saves an override separately from game progress. Language changes preserve the active question, typed answer, voyage and reward state. Shared navigation/home helpers retain English defaults for Broadside. Fictional world/chapter names remain proper names; the existing privacy/support policy stays English and is labeled as such.

## Evidence

Headless agent-browser review: 89 combinations, covering all eight languages at 320×568 for home, settings, operators, difficulty map, level trail, question and hint. French additionally covers 390×844, 320×568 and 844×390 for home, settings, question, completion, ship, reward, walking cave, unloading, and simulated ship/cave/unloading load errors. Reviewed the separate Broadside entrypoint after changes to shared home/back components.

Simulated top/bottom safe areas of 24/21px in portrait and left/right/bottom 44/44/21px in landscape, applied to both the shared `--pirate-safe-*` variables and cave aliases. Screen rotation, map navigation, answer entry, free hints, Back, language selection, saved override on reload, and selector focus were exercised. DOM scans found no page horizontal overflow or enabled controls below 44×44px. Translated clear labels overflowed narrow keypad columns; the visible calculator key now uses C with a translated accessible name/title. An opaque map intro prevents chapter text from showing through it. German question/hint axe audit reported zero violations, with gradient contrast items requiring manual review; existing contrast tests also pass.

Screenshots and raw reports are outside Git in `/Users/anderhaf/Documents/Codex/2026-11-17/captain-calculus-languages/maintained-port/`; representative images are attached to the PR. Screenshots are not committed.

## Validation

- Full app check on the existing cloud VM: 458 tests passed, 2 existing imported-asset tests skipped, coverage thresholds passed, TypeScript and production build passed, shared-engine boundary passed. Job `/home/anderhaf/.cloud-ci/jobs/20261117-162341-73256-30534` (exit 0).
- After the final difficulty-map label correction: TypeScript, 47 focused locale/navigation/trail tests, and Vite production build passed. Job `/home/anderhaf/.cloud-ci/jobs/20261117-162605-79208-593` (exit 0). Reviewed source hashes match the VM copy. Final Calculus assets: `calculus-xUqefhpO.js`, `calculus-CwYFN5Ee.css`.
- Actual production package copied back and served locally for reload, Norwegian selection, map navigation and borrowing-hint verification. No formatter/linter command exists in this package; whitespace checks pass. The Impeccable detector reported no findings.

Physical iPhone/Android behavior, native-speaker proofreading, screen-reader speech, and physical touch/pinch feel remain unverified. The first-person camera implementation was unchanged; its existing handedness/movement tests passed in the full suite. This is a PR, not a deployment or phone installation.
