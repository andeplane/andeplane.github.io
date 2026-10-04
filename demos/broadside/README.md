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

An iPhone/iPad app embeds this same game with Capacitor and bundled offline assets. Run `npm run ios:open` to build and open the native project. See [IOS.md](IOS.md) for simulator, device signing and update instructions. Local and iOS builds automatically detect an optional purchased Black Pearl; see [PRIVATE_SHIP.md](PRIVATE_SHIP.md) for its import and walkable treasure room.

Use the corner fullscreen button to enter or leave fullscreen on supported browsers. It includes the canvas and every game control, and preserves native rendering resolution when the screen size changes. On iPhone, use Safari’s **Share → Add to Home Screen** (leave **Open as Web App** enabled when offered), then launch Broadside from its Home Screen icon to hide Safari’s bars. Browser fullscreen support varies; an unsupported request shows instructions instead. Phone Home Screen launching still needs physical-device verification.

## The campaign

Four packs of ten voyages introduce mechanics in order:

1. **First sails:** steering, islands, branching passages and secret gems, with no enemy attacks or cannon controls.
2. **Pirate waters:** island cannons in levels 1–4, then attacking pirate ships from level 5. Fire manually to fight back.
3. **Whirlpool straits:** swirling currents pull and turn the ship; keep full sail and steer away from the damaging center.
4. **The glowing deep:** animated kraken tentacles and purple warning rings.

Every voyage ends at the golden opening into the far sea. Sail through it to earn 1,000 gold on your first completion. Complete all ten voyages in a world to discover its special 3D keepsake. Explore one connected cave with a skylit entrance, a lantern passage, a bridged canal in the king’s vault, and a glowing side grotto. Gold banks grow throughout after the first level; special keepsakes rest on natural rock shelves in different rooms. Gold and keepsakes stay safely aboard the Black Pearl after discovery. The sea fades into the ship’s treasure hold, with the island visible through its stern windows. The chest opens to reveal a physically settled pile of coins. The results screen offers Retry, Next level, Back to menu, and optional Return to cave. Return to cave carries and tips each chest into its world’s gold bank, one chest at a time; delivery is saved after that deposit finishes. Leaving early keeps unopened chests aboard. Next level launches the following voyage directly, including across world boundaries; after the final voyage only Retry and Back to menu remain. No requirement to sink every pirate. The next level unlocks when the previous treasure is found.

Three stars require at most 15% cumulative hull damage; two allow up to 55%; otherwise completion earns one. A rescue earns one star. Damage counts before rescue repairs, so repaired ships cannot earn a misleading perfect score. Gems are optional and recorded separately. Replays preserve the best stars and gem count. Collection and settings save in local browser storage, without accounts or external services. Private browsing may not retain saves.

## Open-world sailing and captain view

The existing Play / Settings / Cave menu and walking treasure cave are retained.
Under Play, **Open world** resumes one permanent 3.2 km sea chart: Blackwater Bay,
Smuggler’s Coast, Stormbreak Isles, the Lost Isles and Moonstone Reach. Islands,
reefs and gems stay at fixed coordinates. Position, heading, look direction and
found gems save separately from campaign progress. Wrecking returns the ship to
Blackwater Bay while preserving discoveries. There is no New Sea button.

The square map has periodic boundaries: east joins west, north joins south.
The camera, shores, collision geometry and nearby chart use the same wrapping;
crossing an edge preserves speed and heading. Scenery loads ahead of the ship
and unloads far behind it, with deterministic per-island props on return.
Campaign levels remain their separate forty generated courses.

Overhead steering is the default in both campaign levels and the open world.
The eye button or **C** switches the current sailing camera between overhead and
first-person captain view at the Black Pearl’s helm. Mouse drag, swiping or arrows
look independently of steering. In captain view the touch wheel turns left/right,
A/D steer, W/S control sails, and Space or BOOM fires a manual broadside. R or
Ahead centres the view. Free sailing starts anchored; Set sail begins
moving. **M**, the map button or Sea chart opens the full world map and pauses
sailing while it is open.

Smooth shared terrain normals, textured shores, curved feathered palm leaves
and rounded rocks replace the visibly faceted island surfaces. The four campaign
worlds have separate palettes: warm tropical daylight, amber pirate dusk, cold
storm straits and haunted moonlight. Later levels have slanting rain, moving clouds,
whitecaps, lightning and wind-driven drift.

## Controls

| Action       | Touch / mouse                                                                                                                 | Keyboard / gamepad                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steer        | Drag the wheel toward a heading; tap sea to turn toward a point                                                               | A/D or left/right arrows; left stick                                                                                                              |
| Fire         | Tap or hold **BOOM**                                                                                                          | Space chooses a broadside; Q/E choose left/right; shoulder buttons                                                                                |
| Stop / sail  | Anchor button                                                                                                                 | W/S raise/lower sails; gamepad Y/A                                                                                                                |
| Pause        | Pause button                                                                                                                  | Escape/P                                                                                                                                          |
| Explore cave | Left stick to walk; swipe to look; Jump button; tap a nearby treasure to inspect. Keep exploring or spread fingers to return. | WASD moves, mouse or arrows look, Space jumps, Shift crouches, Ctrl or double-tap W sprints, E inspects. Escape releases mouse / closes inspection. |

Cannons are **manual**. A BOOM press chooses the broadside facing the nearest pirate, then the gun crew aims within its side arc. Turn sideways to line up a target. The button reports which side is ready and its reload time. Island cannons lead a steadily moving ship; red impact markers show the committed landing point so turning after launch can dodge a shot. Fast taps are queued, so they reliably fire even between simulation frames. There is no auto-fire switch. Colliding with an island or exposed sea rock immediately sinks the ship and fails the level, even in junior mode. The bow and stern count as part of the hull. The sinking ship stays visible at the wreck site; Retry restarts that level, and failed runs award no gold, stars or unlocks. Young captains still get crew repairs for combat damage; every newly cleared voyage earns 1,000 gold. Replays improve stars and gems without duplicating gold.

## Art and sound

The growing gold hoard and four world treasures are actual 3D models made from sculpted geometry: gold bars and coins, a rose diamond, a captain’s crown, a magical hourglass and the heart of the ocean. Each reward has a five-second chest reveal: glowing seams, a hinged planked lid, rising treasure, light rays, sparks and staggered stars. Reduced-motion preferences shorten the sequence. Gold and special items rest on irregular, separated rock shelves in one continuous cave. A fractured horizontal opening through the vaulted rock ceiling exposes bright sky and sends soft daylight through drifting dust onto the rough stone floor. The room contains worn, textured walls, stalactites and stalagmites, shallow puddles, sparse hanging lanterns, barrels, crates, rope coils, an anchor, a faded pirate flag, quartz and cobwebs. Coin heaps and canvas sacks grow with every newly completed level. Existing three-level-world saves migrate to the first three levels of each expanded world without losing stars or previously earned keepsakes. Static scenery is merged and loose coins are instanced to reduce draw calls. On narrow screens, dragging pans through the chamber; tapping a treasure smoothly brings it closer, and spreading two fingers or scrolling outward returns to the wider view. The four unfound world treasures are opaque closed chests. The darker seas use animated waves, moving cloud shadows, shoreline gradients and restrained surf. Islands feature docks, pirate supplies, ruined gates, camps, lookouts and Skull Rock. Palm trees sway and lanterns flicker; later worlds alternate clouded seas, rain squalls and thunderstorms. The navigation world stays bright and calm. Rain slants with the wind, water shows raindrop rings and wind-torn whitecaps, and occasional branching lightning briefly illuminates the islands. Seeded gusts drift and turn both player and pirate ships; counter-steer to hold course, or lower sails to reduce wind exposure. The HUD shows weather and wind direction. Storm wave height is shared by the water and ship animation, and reduced-motion preferences disable lightning. The player and enemies fly skull flags. The player sails DeltaX_F’s CC-BY Black Pearl model, converted in Blender to a 1.6 MB GLB with separate black canvas sails, weathered hull, rigging and amber stern details. Enemy ships use original Blender assets; fonts are local and licensed under OFL. The game is silent: no ambience, music, narration, or sound effects. Hints appear as text. Existing `?mute=true` links remain valid, but silence no longer depends on a query or setting.

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

Desktop browser viewport testing covers responsive layout and interactions. Latest changes were checked at phone-sized browser viewports; this does not verify physical-phone performance. QA notes: [PLAYTEST.md](PLAYTEST.md).

## Site integration

The maintained source is `demos/broadside/` in [andeplane.github.io](https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside). The site builds this app with `BASE_PATH=/demos/broadside/`. All ship, parrot, font and rock-texture assets are local and follow that base path. The rock surfaces use [Rock Face 03 by Poly Haven](https://polyhaven.com/a/rock_face_03) under CC0; attribution and original-file details are in `public/textures/cave/CREDITS.md`. The Black Pearl source and conversion details are in `public/assets/ships/CREDITS.md`.

Development-only visual fixtures use `?qa=collection` (the full collection), `?qa=6` (a particular voyage, zero based), `?qa=reveal-4` (a chest reveal), and `?qa=free&seed=81723` (the open world). A visible badge identifies these previews and player saves are disabled. Production ignores all QA parameters.

Silent collection preview: http://localhost:5182/?qa=collection&mute=true (development only, player saves disabled).

The Play world selector uses an antique illustrated sea chart and four matching transparent island paintings. Local assets are in `public/assets/map/`; the built-in imagegen prompts and provenance are in [docs/MAP_ART.md](docs/MAP_ART.md). World names, stars, locks and click targets remain live UI. Silent normal launch: http://localhost:5182/?mute=true — choose Play to open the chart.


First sails uses ten separate authored courses: a short open-water lesson, palm-island gates, a headland turn, rocky slalom, a branching island, a hidden lagoon, a long coastal bend, reef gates, a secret western passage, and a final four-headland trial. Starts, distances, landmarks, gems, and steering patterns differ. World one stays navigation-only; cannons begin in world two.

### Individual gold banks

Each world has a separate bank in the walking cave. First completions award 1,000
actual doubloons; a full world contains 10,000 thin-instanced coins. Coins have
bevelled edges, raised rims, and engraved faces. The standing eye height is 2.25m.

`npm run gold:bake -- WORLD` bakes that world's ten deposits with Rapier rigid-body
physics at a fixed time step. Settled coins become fixed between deposits, so
all earlier positions and rotations remain unchanged. Float32 XYZ/quaternions
are stored in `public/assets/hoard/`, validated when loaded, and cached in IndexedDB.
For new rewards, the chest tips over above its world bank. A Web Worker runs
Rapier for the new 1,000 coins, against the rough floor, retaining rocks and all
previous coins. Resting poses are cached; static GPU instance buffers stop all
per-frame coin updates after settling. Existing gold is fixed collision geometry,
not an active physics simulation. Offline poses support immediate collection
loading and provide a fallback if workers are unavailable. Private
browsing can load the same poses without persistent storage. QA previews never
read or write the player's pose cache.

Muted fixtures: `?qa=collection&cleared=8&bank=0&mute=true` shows the first bank;
`?qa=collection&bank=3&mute=true` shows the final bank with the full collection.
`?qa=reveal-7&mute=true` previews a chest and deposit.

### Visit the docked ship

Choose **Visit your ship** below the main menu to explore Port Blackwater. The
Black Pearl has a continuous walking deck, raised quarterdeck and forecastle,
stairs, helm, rigging and cannons. Cross the gangplank to the lantern quay and
walk between the town's tavern, chandlery, stores and shipwright. This is a
purpose-built walking version of the ship; sailing continues to use the adapted
Black Pearl GLB. Deck edges, buildings and fittings have grounded collisions.

Use WASD to walk, mouse drag or arrow keys to look, Space to jump, and E near
the helm to open the sea chart. On phones, use the left stick, swipe to look,
and tap Jump. **Set sail** opens the world map, and Back returns to the menu.
The harbour shares the game's silence and does not change campaign progress.
Development preview: http://localhost:5182/?qa=harbour&mute=true (saves disabled).

### Display resolution

The 3D canvas uses the display's device pixel ratio, including on phones. A
390×844 view at 3× renders at 1170×2532; rotating the phone preserves that pixel
density. The buffer is bounded to eight million pixels and the GPU's maximum
render-target dimension for unusually large screens. Touch input never selects
a lower rendering preset. Supported GPUs use 4× MSAA, with FXAA as a fallback;
sea and cave shadows use 2048px maps, and textures use up to 16× anisotropic
filtering for sharp detail on angled surfaces.

To verify a 3× canvas in a desktop-sized phone viewport, append `renderDpr=3` to
an existing development QA URL. This fixture is ignored in production. The
canvas's `data-render-resolution` attribute reports its actual drawing buffer.
