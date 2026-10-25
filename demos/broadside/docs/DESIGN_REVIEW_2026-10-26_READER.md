# Captain Reader design and acceptance review — 26 October 2026

## Result and scope

Captain Reader / Kaptein Leselyst adds two reading worlds, ten packs each, independent saved progress and shared pirate treasure presentation. The first detached-island prototype and inherited arithmetic icon were rejected. The delivered design uses Captain Calculus's actual difficulty-map component, common menu chrome, home treatment and endless level trail. Reader starts each language selection at Pack 1. Small flag markers sit on a larger pannable northern-Europe chart.

The ship, cave, chest animation, one-coin-per-gold pouring, controls and asset ownership remain in `src/shared/pirate-world`. The sole controller correction delays ship readiness until the chest asset is ready; a regression test covers this. Existing Broadside and Calculus ledgers are unchanged. Reader has a separate adapter and save. The common trail's cleared/locked pin backgrounds were darkened for readable contrast.

## Reviewed screens and states

Browser review used the running Vite source. The recorded Reader matrix covers 42 screen/viewport combinations: home, language chart, first and tenth pack, ordinary and million-level trail, short and long words, sentences, long paragraphs, settings and simulated listening/checking/retry. Viewports were 390×844, 320×568 and 844×390, with simulated top 24px, bottom 20px and side 12px safe areas. Actual viewport dimensions were asserted. No page-level horizontal overflow was found; header targets were at least 44px and did not overlap.

Additional final checks covered normal Play → English → Pack 1 outside QA fixtures; portrait-to-landscape language-map resizing (both flags remained visible with approximately 60×61px targets); a Norwegian Pack 10 paragraph at 820×1180; and the cave's disabled/explanatory inspect action when no treasure is nearby. Paragraphs scroll to their active sentence. Representative screenshots are in [reader-review](reader-review/).

The Calculus comparison included its actual Addition world map, plus operators, difficulty map, level trail, live question and settings at the three phone sizes (15 matrix cases). Broadside home, ship, cave and Back navigation were opened and inspected at 390px. The full Broadside sailing/combat UI was not re-reviewed at every size; no sailing layout was changed.

Adult-confirmation dialogs were tested for Escape and outside-tap dismissal, with focus returning to the invoking button. Ten actual adult-confirmation UI actions completed a test voyage and created its 100-gold chest. This is confirmation-flow evidence, not evidence of successful child speech recognition. Back navigation, ordinary resume and cancellation were exercised during screen review; pure tests cover stale/duplicate identity handling and save recovery.

The real shared renderer poured a 1,000-gold test chest: ship balance reached zero, cave balance reached 1,000, cargo emptied and the scene reported 1,000 coins in the destination bank. Cave mouse drag right turned the view right; drag up looked up. Movement-pad forward/strafe deltas matched the rendered heading. These checks used browser mouse input, not physical phone touch.

Measured contrast examples: reading text 8.45:1; Norwegian/English map-label combinations 8.13:1 and 7.67:1. Cleared trail pin gradient endpoints are at least 4.95:1 and locked endpoints at least 5.63:1. The prior cleared background measured 2.06:1 and was corrected.

## Automated and packaged validation

The home-mini worker ran typecheck, the pirate-boundary guard, all tests, all three native web builds and the public three-entry browser build. Result: **433 tests passed, two skipped** (74 passing test files, one skipped). The skipped tests require ignored purchased ship geometry, which is not copied to the worker. Worker job: `20261026-001712-44ac4f9f`, exit zero.

All three native Xcode builds passed locally using two jobs. Local packaging was required because the mini has Command Line Tools without Xcode and the M1 SSH connection timed out. Final package verification compares every generated web file plus runtime, shared-core and common-asset fingerprints against current source. The final packages matched 110 Broadside, 91 Calculus and 92 Reader web files. Reader additionally verifies its native speech source, permissions, artwork, icon metadata and disabled Capacitor bridge logging. Runtime source fingerprint: `963eac7b1ae5d82247251af21faef0338c055f4c86bcaead5345388912671d03`.

The reading-specific opaque book-and-quill icon was inspected in source and decoded from the compiled iOS icon output. The development build is version `2026102601`; installation preserves the earlier reading save. Installation does not establish that its UI or speech recognition was tested on the physical phone. No App Store submission or production publication is included.

## Speech evidence and remaining acceptance

A physical iPhone on iOS 27 reported supported, available on-device recognition for `nb-NO` and `en-US`; `en-GB` reported no on-device support. Locale selection falls back to an available supported English recognizer. These were read-only capability flags without capture or permission prompts.

Native recognition uses Apple's on-device Speech framework, final matching results, generation tokens and exact run/item/sentence identities. Browser play offers adult practice. No cloud recognition fallback, saved audio or retained transcript is implemented; Reader bridge logging is disabled. Speech errors and cancellation do not grant rewards. Hints and adult assistance preserve the level reward and mark assistance.

**Still unverified:** real child speech and dialect/acoustic accuracy, first-time permission flow, audio-route changes and interruptions during capture, physical touch feel/orientation/performance, airplane-mode cold start and an accessibility assistive-technology pass. An earlier automatic launch was blocked by the phone being locked; the final version installed and launched successfully through devicectl. No physical-screen or microphone interaction was observed during that launch. The initial word/sentence/story corpus also needs educational and family review; sentence and paragraph banks include template variants rather than 50 independently authored stories each.

Raw matrix JSON, screenshots, worker logs, capability report, native build logs and package-verification output remain in ignored `artifacts/captain-reader/` for local inspection. The checked-in screenshots are a representative subset, not proof of the unverified states above.
