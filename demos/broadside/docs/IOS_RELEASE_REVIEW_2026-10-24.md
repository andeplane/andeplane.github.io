# Broadside and Captain Calculus — iOS release review

**Historical review:** see [the later App Store preparation record](APP_STORE_PREPARATION_2026-10-24.md) for fixes and subsequent native verification.

24 October 2026. Reviewed checkout: `homepage-shared-pirate-games/demos/broadside`. Both reviewed device builds are **2026102402**.

**Verdict: not ready for public App Store submission.** The core interfaces are suitable for continued device testing after the fixes below. This review does not establish full physical-device gameplay, touch feel, supported-OS compatibility, or sustained performance.

## Open release findings

| Priority | Game | Finding and evidence | Required resolution |
| --- | --- | --- | --- |
| P1 | Both | The signed packages declare **iOS 15.0**, but the interface and logic use `dvh`, `:has()` and `Array.at()` without an iOS 15.0 compatibility layer. These features arrived in Safari/iOS 15.4. The current simulator is iOS 27, so it does not validate the advertised minimum. | Choose a supported minimum and test it, or implement and verify the required fallbacks. See both Xcode projects' `IPHONEOS_DEPLOYMENT_TARGET` and `src/ui/liveHud.css`, `src/ui/homeMenu.css`, `src/ui/expeditionTrail.ts`. |
| P1 | Captain Calculus | A synthetic **1,000,000-gold bank** loads and can be exited in the desktop browser, but the pile extends through the cave roof. The capture operation took about ten seconds; that is not a controlled performance benchmark. `src/game/goldLayout.ts:67` allocates seven floats per gold coin and extends the pile in vertical layers without a bound. Its cache validator rejects counts over 100,000, even though the math bank accepts larger totals. | Make large banks spatially contained and bound rendering/loading costs while preserving the complete financial balance. Test large banks and repeat visits on an iPhone. No gold cap or balance reduction was introduced in this review. |
| P1 | Both | No in-app privacy policy was found in the reviewed navigation/settings, and no submission privacy URL was verified. Apple's guideline 5.1.1 requires an accessible policy in the app and App Store metadata. | Supply a policy consistent with the actual data flow, expose it in both apps, and verify the hosted URL and privacy declarations before submission. |
| Release sign-off | Broadside | The private ship attribution says "purchased for private family use". The asset manifest records the source and hash, not the purchase licence. This wording does **not** establish the actual licence restriction or commercial entitlement. | Verify the purchase terms and rights for the proposed public game, ship likeness/name, screenshots and marketing. No conclusion of infringement is made here. |
| Conditional | Broadside / Kids Category | Settings contains an external model-credit link with no parental gate. | If submitted in the Kids Category, gate outgoing links or use a compliant credits presentation. The category and age-rating decisions were not verified. |

The App Store Connect listing, support URL, age questionnaire, distribution signing/archive, release screenshots and final privacy answers were not inspected. Local development signing is not App Store distribution validation.

References: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (2.1, 5.1.1 and, conditionally, 1.3); [WebKit's Safari 15.4 release overview](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) (dynamic viewport units, `:has()` and `Array.at()`).

## Problems fixed during this review

- Broadside's short portrait world chart gave its two grid rows less room than their labels needed. Two-line names overlapped the following world; the cave artwork also intercepted that label area. Reserved two distinct world rows and a separate compact Cave / Open world footer.
- Broadside's fullscreen control overlapped Play in short landscape. Reserved its own navigation space.
- The full sea chart placed its title under Back on a narrow phone and ignored simulated safe-area variables. Reserved a navigation row, reduced nonessential chart copy on short portrait, and honoured all four insets.
- Raised the sea-chart actions, Captain Calculus narrow reward secondary actions and the effective sound-setting label to at least 44 CSS px.
- Added keyboard focus containment and restoration for pause and the sea chart, plus outside-tap dismissal for pause. Existing Escape dismissal remains in the game controller.
- Captain Calculus's renderer did not opt into the existing mobile limits. It now uses the native/mobile render-pixel, texture and antialiasing configuration. A real quality-policy regression test checks the budget for a 3× Retina iPhone; this is not a measured physical-phone memory result.
- A failed math cave load set the same readiness flag as a finished unload and could claim completion. Failure now keeps the cargo aboard and shows an explicit, visible error. Removed overlapping fallback copy and ensured landscape does not hide essential error status.
- Math loading status could disappear behind the cargo panel on a short phone. Loading now occupies normal flow with a smaller decorative icon; its caption remains visible.
- Added development-only menu, difficulty, bank, delay and failure fixtures to make the checks repeatable without reading or modifying the player's normal saves. These fixtures are disabled in production builds.

The earlier deck-to-treasure-room change remains in this checkout. This review preserved it.

## Screen and state coverage

Primary screen layouts were captured at **390×844**, **320×568**, **844×390**, **768×1024** and **1024×768**. Phone portrait reserves simulated top/bottom areas of 62/34 px; landscape reserves left/right/bottom areas of 62/62/21 px. The iPad checks are browser layout checks, not physical iPad input validation.

| Game | Reviewed screens and representative states |
| --- | --- |
| Broadside menus | Home; settings and sound label; world chart with completed worlds; regional chart and level targets; ship details, Close, Escape, outside dismissal and focus. |
| Broadside gameplay | Navigation, cannon, storm and glowing-deep voyages; overhead and captain views; open sea; pause and resume; full sea chart; loss and Retry; sailing deck, rail readiness, fishing wait, missed bite, successful reel and fish catch. The rare random fishing-chest reward was not separately observed in the browser. |
| Broadside collection | Boarding and the marked gold-room entrance; empty/full cave; nearby bank inspection and Escape back to walking; chest reveal and locked controls; unloading. Large ship cargo was also reviewed in the preceding treasure-room review. |
| Captain Calculus navigation | Home; four operator choices; difficulty map; early and level-121 endless trail; guide; Back destinations; map drag and recenter. |
| Captain Calculus questions | All four operators at their hardest difficulty; representative three-digit subtraction; keypad, empty/disabled Check, hints, scrolling long hints, wrong-answer feedback, correct retry and continuation. |
| Captain Calculus rewards | No-gold completion; cargo hold; reward reveal; cave; unloading; completed delivery; empty and large bank values; simulated save failure and scene failure. |

A full math level was played through real DOM controls: one wrong answer, correct retry, nine further first-try answers, a **900-gold** chest, and unloading to **900 banked / zero aboard**. The error case retained one chest and did not offer a false completed-unload action.

Map dragging changed the visible map transform without opening a level, and recentering returned to the selected difficulty. A full fishing cycle produced a silver fish; both a missed bite returning to Cast line and a successful bite/reel/catch were observed. Movement and camera evidence includes the earlier physical-coordinate projection tests and browser walking checks; not every heading was replayed manually on a device.

Hints and guide content intentionally scroll where they exceed the viewport. The landscape ship dialog also scrolls; the initial screenshot is not evidence that every action is visible simultaneously. A physical two-finger map gesture and every possible saved trail were not tested.

Level markers measure 44×44 after the short chart-entry animation. Early captures see the animation's scaled hitboxes; those were not misreported as permanent 40px controls. Inline attribution links remain text links and are covered by the separate Kids Category finding.

Representative computed colour checks on the actual controls: settings credit text against its dark backing approximately **6.21:1**; dark action text on gold **9.13:1**; light navigation text on its dark backing **12.42:1**. Screens were also inspected visually over their rendered scenes. This is not a complete WCAG or VoiceOver conformance audit.

## Native, tests and packaging evidence

- Home-m1: **378 tests passed**, with **two purchased-asset tests skipped** because ignored private files are not copied to workers. Final focused navigation, HUD, style and render-quality tests: **40 passed**; typecheck passed.
- The two purchased-asset doorway tests passed locally earlier in this chat. No new claim of physical-device walking is derived from those tests.
- Both iOS simulator Release builds succeeded. Both apps launched on the dedicated iOS 27 simulator; native home screenshots are saved. Native simulator interaction was not available through the configured computer-use surface, so the all-screen interaction matrix used the browser.
- Both signed iPhone Release builds succeeded. The final Broadside package contains **93** matching generated web files; Captain Calculus contains **80**. SHA-256 comparison found **zero mismatches** between generated and packaged web contents.
- Both apps were installed on the connected iPhone as build **2026102402**. Installation does not verify device visuals, gameplay or touch feel.
- The native projects still advertise both iPhone and iPad and still have minimum OS 15.0. That compatibility finding was left explicit rather than silently narrowing supported devices during a review.

The final evidence index is `artifacts/ios-release-review-20261024/verification.json`; screenshots, contact sheets and DOM geometry are in the same ignored local directory. The directory contains before-fix and after-fix captures; `*-final` and `*-fixed` names distinguish follow-up checks. A capture of a timed reveal or loading phase is not a steady-state screenshot.

## Checks still required before release sign-off

1. Resolve the large-bank behaviour and minimum-OS support finding.
2. Complete the policy, asset-rights and App Store submission checks above.
3. Play both final packages on the physical iPhone: two-handed controls, look/strafe directions, orientation changes, returning from background/lock, interruption during unloading, saved progress after force quit/relaunch, and airplane-mode cold start.
4. Run a sustained native gameplay/unloading session and large-save visits while measuring frame rate, memory and thermal behaviour. Browser frame rates and a successful native home launch are insufficient.
5. Validate the supported oldest iOS version and the declared iPad form factors. Verify VoiceOver/Dynamic Type/reduced-motion behaviour and do not advertise accessibility support that has not been tested.

These are the remaining sign-off conditions. No App Store upload, public deployment or release approval was performed.
