# Cave HUD and maths styling — 18 November 2026

User evidence: IMG_1142/1143 showed oversized cave navigation, title/description banner and bottom stats slab obscuring the scene. IMG_1144 showed arithmetic visually disconnected from the adventure. User explicitly requested this cave cleanup, superseding the earlier cave-UI exclusion; shared 3D rendering remains untouched.

## Changes

- Quiet cave host UI: Back, compact gold, a treasure-details disclosure. Movement/jump are smaller edge controls; Ship is one compact bottom action. No duplicated current-cave navigation, title banner, permanent statistics panel or repeated movement instructions. Statistics, reserve-bar total, entrance reset and language remain accessible on demand. Loading/error states hide unusable movement controls; scene-error recovery retains Back/Ship.
- Maths inherits the illustrated harbour background with a marine scrim, warm parchment, brass outlines and gold action. Removed Ship/Cave shortcuts from the focused problem header; kept Back and settings/language. Legible equation/numerals and full hint diagrams remain.
- Home now explicitly labels Language alongside How to play. Eight locales were already present in installed2026111702. The native wrapper now also declares those locales in CFBundleLocalizations so WebKit can select them from iOS preferences. A native Norwegian auto-language test passes.
- Updated to maintained origin/main dc7b785, preserving Reader shared-map refactor and button haptics. Conflict resolution retained both difficultyMap.css and the Calculus-specific design imports. No shared 3D/camera/controller implementation was changed.

## Evidence

51 focused navigation/localization/style/haptics/control tests passed; TypeScript, sync and simulator/device builds passed. Final native XCTest run passed2tests: home/language route; maths/hints portrait/landscape and correct answer; return via map to unloading/cave; details open/close; movement, jump and landscape hit targets; separately Norwegian home/maths with AppleLanguages nb and auto selection. A shut-down simulator initially retained the older app; those failed old-package attempts were discarded. The successful run followed a confirmed boot/install of the new app.

Reviewed12 native screenshots and15 browser screenshots at402×874,320×568,844×390, with simulated protected phone edges. No horizontal overflow or enabled button below44px in the final browser scans. Details escape dismissal tested. The final details-panel44px sizing adjustment was browser-reviewed after native captures; native captures do not independently establish that final CSS size. Fresh visual reviewer approved these exact cleanup compositions; source/image review is not physical touch acceptance.

Evidence: ignored artifacts/calculus-focus-20261118. Successful native bundle: /tmp/calculus-focus-qa/reviewed.xcresult. Build log: /tmp/calculus-focus-phone.log. Final web assets were hash-checked against the signed device package. The detector's only advisory is Fraunces popularity, retained from the approved direction.

## Delivery and limits

Device build2026111801 is the current cleanup build. Installation/readback/launch status is recorded below. No store submission, PR or commit was performed. The cave's bright ceiling opening and existing chest/camera choreography are still scene-owner work; this review approves the HUD and maths changes, not those inherited3D issues. Real-device appearance/touch acceptance remains for the user's test.

Installation succeeded on Anders's physical iPhone18Pro. Independent device inventory confirms Captain Calculus1.0/build2026111801. Automatic launch was denied because the phone was locked; the user can unlock and open the app. No uninstall or progress reset was performed.
