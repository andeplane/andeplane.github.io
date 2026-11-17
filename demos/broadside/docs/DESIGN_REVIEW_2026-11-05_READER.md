# Captain Reader review — 5 November 2026

The reported problems were menu/selection polish and device reading that still needed Next. Device reading now uses Apple's existing on-device Speech framework to accept correct live speech, award the existing gold once, show a short reward, and advance automatically. There are no answer, Record, Finish or Next buttons during native reading. Story comprehension also accepts the spoken answer. Back remains available to leave capture. Browser practice retains manual Next and examples.

Duplicate/final results after acceptance, old prompt tokens, background results and results after navigation cannot award or cancel a completed answer. Backgrounding suspends pending advancement; foreground return resumes it. Unmatched final results and recognition interruptions restart listening. Native sessions have a 45-second watchdog to recover an expired or silent recognition session. Permission/unavailable states explain the problem and do not offer manual device credit. Voice audio and transcripts remain unsaved.

Menus retain the pirate artwork, fonts and palette. Language selection has two direct choices, packs have a scrolling quick selector and a separate recenter control, and Reader buttons have consistent press/focus states. The reading status is shown once. Short landscape uses a compact home layout; reading keeps its text scrollable and feedback visible. Story questions remain outside the scrolling story so the question and spoken choices stay readable.

## Review performed

Headless agent-browser captures and DOM measurements cover 390×844, 320×568 and 568×320 with simulated top 24px, bottom 20px and left/right 12px safe areas. The 30-case matrix includes home, languages, Pack 1, Pack 10, ordinary and million-level trails, words, sentences, paragraphs and Settings. Later final captures cover corrected home/pack layouts in both languages and all three sizes. No document horizontal overflow was found. Fully visible measured touch targets were at least 44×44 CSS pixels; offscreen map pins and the horizontal pack selector remain scroll/pan content.

Review caught and fixed a recenter button covering a narrow pack card, the home menu overflowing short landscape, a clipped story question and overlapping short-landscape answer feedback. Final comprehension was inspected at all three sizes after orientation changes. Long story text scrolls independently. Navigation through the quick selector and Back was exercised, as were reset-dialog Escape/outside dismissal and focus return. The Settings axe audit reported zero violations; gradient backgrounds require manual contrast review. Representative reading ink/parchment, parchment button ink, light status text and pack selector combinations exceed 4.5:1 at their least contrasting solid color endpoint. Focus and active states were inspected in source and exercised in the browser.

Mocked native events drove ten actual UI answers to exactly one 100-gold cargo chest. Incorrect utterances did not advance. A real corpus story reached comprehension; its spoken correct answer advanced without a button. Permission-error and reward screenshots were captured. These are simulated recognition events, not evidence of microphone accuracy. The automated native regression also covers duplicate/stale callbacks, background capture cancellation, suspended reward transitions, foreground recovery, interruption recovery, navigation cancellation and denied permission.

Source changes are scoped to Reader; no shared Broadside/Calculus menu, scene, controls or ledger source changed. Existing shared gameplay/treasure tests passed. No new physical first-person-control behavior is claimed.

Screenshots and raw measurements are in ignored `artifacts/reader-hands-free/`; screenshots are not committed.

## Validation and limits

The isolated home-mini job `20261105-170200-9a2bb1c5` passed 437 tests, with two purchased-asset tests skipped because ignored assets are not copied to the worker. Final affected-source validation passed all 14 reading tests, typecheck and the Reader iOS web build. The Impeccable mechanical scan reported no findings. This project has no separate formatter/linter scripts; source whitespace was checked with `git diff --check`.

Real child speech, acoustic/dialect accuracy, first-time iOS permission interaction, physical touch, VoiceOver and audio-route changes remain unverified. System microphone/speech permission prompts still require the parent's initial approval. No App Store submission or public release is part of this update.

Signed development build `2026110501` passed Xcode validation using two build jobs on the Mac with the required SDK/signing identity. The package verifier matched all 92 generated web files, native speech source, permissions and icon metadata against the final source (runtime fingerprint `228a69d97c8189fe2f036deb458c6dc5e9c4a1e601c675ac1056c74e9ce1478c`). The installed bundle was updated and launched successfully on the connected iPhone 18 Pro. Installation/launch does not establish visual or acoustic acceptance on the physical phone. A headless preview of the packaged web assets also exercised Play → English → Pack 1 → reading; its native-bridge simulation showed the reading prompt without answer buttons.

Measured solid color endpoint contrast: reading paper 8.45:1; primary button 6.24:1; status text 7.88:1; spoken choices 10.35:1; selected pack 7.89:1; secondary home text 5.15:1. These measurements supplement the gradient audit's incomplete results.
