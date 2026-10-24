# Walk from deck to gold room — 24 October 2026

The existing central doorway could be walked through, but boarding faced away from it and the entrance was dark and unmarked. The ship menu's Treasure room action also opened a different, non-walkable hold scene.

Boarding now faces the doorway from a position clear of the mast. A contrasting GOLD ROOM / Walk in sign and two warm lights mark the entrance. The menu shortcut enters the same walkable room, with the same cargo and keepsakes. The route uses continuous walking, with no scene transition between the deck and room.

## Review performed

- Browser review at 390×844, 320×568 and 844×390; portrait-to-landscape and landscape-to-portrait resize. Simulated top/right/bottom/left safe areas: 47/0/34/0 px portrait, 0/47/21/47 px landscape.
- Boarding, doorway, interior, reverse route to deck, empty cargo, four chests, forty chests with four keepsakes, Back to chart, ship details, and Treasure room shortcut. The passage remains clear with large cargo. Gold is visible in open chests beside the central walkway.
- Walked in and out with keyboard controls. Entered using the on-screen joystick held through browser pointer input. This establishes input wiring, not physical touch feel.
- Checked visible Back, Set sail, Jump, fullscreen and Return to cave controls in the narrow safe-area layout: each is at least 44×44 CSS px and remains within the viewport. Existing light-on-dark navigation and dark-on-parchment action colours are retained. The new sign uses light cream on dark brown.
- Captain Calculus has no implementation changes. Checked its home-to-Ship navigation and empty hold at 390×844; its complete screen matrix was not repeated.
- Screenshots and machine-readable evidence: `artifacts/treasure-room-20261024/` (local, ignored artifacts).

## Validation and delivery

- M1 worker: 376 tests passed; purchased-asset tests skipped there because private files are not copied. Final source typecheck, three deck tests and public production build passed after updates.
- Local purchased-asset tests: two passed, including a round trip from the actual boarding pose past the mast through the imported doorway.
- Local iOS Release build passed. Compared all 93 generated web files with the packaged app: no mismatches. Verified the packaged ship module contains the final sign and boarding pose.
- Installed Broadside build 2026102401 on the iPhone and confirmed the installed version through CoreDevice. Captain Calculus remains 2026102306.
- Automatic launch was denied because the iPhone was locked. Physical iPhone appearance, walking and touch feel are unverified. Model-load failures were not fault-injected. No claim of full physical-device design verification is made.
- The Mac mini could not create a test checkout because its disk was full; the suite was run successfully on the M1 worker instead.
