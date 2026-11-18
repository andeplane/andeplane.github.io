# Captain Calculus — replacement full review, 17 November 2026

The earlier blanket simulator approval is withdrawn. The user's IMG_1135.PNG showed a substantial empty home-header band that was present in the prior simulator screenshots and missed during review. Passing interaction tests did not justify the earlier visual conclusion.

## Source and delivery

Maintained repository: andeplane/andeplane.github.io, demos/broadside. Fetched and fast-forwarded to origin/main 6e62ba4, then resolved only this task's home/import change against the newly maintained language implementation. Preserved eight languages, first-try rewards, banks, cargo, saves, full map behavior and all shared rendering. Unrelated orbital-compute changes were not edited. No PR, commit or store submission was created.

Corrected signed device build: 2026111702. Native build succeeded; bundle index/Calculus JS/CSS hashes match dist-calculus-ios. Initial transfers on 17 November failed after disconnection. On 18 November, after Anders reconnected and unlocked the phone, installation succeeded; the device app inventory independently confirmed Captain Calculus version 1.0/build 2026111702, and devicectl successfully launched it. Updated in place without uninstalling. This confirms installation and launch, not physical visual/touch acceptance.

## Concrete fixes

- Removed reserved header row from headerless home. Art reaches screen top; safe areas pad the content instead. How to play remains fully visible in the standard portrait/landscape compositions.
- Integrated existing translations into the new home rather than retaining hard-coded English from the prototype.
- Reserved map title/chapter and action-dock regions outside the pannable map. Active chapter context stays visible in the fixed header. Repositioned all recenter/zoom controls inside the reduced map viewport. Removed overlapping drag-tip overlay.
- Removed hint clipping within an inner scroll box. Diagrams remain complete; the page itself scrolls to answer controls. Native swipe and answer submission prove reachability. Compact320px layout retains the primary action; redundant dot progress is omitted on short portrait screens where the question count already supplies it.
- Strengthened world-card arrows. Improved ship/reward headings and secondary/action text. Landscape headings/recovery instructions have separate space from cargo and fallback art. Empty ship explicitly says no chests aboard beside the disabled unloading action.

## Actual review coverage

| Page/state | Native simulator evidence | Browser evidence |
|---|---|---|
| Home | Fresh and resumed saves; portrait/landscape; final art starts at top |402×874,320×568,844×390, safe areas; eight-language narrow review |
| World choices | Portrait/landscape; selection |All four visible choices, three sizes; eight-language narrow review |
| Difficulty map | Selection of Up to10 |Three sizes; pan UI, accessible controls and labels |
| Level map | Portrait/landscape, recenter, Play; final exact-source test asserts all three map controls hittable |Three sizes, current level121 large-save fixture; fixed header/dock and all tools visually reviewed |
| Maths | Empty input/disabled Check; digits; hints; retry; correct; Next; relaunch/Continue |Three sizes, safe areas, eight-language narrow review |
| Hints | Full illustration, actual swipe to keypad/Check, accepted answer |Borrowing, three-digit subtraction, multiplication, division at320/844; scrolled action screenshots |
| How to play/language | Native guide navigation |Eight-language narrow view; selector and saved-state preservation tested |
| Privacy/support | Native open/Close |Three sizes; actual .privacy-copy scrolled to support/end; Escape and outside mouse tap dismiss; focus returns to opener |
| Level completion | Real full level reward; separate zero-gold fixture completes final problem; completion portrait/landscape; next-map/next-level route |Three sizes for zero-gold completion |
| Ship | Empty state plus Back; portrait/landscape |Empty/multiple cargo, million-gold bank, all three sizes; load/error states |
| Reward | Earned1000gold from full native level; portrait/landscape; readiness gating |Three sizes, action and heading layout |
| Unloading/arrival | Two-chest automatic sequence completes; arrival action and exploration reached |Three sizes, pending-cargo and scene-failure fixtures; visual defects below remain OPEN |
| Cave | Entered, portrait/landscape and banked totals |Three sizes, large bank, loading/error; defects below remain OPEN |

Native device: dedicated iPhone18Pro iOS27 simulator. The full final-source walkthrough passed3tests (full level→reward→unloading→cave; fresh/empty ship; maps/math/navigation/resume). Focused native suite passed3tests (hint scroll/answer; map hit targets; zero-gold completion). A final isolated map test passed after the last map caption/layout change; its exports use a separate final-native-map directory to avoid confusing older captures with the final source.

Browser dimensions use normal portrait402×874, narrow320×568 and short landscape844×390. Main matrix supplied nonzero top/bottom safe areas in portrait and side/bottom safe areas in landscape. No horizontal page overflow or enabled target below44×44 appeared in those recorded scans. Tall content deliberately scrolls; screenshots of its lower action areas and actual native scrolling are included.

Review was performed on full compositions, supplemented by an independent fresh visual reviewer. Review findings were fixed and recaptured; machine test success was not treated as visual approval. The reviewer withdrew one erroneous disappearing-header observation after reopening full-size captures. Initial extra completion automation incorrectly expected Explore next island to jump straight to a problem; the maintained app correctly returns to the next-level map, so the test was corrected to select Play level13 before asserting the next question.

## Validation

80 focused maths/localization/navigation/style/cave-data tests passed. TypeScript, whitespace checks, Capacitor sync, native simulator build and signed device build passed. No formatter or linter script exists in this package. The design detector's only advisory is Fraunces popularity; retained for its chosen display character. These focused checks are not a claim that a full repository-wide suite ran.

## Unresolved cave-owner findings — NOT a whole-app visual pass

Cave and unloading presentation/rendering were not edited by this task, in accordance with the user's separate ownership instruction. Reviewed them and retained the failures:

1. Native unloading can bring the camera so close to the chest that large plank surfaces fill and clip across most of the screen. Evidence native/calculus-all-unloading-portrait.png.
2. Unloading heading can obscure the chest in narrow portrait; the exploration HUD occupies a large fraction of the visible world.
3. Scene-error fallback still instructs Move/Jump/drag despite absent controls. Loading cave can show movement controls before scene readiness.
4. Small secondary cave labels and physical movement/look/jump feel need the cave owner's review. Functional completion of the native unloading sequence is not visual acceptance of its choreography.

## Limits

Physical iPhone touch feel/appearance after the corrected update remains unverified. Native320px hardware class was not tested;320px coverage is browser simulation. All eight locales were reviewed on home/operators/questions/settings at narrow size, not every native page or every arithmetic content permutation. Storage-write failures have model/UI tests, not native fault injection. Cave camera handedness was not revalidated interactively in this review and must not be inferred from unchanged source.

## Evidence

Ignored artifacts/calculus-full-review-20261117 contains browser and final-browser captures,27 native all-page captures,8 focused native captures,2 unique final-native-map replacements, and exact Swift/browser walkthroughs. Full results: /tmp/calculus-simulator-qa/final-allpages.xcresult, /tmp/calculus-complete-qa/final.xcresult, /tmp/calculus-complete-qa/final-map.xcresult. Tests use isolated simulator fixtures and browser session storage, not the physical phone's progress.
