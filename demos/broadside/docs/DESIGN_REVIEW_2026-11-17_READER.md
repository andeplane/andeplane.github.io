# Captain Reader gameplay review — 17 November 2026

The maintained implementation is `demos/broadside` in `andeplane/andeplane.github.io`, on the existing `codex/captain-reader` draft PR #123. The standalone prototype was left untouched. The branch was integrated with current main, including Calculus translations and button haptics; conflict resolution preserves the translated Calculus map and imports its extracted map CSS explicitly.

## Reading loop

The iOS app uses Apple's Speech framework with `requiresOnDeviceRecognition`, only when the selected locale supports on-device recognition. It accepts matching recognized words and sentences, including a fresh start after a false start. This is transcription matching, not a pronunciation or accent assessment. The guide now makes that distinction explicit. Real child speech needs acoustic acceptance testing.

The prompt now owns the screen. Back, the pack and level remain in the header, with a visible completed-reading trail. Live partial recognition underlines the complete words heard in order, without changing the reward rules or saving transcripts. Wrong, incomplete, stale and duplicate speech cannot award another reading. Correct speech still earns credit and advances automatically, including story answers.

Optional Pause and Hear an example controls support a stuck reader without adding required taps to the reading loop. Examples stop recognition until playback finishes, and assisted practice remains marked as helped. Pausing and leaving a level no longer pauses the next resumed level accidentally. Unmatched final speech shows a gentle retry message before automatic listening resumes. Permission and unavailable states explain recovery and expose Try listening again. Recovery refreshes capabilities. Repeated recognition interruptions use bounded backoff.

Short landscape permission text, small-phone story controls and the 320px reward actions were corrected during visual review. The story can scroll independently while its question, spoken choices, feedback and Pause remain visible. The reward action is labelled Next level. Programmatic heading focus no longer draws an accidental decorative frame.

## Review performed

Headless `agent-browser` screenshots and measurements are in ignored `artifacts/reader-gameplay/`, with `layout.json`, `flow.json` and `menus.json`. No new screenshots are committed.

- 390×844, 320×568 and 568×320, with simulated top 24px, bottom 20px and left/right 12px safe areas: English words, Norwegian long words, sentences, Norwegian stories, partial recognition, pause, unmatched speech and permission recovery (21 measured cases plus partial-reading captures).
- At all three sizes, ten actual UI speech callbacks completed a word level, saved exactly one 100-gold chest and opened Next level. A real corpus story advanced sentence by sentence, showed its question, accepted the spoken answer and continued to the next story. Pause/resume was exercised in comprehension. The six measured completion/comprehension states have no offscreen action buttons or document horizontal overflow; measured action targets are at least 44×44 CSS pixels.
- Home, million-level saved trails and Settings; shared Calculus difficulty maps and level trails at those three sizes and 1280×900 (20 cases). Settings reset dismissal by Escape and outside click returns focus to Reset. Navigation Back/Continue and orientation changes were exercised.
- The changed reading colors retain the parchment/teal identity. Text contrast checks include body ink on the parchment endpoints, heard-word ink on the active sentence, light status text and support-button text. The Impeccable mechanical scan reported no findings; subsequent small-screen fixes were inspected in rendered screenshots.

The recognition bridge in browser captures is a test fixture, not microphone evidence. Browser practice remains explicitly manual with Next. No audio recording or transcript was retained.

## Validation and remaining acceptance

Cloud VM job `20261117-170857-71489-4282` completed with exit 0: pirate ownership boundary check, TypeScript, 480 tests passing (two ignored purchased-asset tests skipped), coverage above all configured thresholds, production web build and Reader iOS web bundle. The home mini refused a new job due to low free space; home-m1 was unreachable. The final focused local pass covers 31 reading/navigation/haptics tests and TypeScript. No separate formatter or linter is configured; `git diff --check` passes.

Physical iPhone microphone recognition, child/dialect accuracy, first-time permission dialogs, audio-route changes, VoiceOver and physical touch/performance remain unverified. This update does not install an iPhone app, submit to the App Store, merge the draft or deploy production. Historical installed build records in earlier reviews do not validate this update.

Final production web and Reader iOS web bundles were retrieved from the VM and independently matched against local runtime source, shared source and treasure assets; native Speech code, permissions and icon hashes also match. Runtime source fingerprint: `85c307b4d66844ba9d83c9b8d2860f764b32cb3fa75305c2afbcf1311e57c188`. The VM's revision field is `unknown` because this worktree was synced without its Mac-only Git pointer; content hashes establish the match. This is web-package verification, not an Xcode archive or device installation.

Measured contrast ratios: paper ink 8.45:1, heard words 4.93:1, status text 8.03:1, support-button text 8.92:1, secondary text 6.06:1. Raw measurements are in `artifacts/reader-gameplay/contrast.json`.
