# Broadside for iPhone and iPad

The iOS app embeds the same TypeScript/Babylon.js game in Capacitor 8’s WKWebView. The game, ships, cave textures, fonts and baked coin layouts are bundled in the app. Playing does not require the website or a running development server.

The app opens fullscreen, hides the status bar, lets the home indicator fade, supports portrait and landscape, and pauses voyages when the app becomes inactive. It stays silent. Safe areas use the existing game code. On phones, the 3D buffer is capped at 1.5 pixels per CSS pixel and one million pixels, with FXAA and single-sample lighting buffers; interface text stays at native resolution. Saves remain on the device; browser saves and native-app saves are separate.

The optional purchased Black Pearl is detected automatically during local and iOS builds when its ignored `.private/` export is present. It adds a walkable ship and connected treasure room. See [PRIVATE_SHIP.md](PRIVATE_SHIP.md) for the one-time import and public-build exclusions. No special iOS build command is needed.

## Open in Xcode

From `demos/broadside`:

```sh
npm ci
npm run ios:open
```

This builds the game into `dist-ios`, copies it into the native project, synchronizes Swift packages, and opens `ios/App/App.xcodeproj`. The iOS build uses `/` as its asset base, independently of the GitHub Pages `/demos/broadside/` build.

Select the **App** scheme and an iPhone or iPad simulator, then Run. Or use:

```sh
npm run ios:sim
```

## Run on your iPhone

1. Connect the iPhone to the Mac and select it as Xcode’s run destination.
2. Select the **App** target → **Signing & Capabilities**, enable automatic signing, and choose your Apple development team.
3. Use bundle identifier `com.andeplane.broadside`, or change it in both `capacitor.config.ts` and the Xcode target if your team needs another identifier.
4. Run in Xcode. Complete any device trust or Developer Mode steps on the phone when prompted.

No signing identity or developer team is committed. Simulator builds do not need one. Device installation and App Store/TestFlight distribution require Apple signing; this project has not been submitted or uploaded.

## After changing the game

```sh
npm run ios:sync
```

Then Run again in Xcode. Keep gameplay in `src/`; there is no second Swift implementation. `ios/App/App/SceneDelegate.swift` only handles the native game window, system gestures and idle timer. Capacitor’s App plugin forwards lifecycle changes to the existing pause/input logic.

## Build without opening Xcode

```sh
npm run ios:build:sim
```

The unsigned simulator app is generated at `ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`. This command uses Xcode’s `netrc` package authorization option because all Swift package downloads are public, avoiding an unnecessary Keychain prompt during command-line builds.

Generated web bundles, DerivedData and personal Xcode settings are ignored by Git. The native project, app icon, launch screen and Swift package lockfile are tracked. There is no live-server URL, remote update service, microphone permission, or audio plugin.

Reference: [Capacitor’s iOS workflow](https://capacitorjs.com/docs/ios).

## Physical-device smoke test (Debug builds)

Launching with `--broadside-smoke-test` runs the actual Play → World 1 → Level 1
menu path twice, visits the purchased ship, then starts the level again. The
opt-in harness writes frame-rate samples, errors and screenshots to
`Documents/BroadsideSmoke.jsonl` and `Documents/BroadsideSmoke-stage*.png` in
the app container. It does not clear saves. Normal launches do not run it;
Release builds omit the harness. Download the report with `devicectl device
copy from --domain-type appDataContainer --domain-identifier
com.andeplane.broadside --source Documents/BroadsideSmoke.jsonl`.
## Captain Calculus

Captain Calculus has its own native project, icon and bundle identifier,
`com.andeplane.captaincalculus`. It installs alongside Broadside and keeps its
own on-device progress and cave. The native app bundles the math entry point at
its root and works offline. Its build excludes the optional private ship.

```sh
npm run calculus:ios:open
```

This builds `dist-calculus-ios`, synchronizes `ios-calculus/App/App.xcodeproj`,
and opens Xcode. Select the **App** scheme, your development team and the phone,
then Run. Updates use `npm run calculus:ios:sync`. Unsigned simulator builds use
`npm run calculus:ios:build:sim`; interactive simulator runs use
`npm run calculus:ios:sim`.

The default `ios:*` commands continue to build Broadside. The `calculus:ios:*`
commands select the separate project with `CAPTAIN_CALCULUS=1`.

## Captain Reader

`npm run reading:ios:sync` builds and synchronizes the independent `ios-reading` project (`com.andeplane.captainreader`). `npm run reading:ios:open` opens it. The icon is an open book, quill and sail in the other games' teal-and-gold family; it is not the Calculus icon.

The app-local `ReadingSpeech` Capacitor plugin is registered in `ReadingViewController`. It checks locale support, availability and on-device capability before creating a recognition request, requests microphone/speech permissions in context and sets `requiresOnDeviceRecognition`. It never falls back to server recognition. It stops capture on navigation, native inactivity, interruption and cancellation. Example playback runs with recognition stopped. Each result is tied to an attempt token; the TypeScript ledger additionally checks run, prompt and sentence identities before awarding gold.

Debug launch argument `--reading-speech-diagnostics` writes `Documents/ReadingSpeechCapabilities.json`. This reads capability flags only, without starting capture, requesting permission or saving transcripts. The first physical-device report is recorded in the reading design review; actual child speech requires a separate human test.

After packaging, `node tools/verifyPiratePackages.mjs /absolute/path/Reader/App.app` verifies Reader alone. The existing two-app invocation still works, and an optional third Reader package verifies all three together. Reader verification also checks native speech/permission/icon build metadata and the current reading artwork against the generated bundle. Inspect the compiled app-icon output before installing a test build.
