# Broadside — A Little Captain’s Collection

A mobile-first 3D sailing game built with TypeScript, Babylon.js and Vite. The main menu offers Play, Settings and Cave. Play opens an illustrated world map, then numbered level tiles with stars and locks. Complete voyages, discover hidden gems, and bring home gold and four sculpted world treasures in one explorable 3D cave. The cave also has an entrance beside the starting world on the map.

## Play

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5182 --strictPort
```

Development: http://localhost:5182/

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 5181
```

Built game: http://localhost:5181/

## The campaign

Four packs of ten voyages introduce mechanics in order:

1. **First sails:** steering, islands, branching passages and secret gems, with no enemy attacks or cannon controls.
2. **Pirate waters:** island cannons in levels 1–4, then attacking pirate ships from level 5. Fire manually to fight back.
3. **Whirlpool straits:** swirling currents pull and turn the ship; keep full sail and steer away from the damaging center.
4. **The glowing deep:** animated kraken tentacles and purple warning rings.

Every voyage ends at the golden opening into the far sea. Sail through it to earn 1,000 gold on your first completion. Complete all ten voyages in a world to discover its special 3D keepsake. Explore one connected cave with a skylit entrance, a lantern passage, a bridged canal in the king’s vault, and a glowing side grotto. Gold banks grow throughout after the first level; special keepsakes rest on natural rock shelves in different rooms. Gold and keepsakes are saved to the cave automatically; the results screen confirms the collection and Continue returns to the level grid (or the world map after the last level in a pack). No requirement to sink every pirate. The next level unlocks when the previous treasure is found.

Three stars require at most 15% cumulative hull damage; two allow up to 55%; otherwise completion earns one. A rescue earns one star. Damage counts before rescue repairs, so repaired ships cannot earn a misleading perfect score. Gems are optional and recorded separately. Replays preserve the best stars and gem count. Collection and settings save in local browser storage, without accounts or external services. Private browsing may not retain saves.

## Controls

| Action       | Touch / mouse                                                                                                                 | Keyboard / gamepad                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steer        | Drag the wheel toward a heading; tap sea to turn toward a point                                                               | A/D or left/right arrows; left stick                                                                                                              |
| Fire         | Tap or hold **BOOM**                                                                                                          | Space chooses a broadside; Q/E choose left/right; shoulder buttons                                                                                |
| Stop / sail  | Anchor button                                                                                                                 | W/S raise/lower sails; gamepad Y/A                                                                                                                |
| Pause        | Pause button                                                                                                                  | Escape/P                                                                                                                                          |
| Explore cave | Left stick to walk; swipe to look; Jump button; tap a nearby treasure to inspect. Keep exploring or spread fingers to return. | WASD / arrows move, mouse look, Space jumps, Shift crouches, Ctrl or double-tap W sprints, E inspects. Escape releases mouse / closes inspection. |

Cannons are **manual**. A BOOM press chooses the broadside facing the nearest pirate, then the gun crew aims within its side arc. Turn sideways to line up a target. The button reports which side is ready and its reload time. Island cannons lead a steadily moving ship; red impact markers show the committed landing point so turning after launch can dodge a shot. Fast taps are queued, so they reliably fire even between simulation frames. There is no auto-fire switch. Colliding with an island or exposed sea rock immediately sinks the ship and fails the level, even in junior mode. The bow and stern count as part of the hull. The sinking ship stays visible at the wreck site; Try again restarts that level, and failed runs award no gold, stars or unlocks. Young captains still get Pip’s rescue for combat damage; every newly cleared voyage earns 1,000 gold. Replays improve stars and gems without duplicating gold.

## Art and sound

The growing gold hoard and four world treasures are actual 3D models made from sculpted geometry: gold bars and coins, a rose diamond, a captain’s crown, a magical hourglass and the heart of the ocean. Each reward has a five-second chest reveal: glowing seams, a hinged planked lid, rising treasure, light rays, sparks and staggered stars. Reduced-motion preferences shorten the sequence. Gold and special items rest on irregular, separated rock shelves in one continuous cave. A fractured horizontal opening through the vaulted rock ceiling exposes bright sky and sends soft daylight through drifting dust onto the rough stone floor. The room contains worn, textured walls, stalactites and stalagmites, shallow puddles, sparse hanging lanterns, barrels, crates, rope coils, an anchor, a faded pirate flag, quartz and cobwebs. Coin heaps and canvas sacks grow with every newly completed level. Existing three-level-world saves migrate to the first three levels of each expanded world without losing stars or previously earned keepsakes. Static scenery is merged and loose coins are instanced to reduce draw calls. On narrow screens, dragging pans through the chamber; tapping a treasure smoothly brings it closer, and spreading two fingers or scrolling outward returns to the wider view. The four unfound world treasures are opaque closed chests. The darker seas use animated waves, moving cloud shadows, shoreline gradients and restrained surf. Islands feature docks, pirate supplies, ruined gates, camps, lookouts and Skull Rock. Palm trees sway and lanterns flicker; later worlds add restrained lightning and thunder. The player and enemies fly skull flags. The player sails DeltaX_F’s CC-BY Black Pearl model, converted in Blender to a 1.6 MB GLB with separate black canvas sails, weathered hull, rigging and amber stern details. Enemy ships and Pip use original Blender assets; fonts are local and licensed under OFL. Cannon, splash, impact, grounding, gem, chest and reward sounds are synthesized with Web Audio, with quiet surf, hull creaks and cave drips. Optional spoken hints use the browser’s available voices. Sound starts off on every launch and is enabled explicitly with the sound button or Settings. Add `?mute=true` to force silence, including reloads and sound-button presses; this works in both development and production.

## Extend

`src/game/voyage.ts` contains a deterministic seeded course generator. Each template preserves navigable routes around islands, and adds pack-specific ships, forts, whirlpools and kraken hazards. Add a relic definition, level name and pack template to extend the campaign. Seeds provide reproducible layouts; this is a forty-level authored campaign using generated geometry, not unlimited random levels.

- `src/sim`: fixed-step sailing, projectiles, wind and collisions.
- `src/game/voyage.ts`: current campaign, hazards and star scoring.
- `src/game/progress.ts`: validated local saves.
- `src/render/cave.ts`, `cavern.ts`, `relics.ts`, `chest.ts`: single treasure room, collectibles and chest choreography.
- `src/render/voyageView.ts`: gems, goal rings, fort warnings and kraken.
- `src/ui/voyageHud.ts`, `voyage.css`: mobile campaign interface.
- `src/game/session.ts`, `adventure.ts`: retained original battle/adventure simulation.

```sh
npm run check # TypeScript, tests with coverage thresholds, production build
```

Desktop browser viewport testing covers responsive layout and interactions. Physical phone performance remains unverified. QA notes: [PLAYTEST.md](PLAYTEST.md).

## Site integration

The maintained source is `demos/broadside/` in [andeplane.github.io](https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside). The site builds this app with `BASE_PATH=/demos/broadside/`. All ship, parrot, font and rock-texture assets are local and follow that base path. The rock surfaces use [Rock Face 03 by Poly Haven](https://polyhaven.com/a/rock_face_03) under CC0; attribution and original-file details are in `public/textures/cave/CREDITS.md`. The Black Pearl source and conversion details are in `public/assets/ships/CREDITS.md`.

Development-only visual fixtures use `?qa=collection` (the full collection), `?qa=6` (a particular voyage, zero based), and `?qa=reveal-4` (a chest reveal). A visible badge identifies these previews and player saves are disabled. Production ignores all QA parameters.

Silent collection preview: http://localhost:5182/?qa=collection&mute=true (development only, player saves disabled).

The Play world selector uses an antique illustrated sea chart and four matching transparent island paintings. Local assets are in `public/assets/map/`; the built-in imagegen prompts and provenance are in [docs/MAP_ART.md](docs/MAP_ART.md). World names, stars, locks and click targets remain live UI. Silent normal launch: http://localhost:5182/?mute=true — choose Play to open the chart.
