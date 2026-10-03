# Verdant

A full-screen botanical survival game built with Three.js and TypeScript. Guide a root network through a soil cutaway while a living plant responds to light, water, oxygen, nutrients, heat, and carbon availability. The complete deterministic game engine runs separately from graphics, in a browser or headlessly.

## Run

```sh
npm install
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/. `npm test` checks physiology, resource accounting, root exploration, replay, saves, and viable limited-resource strategies. `npm run build` type-checks and builds both the browser game and the standalone engine.

## Guided tutorial

First-time visitors automatically enter a separate practice session. Twelve short, action-driven steps teach root steering, obstacle avoidance, water and nitrogen patches, vitality and carbon reserves, watering, shade, grants and equipment, branching, and pause. Glowing world markers follow the 3D camera. Each practical step checks real engine state before advancing. Time stops while reading and while waiting to begin root growth. Training never overwrites the campaign save or spends its supplies. Skip restores the saved plant; T restarts training from any screen. Completed training is remembered locally.

## Play

Enter or click to begin. Guide the root tip with WASD, arrow keys, or a destination click in the soil. Rocks block extension. Reaching a blue moisture patch or gold nitrogen patch establishes gradual uptake; patches contain finite resources. Extension consumes carbohydrate reserves. B branches from an existing root; Tab switches active tips.

Select a tool with 1–6, then apply it directly to the habitat:

1. Root growth: guide the active tip.
2. Water: apply 100 mL of your finite allowance.
3. Nutrients: add mineral nitrogen and dissolved salts (€12), or click a flytrap trap to supply prey (€8).
4. Shade: cycle 0%, 20%, 40% shade.
5. Ventilation: toggle passive cooling, which also affects humidity.
6. Prune: click the tomato canopy to remove 12% of tomato biomass; decreases water demand and light capture.

P or Space pauses. Right drag rotates the habitat; wheel or two fingers zoom. F cycles natural, water, and carbon views. I shows measurements. E opens equipment; 1–4 buys an item. L toggles an installed grow light. H opens the science guide. J opens observations. M chooses assignments; 1–6 selects an unlocked level. R restarts with the original grant. + cycles 1×, 4×, and 12× time speed. Escape opens pause or returns to play. Clicking the drawn tool belt and equipment controls also works. F9 exports an engine checkpoint; F10 imports one and pauses for review.

A level succeeds at its deadline if biomass meets its target, vitality is at least 75%, and roots have connected the required resource patches. Vitality below 15% ends the attempt early. Each win unlocks the next assignment. Earn one star for survival, another for ≥90% final vitality, and another for preserving at least 20% of the grant, 15% of the water allowance, and 10% of the electricity allowance. Replay unlocked levels to improve your best result.

| Level ID | Habitat | Plant | Days | Biomass | Patches | Main problem |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `first-roots` | First roots | Tomato | 10 | 6.5 g | 2 | Establish roots before a heatwave |
| `after-sunset` | After sunset | Prickly pear | 18 | 4.0 g | 2 | CAM carbon storage and careful watering |
| `hungry-bog` | The hungry bog | Venus flytrap | 16 | 5.8 g | 3 | Moisture and nitrogen on a small grant |
| `under-glass` | Heat under glass | Tomato | 12 | 8.0 g | 3 | Extended heat, limited water, cooling |
| `warm-nights` | Warm nights | Prickly pear | 20 | 4.0 g | 3 | Night respiration and finite fan energy |
| `clouded-bog` | The clouded bog | Venus flytrap | 18 | 7.1 g | 3 | Cloud-limited photosynthesis and timed lighting |

Levels have distinct terrain and resource layouts. A seed makes small, reproducible changes to patch placement. Research grants are provided at the start of each assignment; plants do not generate money.

Current state and campaign stars are saved locally to `verdant.game.v3` and `verdant.game.v3.campaign`. The game starts with a briefing on reload and pauses on window blur. The `?qa=1` URL uses an isolated QA save. Checkpoints include root geometry, remaining resources, physiology, commands, and terminal results.

## Headless engine

`src/core.ts` is the public API. `src/engine.ts` owns commands, fixed-step time, root construction, obstacle collisions, resource uptake, physiology, mortality, deadline outcomes, stars, replay, and saves. `App.tsx` translates input and wall time into engine calls; `PlantScene.tsx` and `GameHUD.tsx` only render state. No graphics, DOM, timers, or random calls are dependencies of the engine.

```sh
npm run headless -- --level all --runs 12
npm run headless -- --level under-glass --policy no-equipment
npm run headless -- --level warm-nights --record artifacts/run.json
npm run headless -- --replay artifacts/run.json
npm run benchmark -- 12
npm run build:engine
```

The build produces `dist-engine/verdant.js`, a standalone ESM module with no runtime dependencies. It imports directly in Node or a browser worker:

```js
import { createSession, dispatch, step, serialize } from './dist-engine/verdant.js';
let game = createSession('first-roots', 42);
const action = dispatch(game, { type: 'target', point: { x: -.2, y: -.9 } });
game = action.session; // action.accepted and action.message explain validation
game = step(game, 24); // simulation hours; no waiting or rendering
console.log(serialize(game));
```

Time is accumulated into quarter-hour ticks, with four geometric subdivisions per tick to prevent root tunneling. Small or large time batches give identical results. `dispatch` validates commands and records both accepted and rejected actions. `replay(levelId, seed, commands, ticks)` reproduces a command trace. `serialize` / `deserialize` transfer a complete session between the browser and headless engine. `src/solver.ts` is a reference player using the same public commands, not privileged state changes.

## Validation

38 tests cover the rules, six winning command replays, invalid actions, resource conservation, checkpoint corruption, and campaign progression. The recorded 360-episode policy matrix spans six levels, five policies, and twelve seeds: the reference player won all 72 runs without rejected commands; neglect, repeated flooding, and persistent shade lost all their runs; the policy without equipment lost all three advanced levels.

The engine-only benchmark replayed 720 complete games at approximately 104 games/second on the development machine. That includes roots, resources, physiology, and outcomes, and excludes rendering and reference-player pathfinding. Timing depends on hardware and process load. Full policy outcomes, rejection counts, and timing are in `artifacts/headless-validation.json`. These checks demonstrate solvability and consequences for bad decisions; human difficulty still depends on player experience.

Browser verification imported a headless checkpoint, played the remaining hour to a three-star win, unlocked and selected the cactus level, restored it after reload, and bought equipment through keyboard controls. A browser-exported JSON checkpoint also passed the standalone engine's save validator. The live 3D habitat was checked at the normal window size and at 390 × 844; portrait framing retains the full soil cutaway. Production build and all 38 tests passed.

## Scientific model

The numerical rates and objectives are tuned for gameplay. This is a teaching simulation, not a validated crop prediction model or real plant-care guidance.

- Physiology is integrated in quarter-hour steps. Daylight controls photon flux; shade lowers flux. Temperature and relative humidity give vapor-pressure deficit through the saturation-vapor-pressure equation.
- C₃ assimilation responds to light, stomatal conductance, available nitrogen, temperature, vitality, and salinity. Respiration runs day and night with an approximate temperature Q10 response.
- Carbohydrates are tracked separately from mineral nitrogen. Biomass construction consumes carbohydrates and nitrogen. Player-directed root extension also costs carbohydrates.
- The CAM cactus has a separate acid-carbon pool replenished at night and used for daytime assimilation, plus a tissue-water reservoir. This simplified treatment does not represent every CAM phase or acclimation behavior.
- Moisture, drainage, evaporation, transpiration, and oxygen limitation are tracked in one mixed 2 L equivalent root zone. The rendered habitat is a spatial exploration abstraction; geometry is not a volumetric reconstruction of that vessel. Root extension reaches local, finite resource patches whose uptake supplies the mixed zone. Root-length display uses illustrative centimetres.
- Soil saturation, root oxygen, vitality, and salinity are normalized teaching indices, not calibrated laboratory measurements. The underlying rates are not species-validated.
- Only nitrogen is tracked explicitly among mineral nutrients. Soil pH, microbes, symbioses, pathogens, flowering, dormancy, and reproductive cycles are not simulated.
- Flytrap prey makes nitrogen available immediately with a carbohydrate cost. Actual digestion is gradual. Mineral feeding increases a salt-stress index; prey is the species-appropriate default tool.
- Lamp energy is accounted at 35 W during its daytime schedule, and powered ventilation at up to 12 W. Equipment purchases and supplies draw from fixed mission grants. Plants do not generate money.
- The plant and decorative root geometry is illustrative. The controllable root network and obstacles are real game state.

## Scientific references

- [OpenStax: Photosynthesis](https://openstax.org/books/biology-2e/pages/8-1-overview-of-photosynthesis)
- [OpenStax: Water and solute transport](https://openstax.org/books/biology-2e/pages/30-5-transport-of-water-and-solutes-in-plants)
- [OpenStax: Plant nutritional requirements](https://openstax.org/books/biology-2e/pages/31-1-nutritional-requirements-of-plants)
- [Ontario Ministry of Agriculture: Tomato irrigation](https://www.ontario.ca/page/irrigation-scheduling-tomatoes)
- [Arizona State University: CAM plants](https://askabiologist.asu.edu/cam-plants)
- [Royal Botanic Gardens, Kew: Venus flytrap](https://www.kew.org/plants/venus-flytrap)

All visuals are generated with native geometry, materials, lighting, and procedural textures. There are no photographic or generated bitmap assets. Scientific sources support the mechanisms, not the game's numerical parameterization.
