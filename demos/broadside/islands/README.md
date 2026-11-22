# Island Atlas

A standalone browser playtest for Broadside’s procedural treasure islands. Run `npm ci` and `npm run islands:dev` from `demos/broadside`. `npm run islands:build` type-checks the app and writes the distributable to `islands/dist`.

Choose a pack for its treasure, landmark, light and sea. Choose the biome independently. The dice generates a new island. The address bar records the seed and settings after each generation so a playtester can send the same island back. Drag to orbit, scroll or pinch to zoom, and select **Go ashore** to explore. Walk with WASD or the thumbstick. Drag or use the arrow keys to look. Open **Map** (M) to see the shoreline, landing, village, landmark and buried treasure. Ashore, the teal arrow shows your position and heading. Dig with E or the **Dig** button. Three strikes at the marked site uncover the treasure. Returning to the overview keeps digging progress for this island until the page reloads.

A link with `mode=walk` starts at the beach. Add `start=village` for the village lane, `start=harbor` for the dock, `start=ship` for the Black Pearl’s deck, or `start=cave` for the tidal grotto. These starts fall back to the beach when the feature is absent. Set `light=day`, `sunset` or `night` to explore the same island under a different sky. The rotating lighthouse casts a moving pool of light after dark. Each shovel stroke removes ground at the point of impact. The sound button mutes soil and treasure impacts.

## Generator

`generateIsland(world, seed, settings)` in `src/game/landfall.ts` returns `site` and `heightAt(x,z)`. World is the zero-based pack index. Coordinates are metres and sea level is zero. The generator runs without Babylon, the DOM or storage.

- The seed determines the warped coastline, ridges, terrain detail, landing, landmark, treasure and settlement lots. The geometry blends low-frequency simplex fields for the main outline with higher frequencies for small coves. An inland ridge rises above the graded walking route.
- Relief and beach width range from 0 to 1. Tropical, temperate, alpine and winter biomes change the surface and vegetation. Vegetation density ranges from 0 to 1 and affects grass and tree cover. Vegetation and boulders avoid the trail and building sites.
- Settlement size is none, hamlet or village. The planner fits homes along a connected street, flattens the foundations and returns clearance regions used by the scatter pass.
- The browser draws the terrain and places the walker using the same height function. The treasure hunt and camera belong to this playtest app. It has its own entry point and does not read campaign saves.

The regional shape fields and habitat filtering follow the approach in Cavecraft’s `src/gen/scenario/islands.js` and `src/gen/nature/flora.js`. The 2D simplex lattice follows the public-domain reference by Stefan Gustavson. The generation and visual review workflow used the [GameVibing skills](https://github.com/andeplane/gamevibing).

## Reproduce a playtest

Use the URL printed by Vite as the base and append one of these query strings. They all use seed 82417 in the first pack, Rose Beacon Cay. URL pack numbers start at 1, while the generator API starts at 0.

| Start | Query string | What to try |
| --- | --- | --- |
| Village lane | `?pack=1&seed=82417&settlement=hamlet&mode=walk&start=village` | Inspect the loft balcony, shutters and porch lantern. Open the map, follow the clue to the pink shells and dig. |
| Tidal grotto | `?pack=1&seed=82417&mode=walk&start=cave&light=day` | Walk through the eroded limestone passage, past the tide pool and the lantern beside the rope winch. |
| Uninhabited shore | `?pack=1&seed=82417&settlement=none&mode=walk&start=harbor` | Walk the pier and gangway onto the Pearl, turn around and walk all the way back to the beach. Every island gets this dock, including islands without a town. |
| Pearl after dark | `?pack=1&seed=82417&settlement=village&mode=walk&start=ship&light=night` | Look toward the lighthouse for its rotating beam and reflection. Walk ashore toward the lit windows under the Milky Way. |

## Where to continue

| Concern | Source |
| --- | --- |
| Seed, pack and terrain | [Island generator](../src/game/landfall.ts), [coastline and grotto plan](../src/game/landfallCoast.ts), [simplex noise](../src/game/landfallNoise.ts) |
| Settlement layout and docking | [Town lots and streets](../src/game/landfallTown.ts), [dock placement and walkable heights](../src/game/landfallDock.ts), [pier and Pearl assembly](../src/render/landfallHarbor.ts) |
| Lighting and close-up scenery | [Scene assembly](../src/render/landfallView.ts), [sky](../src/render/landfallSky.ts), [water](../src/render/landfallWater.ts), [beacon](../src/render/landfallBeacon.ts), [grotto](../src/render/landfallGrotto.ts), [village](../src/render/landfallTown.ts) |
| Exploration and treasure | [Atlas entry point](main.ts), [chart](../src/ui/landfallTreasureMap.ts), [shovel strikes](../src/render/landfallDigging.ts), [ground deformation](../src/render/landfallExcavation.ts) |

For campaign integration, start with `generateIsland` and the pack catalogue. The Atlas entry point currently owns the transition between survey and walking, the player's position and the in-memory dig counter. The next gameplay step is to enter a landfall from a pack's final voyage, persist the recovered treasure in that voyage's save, and return the player to the ship. The existing expedition can be replayed independently while those transitions are developed.

Run `npm test` and `npm run islands:build` from `demos/broadside` after changing the generator or renderer. The dock regression test samples the complete route from the landing to the deck over 256 combinations. For a visual regression check, use the four starts above and open the chart at 390 × 844, 320 × 568 and 667 × 320. These sizes were checked in the browser during development. Physical phone handling and performance still need a device playtest.
