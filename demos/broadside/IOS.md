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
