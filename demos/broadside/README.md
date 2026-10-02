# Broadside — A Little Captain’s Collection

A mobile-first 3D sailing game built with TypeScript, Babylon.js and Vite. The treasure cave is home: complete voyages, earn stars, discover hidden gems, and display twelve sculpted treasures on glowing pedestals. Swipe or scroll through the cave to revisit the collection.

## Play

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5180 --open false
```

Development: http://localhost:5180/

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 5181
```

Built game: http://localhost:5181/

## The campaign

Four packs of three voyages introduce mechanics in order:

1. **First sails:** steering, islands, branching passages, secret gems.
2. **Pirate waters:** manual cannons and ships you can fight or sail past.
3. **Fortress coast:** island cannons and more dangerous channels.
4. **The glowing deep:** animated kraken tentacles and purple warning rings.

Every voyage ends at the golden opening into the far sea. Sail through it to discover a permanent 3D keepsake, then return to your cave or sail the next level. No requirement to sink every pirate. The next level unlocks when the previous treasure is found.

Three stars require at most 15% cumulative hull damage; two allow up to 55%; otherwise completion earns one. A rescue earns one star. Damage counts before rescue repairs, so repaired ships cannot earn a misleading perfect score. Gems are optional and recorded separately. Replays preserve the best stars and gem count. Collection and settings save in local browser storage, without accounts or external services. Private browsing may not retain saves.

## Controls

| Action | Touch / mouse | Keyboard / gamepad |
| --- | --- | --- |
| Steer | Drag the wheel toward a heading; tap sea to turn toward a point | A/D or left/right arrows; left stick |
| Fire | Tap or hold **BOOM** | Space chooses a broadside; Q/E choose left/right; shoulder buttons |
| Stop / sail | Anchor button | W/S raise/lower sails; gamepad Y/A |
| Pause | Pause button | Escape/P |
| Cave collection | Swipe, arrows, mouse wheel | Left/right arrows |

Cannons are **manual**. A BOOM press chooses the broadside facing the nearest pirate, then the gun crew aims within its side arc. Turn sideways to line up a target. The button reports which side is ready and its reload time. Fast taps are queued, so they reliably fire even between simulation frames. There is no auto-fire switch. Young captains get Pip’s rescue if sunk; every cleared voyage earns a treasure.

## Art and sound

The twelve treasures are actual animated 3D models made from sculpted geometry: gold bars and coins, silver doubloons, rose diamond, emerald, sapphire ring, crown, lantern, ruby, hourglass, kraken egg, turtle and ocean orb. Each reward has a five-second chest reveal: glowing seams, a hinged planked lid, rising treasure, light rays, sparks and staggered stars. Reduced-motion preferences shorten the sequence. The cave has crystal clusters, stone arches, gold inlays, colored lighting, fireflies and bloom. The sea uses animated wave geometry, shoreline gradients and restrained surf. Ships and Pip use original Blender assets; fonts are local and licensed under OFL. Cannon, splash and reward sounds are synthesized with Web Audio. Optional spoken hints use the browser’s available voices. Sound unlocks after interaction and can be muted.

## Extend

`src/game/voyage.ts` contains a deterministic seeded course generator. Each template preserves navigable routes around islands, and adds pack-specific ships, forts and kraken hazards. Add a relic definition, level name and pack template to extend the campaign. Seeds provide reproducible layouts; this is a twelve-level authored campaign using generated geometry, not unlimited random levels.

- `src/sim`: fixed-step sailing, projectiles, wind and collisions.
- `src/game/voyage.ts`: current campaign, hazards and star scoring.
- `src/game/progress.ts`: validated local saves.
- `src/render/cave.ts`, `relics.ts`, `chest.ts`: treasure gallery, collectibles and chest choreography.
- `src/render/voyageView.ts`: gems, goal rings, fort warnings and kraken.
- `src/ui/voyageHud.ts`, `voyage.css`: mobile campaign interface.
- `src/game/session.ts`, `adventure.ts`: retained original battle/adventure simulation.

```sh
npm run check # TypeScript, tests with coverage thresholds, production build
```

Desktop browser viewport testing covers responsive layout and interactions. Physical phone performance remains unverified. QA notes: [PLAYTEST.md](PLAYTEST.md).

## Site integration

The maintained source is `demos/broadside/` in [andeplane.github.io](https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside). The site builds this app with `BASE_PATH=/demos/broadside/`. All ship, parrot and font assets are local and follow that base path.

Development-only visual fixtures use `?qa=collection` (all pedestals), `?qa=6` (a particular voyage, zero based), and `?qa=reveal-4` (a chest reveal). A visible badge identifies these previews and player saves are disabled. Production ignores all QA parameters.
