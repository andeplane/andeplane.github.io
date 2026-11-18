# Captain Calculus device test build

Installed development build 2026111701, bundle com.andeplane.captaincalculus, on Anders's physical iPhone 18 Pro (17 November 2026). Updated in place without uninstalling.

Ported non-cave presentation from the standalone games/broadside prototype into the actual homepage/demos/broadside native app source. Kept the native source's first-try reward rules, pending cargo, saves, full illustrated maps and ship/cave code. Added isolated adventure.css, generated harbour WebP and licensed Fraunces font. Replaced only the math home presentation; shared Broadside UI files remain untouched. Ship, cave, reward and unloading are excluded from all new scoped rules.

Validation: typecheck and calculus:ios:sync passed; signed Debug xcodebuild succeeded. Verified bundled index, harbour art and font hashes match dist-calculus-ios. Browser-reviewed native source home, world choice, difficulty/level maps and maths; corrected dark-on-dark map heading and narrow keypad layout. 320px portrait and 844px short-landscape maths captures retained under /tmp/native-calculus-*.png. Physical launch was denied because the phone was locked, so physical appearance, touch feel and preserved progress after opening remain for the user's test.

Build log: /tmp/calculus-device-build.log. Built app: /tmp/calculus-redesign-device/Build/Products/Debug-iphoneos/App.app. No store upload or submission.

## Native simulator walkthrough completed

Ran the actual Capacitor app in the dedicated iPhone 18 Pro iOS 27 simulator (Pirate App Preview 20261102). Signed-device source was rebuilt for the simulator without code changes. Native XCTest walkthrough succeeded (17 retained screenshots): home portrait/landscape; guide; privacy open/close; world list portrait/landscape; difficulty map; level map portrait/landscape and recenter; math portrait/landscape; hints portrait/landscape; wrong answer and retry; correct answer and Next; terminate/relaunch and Continue to the second problem. Visually inspected the screenshots in addition to test completion. Hint content deliberately expands the scrollable workspace. No additional app changes were required by this walkthrough.

The initial automation attempt expected “Continue level 12” for an untouched fixture level, where the correct app label is “Play level 12”. Corrected the temporary test and reran the complete walkthrough successfully; this was a test expectation error, not an app fix.

Evidence: `artifacts/calculus-redesign-simulator-20261117/` contains captures and the exact walkthrough; full successful result bundle `/tmp/calculus-simulator-qa/final.xcresult`; test log `/tmp/calculus-simulator-qa/final.log`. Simulated fixture saves only; real phone saves were not used. Cave/unloading remain outside scope. Physical-device feel, every arithmetic pack, very large balances, full level completion/reward and failure injection are not established by this pass. The installed phone build is unchanged at 2026111701.
