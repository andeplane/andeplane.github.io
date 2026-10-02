# Broadside — A Little Captain’s Collection

A mobile-first 3D sailing game built with TypeScript, Babylon.js and Vite. The main menu offers Play, Settings and Cave. Play opens an illustrated world map, then numbered level tiles with stars and locks. Complete voyages, discover hidden gems, and automatically collect twelve sculpted treasures in one explorable 3D cave. The cave also has an entrance beside the starting world on the map.

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

Four packs of three voyages introduce mechanics in order:

1. **First sails:** steering, islands, branching passages, secret gems and gentle pirate encounters.
2. **Pirate waters:** stronger broadside battles and ships you can fight or sail past.
3. **Fortress coast:** island cannons and more dangerous channels.
4. **The glowing deep:** animated kraken tentacles and purple warning rings.

Every voyage ends at the golden opening into the far sea. Sail through it to discover a permanent 3D keepsake, The treasure is saved to the cave automatically; the results screen confirms the collection and Continue returns to the level grid (or the world map after the last level in a pack). No requirement to sink every pirate. The next level unlocks when the previous treasure is found.

Three stars require at most 15% cumulative hull damage; two allow up to 55%; otherwise completion earns one. A rescue earns one star. Damage counts before rescue repairs, so repaired ships cannot earn a misleading perfect score. Gems are optional and recorded separately. Replays preserve the best stars and gem count. Collection and settings save in local browser storage, without accounts or external services. Private browsing may not retain saves.

## Controls

| Action          | Touch / mouse                                                                                                                   | Keyboard / gamepad                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Steer           | Drag the wheel toward a heading; tap sea to turn toward a point                                                                 | A/D or left/right arrows; left stick                               |
| Fire            | Tap or hold **BOOM**                                                                                                            | Space chooses a broadside; Q/E choose left/right; shoulder buttons |
| Stop / sail     | Anchor button                                                                                                                   | W/S raise/lower sails; gamepad Y/A                                 |
| Pause           | Pause button                                                                                                                    | Escape/P                                                           |
| Cave collection | Drag to explore, tap a treasure to inspect, spread two fingers to pull back, or use the mouse wheel; Whole cave resets the view | Left/right arrows inspect treasures; Escape returns to the menu    |

Cannons are **manual**. A BOOM press chooses the broadside facing the nearest pirate, then the gun crew aims within its side arc. Turn sideways to line up a target. The button reports which side is ready and its reload time. Fast taps are queued, so they reliably fire even between simulation frames. There is no auto-fire switch. Young captains get Pip’s rescue if sunk; every cleared voyage earns a treasure.

## Art and sound

The twelve treasures are actual animated 3D models made from sculpted geometry: gold bars and coins, silver doubloons, rose diamond, emerald, sapphire ring, crown, lantern, ruby, hourglass, kraken egg, turtle and ocean orb. Each reward has a five-second chest reveal: glowing seams, a hinged planked lid, rising treasure, light rays, sparks and staggered stars. Reduced-motion preferences shorten the sequence. All twelve treasures rest on irregular, separated rock shelves in one continuous cave. A fractured roof opening sends soft daylight through drifting dust onto the rough stone floor. The room contains worn, textured walls, stalactites and stalagmites, shallow puddles, sparse hanging lanterns, barrels, crates, rope coils, an anchor, a faded pirate flag, quartz and cobwebs. Coin heaps and canvas sacks accumulate as treasures are collected. Static scenery is merged and loose coins are instanced to reduce draw calls. On narrow screens, dragging pans through the chamber; tapping a treasure smoothly brings it closer, and spreading two fingers or scrolling outward returns to the wider view. Unfound treasures are opaque closed chests. The darker seas use animated waves, moving cloud shadows, shoreline gradients and restrained surf. Islands feature docks, pirate supplies, ruined gates, camps, lookouts and Skull Rock. Palm trees sway and lanterns flicker; later worlds add restrained lightning and thunder. The player and enemies fly skull flags. Ships and Pip use original Blender assets; fonts are local and licensed under OFL. Cannon, splash, impact, grounding, gem, chest and reward sounds are synthesized with Web Audio, with quiet surf, hull creaks and cave drips. Optional spoken hints use the browser’s available voices. Sound starts off on every launch and is enabled explicitly with the sound button or Settings. Add `?mute=true` to force silence, including reloads and sound-button presses; this works in both development and production.

## Extend

`src/game/voyage.ts` contains a deterministic seeded course generator. Each template preserves navigable routes around islands, and adds pack-specific ships, forts and kraken hazards. Add a relic definition, level name and pack template to extend the campaign. Seeds provide reproducible layouts; this is a twelve-level authored campaign using generated geometry, not unlimited random levels.

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

The maintained source is `demos/broadside/` in [andeplane.github.io](https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside). The site builds this app with `BASE_PATH=/demos/broadside/`. All ship, parrot, font and rock-texture assets are local and follow that base path. The rock surfaces use [Rock Face 03 by Poly Haven](https://polyhaven.com/a/rock_face_03) under CC0; attribution and original-file details are in `public/textures/cave/CREDITS.md`.

Development-only visual fixtures use `?qa=collection` (the full collection), `?qa=6` (a particular voyage, zero based), and `?qa=reveal-4` (a chest reveal). A visible badge identifies these previews and player saves are disabled. Production ignores all QA parameters.

Silent collection preview: http://localhost:5182/?qa=collection&mute=true (development only, player saves disabled).
