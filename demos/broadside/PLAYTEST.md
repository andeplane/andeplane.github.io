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
- Collection saves automatically at level completion. A fade carries the player from the sea into the cave before the chest opens. Results offer Retry, Next level, and Back to menu. Next level starts the following voyage directly, including across worlds. The final voyage has Retry and Back to menu.
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

## Illustrated sea-chart world selector

Play now opens an original aged nautical chart with four matching engraved watercolor island overlays. The islands show the starting cave, pirate harbor and black-sailed ship, whirlpool atoll, and kraken. Parchment annotations retain live world names, star totals and locks; the cave entrance sits near First sails. Desktop and portrait layouts have separate ink route paths. The same island illustrations appear on each world's numbered level page. Art was generated with the built-in ChatGPT imagegen tool; final prompts and provenance are in [docs/MAP_ART.md](docs/MAP_ART.md). Transparent WebP assets total approximately 3 MB.

Validation on 2026-10-03:

- TypeScript, all 150 tests in 21 files (two workers), and the `/demos/broadside/` production build passed.
- Visually inspected desktop 1280×800, portrait 390×740 and 320×568, and landscape 844×390 and 568×320. Also checked control bounds at 320×520 and 650×740. Final world/cave/back hit areas have no overlaps or viewport clipping at these sizes.
- Clicked all four islands and confirmed ten numbered levels in the correct world, with saved stars and progression locks. Entered the cave from the map and returned to the map. Checked the updated island artwork on the phone level board.
- Packaged preview loaded all five assets under `/demos/broadside/assets/map/`, with no browser console warnings or errors. Every browser URL included `mute=true`; canvas audio remained `locked`.
- Screenshots: `artifacts/qa/map-desktop.png`, `map-phone-390.png`, `map-phone-landscape.png`. Physical-phone testing remains unverified.

## Fatal island and sea-rock crashes

Touching an island or rock outcrop now immediately sinks the player and fails the voyage, including junior mode. Collision tests use the length and width of the hull so bow and stern strikes count. Exposed sea-rock clusters with animated breaking surf appear from the first level, with additional rocks later in each world; these use the same obstacles as navigation and gem placement. Failed runs receive no rewards or unlocks. The sea scene stays behind the failure screen while the ship rolls and sinks fully underwater. Retry restarts the same voyage; Back to menu returns to Play / Settings / Cave. Junior rescue remains available for combat damage, not grounding.

- TypeScript, all 155 tests in 21 files, and the packaged `/demos/broadside/` build passed. The coverage run passed its thresholds with 98.52% line coverage and 97.36% branch coverage.
- Tests cover fatal island contact in junior and standard modes, contact at an island's exact center even during the bump cooldown, rock strikes from three headings, safe water just before contact, terminal failure with no treasure/rescue, and continuing the sinking animation. All forty generated courses still complete through steering with real ship physics.
- Live muted 390×740 browser playtests sailed directly into an island and steered into the exposed rock cluster. Both produced the correct cause-specific shipwreck screen; the ship disappeared below the sea. Retry and level-menu return worked. The production build repeated the island crash at 320×568, with both actions inside the viewport and saved progress unchanged (level 3 stayed locked).
- No console warnings/errors in either browser tab, and audio remained locked by `mute=true`. Screenshots: `artifacts/qa/island-shipwreck-phone.png`, `rocks-shipwreck-phone.png`, `island-shipwreck-production-320.png`.


## Cave arrival and result actions — 2026-10-03

Success now fades the sea to darkness, changes scenes while fully covered, then fades into the cave. The chest stays closed until the fade finishes, preserving the full opening animation. Reduced motion uses a shorter fade. Input is blocked during arrival and released afterward; cancelling through menu, cave or a new voyage clears the transition. Gold and stars save before arrival begins.

Retry restarts the completed voyage, Next level starts the following voyage immediately (including the next world), and Back to menu opens Play / Settings / Cave. Next level is absent after a shipwreck and after voyage 40. The reward camera now stays inside the cave's front wall and frames the chest between the stars and buttons on narrow screens. Babylon's line shaders are explicitly bundled to avoid requesting shader files that Vite would replace with an HTML fallback.

- Typecheck, production build and all 158 tests in 22 files pass. Three transition tests check full coverage before scene switching, reveal gating and reduced-motion timing.
- Muted browser checks cover 390×740, 320×568 and 844×390. A real first-level completion and replay reach the cave; captured arrival frames show opacity rising to 1 before the closed chest appears. Retry starts Level 1, Next level starts Level 2, and after world 1 it starts Pirate Waters Level 1. Back to menu opens the main menu. The final campaign reward has no invalid next-level action. Replay confirms gold already collected.
- The packaged `/demos/broadside/` production build also completed Level 1 at 320×568, confirmed replay gold was not duplicated, and started Level 2 through Next level. Fresh development and production runs reported no browser warnings or errors and retained `data-audio="locked"`. All agent-created test tabs were closed.
- Screenshots: `artifacts/qa/reward-actions-phone.png`, `reward-actions-production-320.png`, `arrival-0.png` through `arrival-19.png`. Physical-device multitouch and performance remain unverified.


## Arrow-key cave looking — 2026-10-03

Cave arrows now control the view: left/right turns, up/down tilts. WASD controls walking independently, and mouse/swipe looking remains available. Held look input runs per rendered frame, with the existing pitch limits; opposite arrows cancel. Key release, window blur and leaving the cave clear held input. Arrow looking also turns inspected treasures. Desktop help and README reflect the new mapping.

Typecheck, production build and 159 tests pass. The added control test covers all four look directions, held look reads, release, simultaneous W movement, and clearing. A muted 1280×800 browser check changed camera yaw through arrow input while the character stayed at the same position, and showed the new control hint. No browser warnings or errors were captured. Screenshot: `artifacts/qa/cave-arrow-look-desktop.png`. The test tab was closed and the viewport restored.


## Stable cave lighting — 2026-10-03

The cave previously enabled only the two lantern lights closest to the camera. Crossing their ranking boundary abruptly replaced light sources across all visible surfaces, changing both brightness and the apparent rock detail. Lanterns now have fixed mesh inclusion lists with two local lights per surface, computed only when the hoard/treasure geometry changes. This preserves the small per-material light budget without camera-driven source swaps. Unused lamps are disabled explicitly because Babylon treats an empty inclusion list as global lighting. Lantern flicker preserves each lamp's original brightness rather than resetting all lanterns and blue crystals to 2.6. Treasure glow is restricted to its chest/item meshes and no longer switches on at a ten-metre camera threshold.

- All 160 tests in 23 files, typecheck and production build pass. The renderer regression uses Babylon's actual mesh/light associations to check both chambers, bounded light counts, unused lamps, and rebinding after geometry replacement.
- Muted 390×740 browser walking used the real cave joystick to cross the former boundary at z=32.5: screenshots at z=32.22 and z=32.78 show continuous lighting and rock detail. All fourteen local lamp identities remained stable, with approximately 60 FPS on this computer and no captured browser errors or warnings. This does not establish physical-phone performance.
- Screenshots: `artifacts/qa/stable-lighting-before-phone.png` and `stable-lighting-after-phone.png`. Packaged production cave rendering and the world-treasure reveal were also checked with forced mute. Test tabs were closed and the viewport restored.


## Remove the hidden camera light — 2026-10-03

The previous lantern fix left a broad point light attached to the walking camera. That invisible flashlight still moved the rock's diffuse shading and normal-map highlights with every step. It has now been removed. The cave uses fixed skylight, fixed local lanterns, and a slightly stronger constant ambient fill. Rock/floor specular response and normal-map strength are reduced; gold keeps its metallic shine.

At 390×740, the actual look gesture turned back toward the lantern passage; joystick walking moved from (0,31) to approximately (-0.02,30.28) without changing yaw. The paired screenshots show consistent rock and floor shading across that roughly 72 cm step: `artifacts/qa/fixed-room-lighting-before.png` and `fixed-room-lighting-after.png`. Development and packaged production rendering produced no captured browser warnings/errors and remained audio-locked. All 160 tests, typecheck and production build pass. Test tabs were closed; the user's tab was only inspected and left open. Physical-phone GPU performance remains unverified.


## Remove narration and rebuild First sails — 2026-10-03

Browser speech synthesis and every spoken-hint setting/call have been removed. Sound effects remain opt-in and `mute=true` still locks the audio device. Old saves containing the narration field are read without bringing it back.

First sails now uses ten authored layouts with different starts, lengths, landmarks, gem routes and steering patterns: short open water, palm gates, a headland turn, rocky slalom, two branches, a hidden lagoon, a long coast bend, reef gates, a secret western passage and four-headland finale. Eight courses require a turn on their shortest safe route. The HUD shows the course name and computes travel progress against that course's own start/finish. Later worlds retain their requested hazard progression.

- All 163 tests, typecheck and Vite production build pass. Real-physics steering completes all forty voyages and reaches all thirty optional gems in the navigation pack. The voice regression checks enabled sound with banner/reward events never requests a browser utterance.
- A muted 390×740 browser completed the shorter first voyage with three stars, two gems and its gold reveal, then Next level loaded the separate palm-gate layout. Reef-gate and branching-course rendering were also inspected. No browser warnings/errors; audio remained locked. Screenshots: `navigation-reef-phone.png` and `navigation-palms-phone.png` in `artifacts/qa`. Physical-phone testing remains unverified.

## Permanent open sea, camera modes and island detail — 2026-10-04

Play / Settings / Cave and the textured walking cave remain in place. The Open world button under Play resumes one fixed 3.2 km archipelago with five named regions. Islands, reefs and gems keep the same coordinates; a separate save records position, heading and discoveries. East/west and north/south join periodically. Campaign levels keep their existing forty courses. Overhead steering is the default in both modes; the eye button or C selects the optional captain camera.

Shared terrain normals and shore grain replace the triangulated surfaces. Palm fronds have curved leaflets, rocks have welded smooth normals, and each campaign world has its own lighting and material palette. Rain, moving clouds, wind, whitecaps and lightning remain tied to later-world weather. Nearby island meshes stream with deterministic props; collision geometry and the map remain fixed.

Validation:

- All 196 tests in 31 files, typecheck and production build pass. Covered line/statement coverage is 94.96%, branches 96.91%, functions 94.94%; open-sea persistence, noise, streaming decisions and captain camera have 100% coverage.
- Periodic simulation tests cross all four boundaries while preserving heading/speed, collect gems and collide with reefs across seams, and wrap cannonballs. Save tests cover reload, safe respawn, malformed/private storage and independent campaign progress.
- Real Babylon NullEngine rendering tests repeatedly unload/reload islands, compare identical terrain and prop transforms, check stable mesh/material/light/shadow counts, and move shore/props across a periodic seam. The overhead-default regression leaves the camera unchanged until captain view is enabled.
- Before preview shutdown, live muted browser checks at 390×844 and 1280×720 exercised captain/overhead switching, independent swipe/arrow looking, mobile steering, manual cannon controls, reef shipwreck/retry, the permanent sea chart, rain and cloud rendering. The current walking cave was captured at `artifacts/qa/current-cave-portrait.png`. The final default-camera correction was checked in the common startup path and regression test without restarting a preview.
- The Capacitor web bundle and signed Release iPhone build also pass. Browser checks do not establish physical iPhone GPU performance. All test URLs used `mute=true`; the canonical game contains no audio generation. Preview servers were stopped at the user's request.

## Cave access and sailing controls — 2026-10-04

The optional purchased ship now keeps Play / Settings / Cave and the map's cave entrance.
Its treasure room is a separate menu destination. Return to cave from the ship starts
the existing unloading sequence rather than instantly banking every chest. The ship
offers that action while cargo is aboard and hides it once inside the cave.
Departure scenes are disposed before loading the cave or hold; the unloading handoff
releases the ship only once the transition is fully covered. Lazy cave creation and
the iPhone rendering limits from the performance release remain in place.

Clearing sailing controls now also clears unconsumed keyboard, touch and gamepad sail
commands. Pausing, opening the sea chart or switching cameras cannot replay an old sail
command on the following simulation step. The full sea chart remains square and uses
dynamic viewport height and safe insets; its compact landscape layout also applies
to phone windows narrower than 651px.

Validation:

- DOM regression tests exercise public and private ship menus, the separate cave and
  treasure-room actions, and the availability of unloading with and without cargo.
- Input regressions queue a sail command from each input device, clear it before a
  simulation step, then verify that a fresh press still changes the sails once.
- All 214 available tests, typecheck and production build pass. Covered lines and
  statements are 95.01%, branches 96.68%, and functions 95.04%. One test requiring
  the ignored purchased model is skipped in this checkout.
- This follow-up was checked without opening another browser or starting a preview
  server. Chart layout and physical-phone rendering have not been rechecked on screen.

## Permanent open-sea settlements — 2026-10-04

The five named islands now have distinct scenery: a timber harbour town with a
lighthouse, a smugglers' cave and warehouses, a coastal sea fort, a ruined temple,
and a moonstone sanctuary. Buildings sit on foundations sampled from the actual
terrain. Dock planks, mooring ropes, rowboats, lanterns, shutters, tiled roofs,
cargo and moving pirate flags add detail. Shared clearing footprints keep trees
and ridge boulders out of the buildings and approach paths. Both sea charts use
matching ink symbols. The existing menu, cave, campaign courses and camera defaults
remain in place. These new settlements are sailing scenery; walking still uses
the existing dedicated harbour and cave.

Validation:

- All 218 available tests pass; the purchased-model fixture is skipped in this
  checkout. Covered statements/lines are 95.04%, branches 96.71%, functions 95.09%.
  Typecheck and public production build pass.
- Regression hashes from the released generator verify identical island radii,
  positions, reef types and indexed gem coordinates for four seeds. Saved voyages
  and discovery indices retain their meaning.
- Real Babylon tests check finite geometry, outward roof normals, a maximum of
  eight new settlement meshes and two lights per landmark, stable streaming
  resource counts, identical props on return, and settlement movement across a
  periodic world seam. Static pieces are merged by material.
- Offline Blender renders of the actual exported Babylon geometry were inspected
  for all five sites. This caught and corrected roof winding and the jagged joints
  of the stone arches. Offline lighting is approximate; these are model previews,
  not browser or physical-phone performance evidence.
- No browser or preview server was started for this follow-up. Audio remains absent.
