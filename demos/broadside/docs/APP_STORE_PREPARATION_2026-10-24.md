# Broadside and Captain Calculus: App Store preparation

24 October 2026. This follow-up supersedes the earlier release review where it records a later check. It is a preparation record, not an App Store approval or physical-device sign-off.

## Release candidates

| Game | Bundle | Build | App Store record |
| --- | --- | --- | --- |
| Broadside: Pirate Adventures | `com.andeplane.broadside` | 2026102405 | 6826628802 |
| Captain Calculus | `com.andeplane.captaincalculus` | 2026102406 | 6826634179 |

Both are version 1.0 for iPhone and iPad, minimum iOS 18.3, US base price $3.99, with manual release selected. Both signed App Store IPAs and archives are saved under the ignored `artifacts/app-store-release-20261024/packages/` directory. Package verification compared all 96 Broadside and 83 Captain Calculus generated web files with their signed IPAs: zero mismatches. The simulator-only saved-progress fixture is absent from both device binaries.

## Findings resolved

- Boarding faces the signed GOLD ROOM doorway. A native iPhone and iPad UI test walks through that doorway from the deck into the same treasure room.
- Cave gold has brighter reflections and restrained glints. Diamonds, rubies, emeralds and sapphires use real Rapier convex colliders and share the coin simulation. Motion respects Reduce Motion in source; OS-level reduced-motion interaction is not claimed as tested.
- Full balances are preserved. Each bank renders at most 10,000 loose coins; larger fortunes have a labelled gold-bar reserve. New chest coins all pour physically, with old piles archived when needed. Coin layouts and reserve recovery snapshots are bounded independently of monetary saves.
- Both games expose an offline Privacy & support dialog. Hosted support and privacy pages are included in the public build. Commercial redistribution rights for the purchased model and recording were confirmed by the owner.
- The advertised minimum is now iOS 18.3; Swift package generation preserves the matching platform declaration.
- Fixed the extra reserve row pushing walking controls into navigation on short landscape phones. The balance panel fits between Move and Jump; the cave title and navigation retain separate space.

## Verification

- Home M1: typecheck and 395 tests passed, with two private-asset tests skipped because ignored purchased files are not copied to workers. Public Vite build passed with support/privacy output present.
- Native iPhone, iOS 27: home, settings/privacy, worlds/levels, sailing and camera toggle, pause/background/resume, boarding/treasure-room walking, cave/inspection, maths hints/incorrect/correct answers, rewards and unloading, force-quit interruption and saved balances, maps/recenter and orientation.
- Native iPad 13-inch, iOS 27: the same five test journeys passed on a clean simulator run. Final Captain Calculus 2026102406 question/cave rotation follow-up passed.
- The first iPad run had pauses/blank launches while multiple simulators were active. The sequential clean run passed; the initial failures remain in local evidence and are not counted as successful checks.
- A wrong answer followed by nine first-try answers earned a 900-gold chest. Unloading interruption preserved two chests/1,900 aboard and 10,000 banked. Completed delivery and relaunch preserved 11,900 banked and zero cargo, on both tested form factors.
- Browser: actual 320×568 with portrait safe areas and 568×320 with landscape safe areas, including a 1,000,000-gold bank, privacy scrolling/Escape/focus restoration and the corrected control spacing. Earlier reports inventory the broader empty/error/reward/navigation matrix for both games.
- iOS 18.3 small-iPhone regression and required 6.3-inch App Store captures are in progress; results will be appended before final delivery.

Native screenshot attachments are normalized using their recorded EXIF orientation and exported as opaque RGB PNGs. Raw attachments are preserved. App-only XCTest landscape captures were incorrectly cropped; they are superseded by full-display captures. The final evidence directory contains the raw result exports, reviewed screenshots and package hashes.

## App Store state and remaining approval

Both app records, descriptions, keywords, categories, rights declarations, pricing and availability are saved. Both no-data-collection privacy responses were published after the owner's explicit approval. Apple calculated Broadside as 13+ for regular cartoon battles/weapons, and Captain Calculus as 9+ for occasional ship weapon imagery. Neither app was placed in the Kids Category. iPhone/iPad compatibility is the release scope; Mac and Vision Pro distribution are disabled.

Before submission: finish and upload the required screenshot sets, verify hosted policy/support URLs, confirm review contact details and the current Paid Applications Schedule, and attach the uploaded build. No production submission or release has been performed. Company and bank changes are deferred at the owner's request.

Physical-device touch feel, sustained thermal/memory behaviour, VoiceOver/Dynamic Type conformance and an airplane-mode physical cold start remain unverified. Simulator screenshots and automated controls do not establish those properties.
