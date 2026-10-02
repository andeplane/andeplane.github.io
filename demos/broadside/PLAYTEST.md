# Broadside acceptance checks — 2 October 2026

## Forty-level campaign and Black Pearl revision

Four worlds now contain ten levels each. First sails has navigation only, with firing disabled in the simulation as well as hidden in the HUD. Pirate waters starts with island guns and introduces attacking ships at level 5. Whirlpool straits adds animated water funnels that pull, twist and damage a ship in their core; full sail can escape. The glowing deep adds the kraken. Every first clear earns 100 gold, and all ten clears in a world unlock its keepsake. Existing three-level-world saves map into the first three levels of each expanded world, retaining stars, gold and already earned keepsakes.

Island cannons now predict the position of a steadily moving target and commit the trajectory at launch. A red impact marker shows the landing point. Real projectile-physics tests cover stationary ships, forward travel, both lateral headings, and turning after launch to dodge. The in-session test verifies actual hits, hull damage and cleanup of expired markers.

The player uses DeltaX_F's freely downloaded CC-BY Black Pearl from Thingiverse, converted to a 1.6 MB GLB with dark hull, separate canvas sails, iron rigging and amber stern details. The supplied Sketchfab `.binz` was not importable; that creator's standard formats were available through a paid CGTrader listing. The shipped asset comes from the openly licensed alternate model. Blender conversion code and source attribution are checked in. Loading-frame fallback ships are rebuilt after assets finish loading, so the actual imported models appear.

`npm run check`: 141 tests in 20 files pass, TypeScript passes, coverage thresholds pass (98.5% lines, 97.16% branches), and the production build passes. Real sailing physics completes all forty default courses; separate checks validate course geometry across three seeds and broad finish entry from both sides. Reward tests cover all forty first clears, replay deduplication and completion of ten levels out of order.

Silent browser checks at 320×568, 390×740, 844×390 and 1280×800 cover the ten-tile level grid, world locks, navigation-only controls, the actual Black Pearl, an attacking pirate with manual BOOM/reload feedback, live island impact markers, whirlpool water shaders and the tenth-level special-item chest reveal. Continue after the tenth level opens the world map, with world 2 unlocked. The packaged `/demos/broadside/` build loads the Black Pearl and all four enemy classes using the production base path. Forced mute remains audio-locked after pressing the sound button. No browser errors or warnings were captured during those checks. Physical phone performance and simultaneous multi-touch remain unverified.

## Gold and world treasures revision (previous acceptance)

Each newly cleared level awards 100 gold. Finishing all three levels in a world also discovers its special item: rose diamond, captain’s crown, tides-of-time hourglass or heart of the ocean. Replay keeps the best stars and gems without duplicating currency or keepsakes. Gold totals are derived from saved level completions, so older saves convert without losing progress. The cave displays a growing hoard and four keepsakes, with four unopened world chests instead of twelve level-specific displays. Every first completion either adds another heap or increases an existing heap. The reward chest reveals gold for a normal level, or the world item alongside the gold confirmation at world completion.

The roof is now a continuous vaulted rock surface with an irregular horizontal cutout and an eroded throat. Bright sky above the roof is visible through the opening; the shaft no longer blocks the sky with a black patch.

Automated checks: 129 tests across 18 files; reward tests cover first-clear gold, replay, best stars/gems, all four world prizes, incomplete worlds and conversion of old saves. Reward logic has 100% coverage. TypeScript and the production build pass. Camera regression tests cover maximal tilt, side limits, all zoom distances and high focus targets.

Silent browser checks at 1280×800, 390×740 and 320×568 covered the bright opening, gold inspection, world-item reveal, Continue unlocking Level 2, world completion returning to the map, and cave totals of 300 gold plus one keepsake. A live first voyage used manual cannons and completed with three stars, 3% damage and a 100-gold chest. Desktop stress checks dragged the overview upward, tilted a treasure close-up diagonally and pulled back with the mouse wheel. The camera now stays beneath the ceiling (7.5 units) and inside the side walls during those combinations. The packaged `/demos/broadside/` cave loaded local textures at 390×740, converted an existing saved first-level treasure into 100 gold, and kept audio locked after a sound-button press. No browser warnings or errors were captured. Phone multi-touch and physical GPU performance remain unverified. Screenshots: `artifacts/qa/world-hoard-desktop.png`, `world-hoard-phone.png`, `world-treasure-reveal.png`.

## Rocky hoard cave revision (previous acceptance)

The cave now follows the overhead-light reference: one continuous room with irregular rock shelves, fractured stone walls and roof opening, a visibly uneven stone floor, soft shafts of daylight and dust. Sparse lanterns, an anchor, a skull flag, barrels, crates, rope coils, sacks, growing coin heaps, quartz, puddles, stalactites, stalagmites and cobwebs fill the chamber. Collected relics rest on their rock surfaces; the circular floor and matching display stands are gone. Static scenery is merged by material, and loose coins use instances.

Browser checks use `?mute=true`, which prevents creating an audio context and survives reloads and sound-button presses. The normal game also starts with sound off; the player enables sound explicitly. Automated sound tests verify silent startup, forced mute and explicit opt-in. All agent test tabs are closed after verification.

Rechecked at 1280×800, 390×740, 320×568 and 844×390: room framing, readable controls, shelf picking, smoothly animated close-ups, panning to side treasures, wheel pullback and Whole cave reset. Two-pointer gesture tests cover spreading and closing fingers, cancellation, small jitter, slow drags, and prevention of accidental selection after lifting one finger. Physical multi-touch and phone GPU performance remain unverified.

`npm run check`: 124 tests in 16 files passed; TypeScript and the production build passed. Input code has 100% coverage. The packaged cave loaded its textures correctly under `/demos/broadside/`; the closed chest and completed sapphire-ring reveal were checked silently at phone size. Reward lighting preserves the chest’s wood and brass detail in the darker room. Screenshots: `artifacts/qa/rocky-cave-desktop.png`, `rocky-cave-phone.png`.

## Pirate menu and single-cave revision

- Main menu is Play, Settings, Cave. Play opens the illustrated world map; the cave entrance is beside First sails. Each world opens three numbered tiles with stars, real lock symbols and treasure badges.
- One continuous 3D cave contains all twelve treasures. Undiscovered treasures are opaque closed chests. Drag changes the view, tapping a display inspects it, mouse wheel zooms, and Whole cave resets the camera.
- Collection saves automatically at level completion. Results confirm Added to your cave and offer Continue plus replay. Continue opens the level grid, or the world map after a pack; the last level returns to the cave.
- Gentle pirate brigs now appear in the first world, and BOOM is available from the beginning. The first world still prioritizes steering; enemy volleys deal less damage and have a longer warning.
- Darker water and cloud shadows, skull flags, swaying palms, timber docks, camp supplies, ruined gates, camps, watchtowers, torch lights and Skull Rock. Later worlds add restrained lightning and thunder. Chest planks, sparks and real lid movement are retained; gems have a brilliant-cut crown and pavilion.
- Sound effects include clicks, cannons, splash, hits, ground collisions, gems, chest opening and discovery; quiet surf, creaking hulls, cave drips and thunder provide ambience. Sound and spoken hints can be toggled separately.

Rechecked 1280×800, 390×740, 320×568 and 844×390 in the browser. A live first voyage fired manually, showed cannonballs and reload feedback, completed with three stars and 3% damage, and Continue displayed earned stars and unlocked Level 2. Settings toggles, world and level navigation, closed-chest cave, full collection fixture, tap-to-inspect and reward animations were checked. QA previews disable saves. A normal saved gold treasure survived reload. Tests and production build remain the automated checks below; physical phones remain unverified.

## Previous campaign acceptance

- Twelve deterministic courses in four packs: steering, pirates, island cannons, kraken.
- Each course reaches a broad exit and unlocks one unique 3D treasure and the next voyage.
- Three stars at ≤15% cumulative damage, two at ≤55%, one for completion with more damage or a rescue. Replays preserve the best score and gem count.
- Manual cannons choose one broadside. Fast taps queue correctly; no automatic firing.
- Once-per-contact grounding damage, hidden gems, physical fortress projectiles and timed kraken damage.
- Local saves validate scores and relic IDs; restricted or corrupt storage does not prevent play.
- Chest reveal: closed chest, anticipation, real lid hinge, warm light burst, rising level-specific treasure, three staggered stars, then enabled continuation buttons. Reduced motion completes the sequence sooner.

## Automated evidence

`npm run check` covers strict TypeScript, simulation tests with coverage thresholds, and the production build. The chest choreography tests cover concealment, completion, long pauses, and reduced-motion timing. Generated routes are exercised with real sailing physics across all twelve levels and multiple seeds.

## Browser evidence

Desktop and small viewport checks: 390×740, 320×568, 844×390 and 1280×720.

- First four voyages completed through the actual browser controls in the production preview; rewards returned to the cave and survived reload. The first voyage was replayed in the final production build and reached the animated chest reveal with three stars and zero damage.
- Manual BOOM changed the pirate hull and displayed real cannonballs and reload feedback. All four ship model classes loaded. Audio unlocked during actual play.
- Fort and kraken development previews checked visually with live simulation. Sea-click steering worked after the picking-ray import and coordinate scaling fix.
- Cave swipes, pack selection, arrows and return-from-reward checked in small windows.
- Final chest and gold reveal checked at 390×740; sapphire ring reveal and cave return checked at 320×568. Labels and actions remain clear of the animated treasure. Screenshots of development fixtures are identified by the on-screen saves-disabled badge.
- QA URLs are development-only and do not read or write player progress. Public production ignores them.

Physical iPhone/Android performance, Safari audio and simultaneous touch steering/fire remain unverified; the user requested browser-window testing for this delivery.

## First-person deep cave revision

The cave is now one connected environment with three chambers: the original skylit hideout, a lantern passage into the king’s vault, and a smuggler passage into a quartz-lit grotto. A turquoise canal splits the vault, with a real plank bridge and rope rails. Natural rock skins seal the ceiling seams. Gold banks and scattered coins fill all three chambers as voyages are cleared; each first clear now awards 1,000 gold. The four world keepsakes stay on permanent rock shelves in different chambers.

Mobile exploration uses an independent left movement stick, swipe-to-look and a jump button. Desktop has WASD/arrow movement, Space to jump, Shift to crouch, Ctrl or double-tap W to sprint, and E/click to inspect a nearby treasure. Pointer lock is requested where supported; dragging provides mouse look in the in-app browser. Escape closes inspection or returns to the menu. Inspection frames the whole object at the current walking position, supports turning it, and returns to that same position. Blur and hidden tabs release movement. Audio remains opt-in and every agent browser URL used `mute=true`.

The gold-heap rendering regression was visible from outside the heap: out-of-range clamped UVs stretched the coin texture into stripes and horizontal coins appeared to float off steep slopes. Repeating world-space UVs, a rounded bank profile, raised-rim normal detail and densely instanced engraved coins aligned to surface normals replace that surface. Walking uses the same gold-height profile as rendering, so the camera also stays above the pile.

Validation:

- 150 tests in 21 files passed with coverage (two workers); TypeScript and the production build passed. Overall line coverage 98.51%. A first unbounded coverage attempt timed out in the existing forty-course soak under workstation contention; the bounded full run passed.
- Inspected 1280×800, 390×740, 320×568 and 844×390. Actual browser input moved the phone stick, turned the view and jumped. Crown inspection fits the portrait frame and returns to the identical walking position. Checked full collection and five-level hoard fixtures.
- Simulated a continuous route using the actual rendered rock collider bounds and gold-bank heights: entrance, lantern passage, both sides of the canal bridge, side passage and grotto all reached. This complements the controller tests; it is not a physical-device test.
- Latest packaged `/demos/broadside/` preview loads with no console warnings/errors, has first-person controls, preserves saved progress, and stays audio-locked. Phone stick movement also checked in that build.
- Screenshots: `artifacts/qa/deep-cave-desktop.png`, `deep-cave-phone.png`, `deep-cave-gold-detail.png`. Physical multi-touch, physical phone GPU performance and desktop pointer lock outside the in-app browser remain unverified.

Development-only fixtures: `?qa=collection&mute=true` enters the cave with all forty levels cleared. Add `room=vault`, `room=grotto`, `room=crown` or `room=coins` to inspect those areas; `cleared=5` shows the early hoard. These previews do not read or write a player's save and are disabled in production.
