import { Rng } from "../sim/rng";
import { PerlinNoise } from "../sim/noise";
import { distance } from "../sim/math";
import type { IslandDef } from "./levels";
import type { VoyageDef } from "./voyage";
import { voyageWeather } from "./weather";

export const OPEN_SEA_SEED = 81723;
export const OPEN_SEA_BOUNDS = 1600;
export const SEA_LANDMARKS = [
  { name: "Blackwater Bay", x: 53, z: 94, landmark: "harbour" },
  { name: "Smuggler’s Coast", x: -930, z: 300, landmark: "smugglers" },
  { name: "Stormbreak Isles", x: 920, z: 430, landmark: "stormkeep" },
  { name: "The Lost Isles", x: -100, z: 1130, landmark: "ruins" },
  { name: "Moonstone Reach", x: 200, z: -1050, landmark: "moonstone" },
] as const;

/** One fixed 3.2 km world. The seed belongs to the save, never to movement. */
export function generateFreeSea(seed = OPEN_SEA_SEED, pack = 0): VoyageDef {
  const world = Math.max(0, Math.min(3, Math.floor(pack)));
  const rng = new Rng(seed), noise = new PerlinNoise(seed);
  const islands: IslandDef[] = [{ pos: { x: 53, z: 94 }, radius: 25, kind: "sand", props: ["palms", "rocks"], landmark: "harbour" }];
  for (const place of SEA_LANDMARKS.slice(1)) islands.push({
    pos: { x: place.x, z: place.z }, radius: 36, kind: "sand", props: ["palms", "rocks"], landmark: place.landmark,
  });
  for (let gz = -10; gz <= 10; gz++) for (let gx = -10; gx <= 10; gx++) {
    const pos = { x: gx * 148 + rng.range(-30, 30), z: gz * 148 + rng.range(-30, 30) };
    const elevation = noise.fractal(pos.x * .0065 + 3.8, pos.z * .0065 - 1.7);
    if (elevation < .02 || Math.hypot(pos.x, pos.z) < 105 || Math.hypot(pos.x, pos.z) > 1490) continue;
    const radius = 18 + Math.max(0, elevation) * 65;
    if (islands.some(i => distance(i.pos, pos) < i.radius + radius + 36)) continue;
    const rocky = noise.at(pos.x * .015, pos.z * .015) < (world === 2 ? .12 : -.25);
    islands.push({ pos, radius, kind: rocky ? "rock" : "sand",
      props: rocky ? ["rocks", "wreck"] : rng.next() > .72 ? ["palms", "rocks", "lighthouse"] : ["palms", "rocks"] });
  }
  // Scattered exposed reefs leave generous gaps around the large islands.
  for (let i = 0; i < 100; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(130, 1490);
    const pos = { x: Math.sin(a) * r, z: Math.cos(a) * r };
    const radius = rng.range(3, 6);
    if (islands.every(other => distance(pos, other.pos) > other.radius + radius + 28))
      islands.push({ pos, radius, kind: "sea-rock", props: [] });
  }
  const gems = islands.filter(i => i.kind !== "sea-rock").map(i => {
    const a = rng.range(0, Math.PI * 2), r = i.radius + 24;
    return { x: i.pos.x + Math.sin(a) * r, z: i.pos.z + Math.cos(a) * r, found: false };
  }).filter(g => islands.every(i => distance(g, i.pos) > i.radius + 14));
  return {
    index: world * 10, pack: world, freeSailing: true,
    weather: voyageWeather(world === 2 ? 23 : world * 10),
    finish: { x: 0, z: 9999 }, gems, forts: [], whirlpools: [], kraken: null,
    level: {
      id: `free-sea-${seed >>> 0}`, seed, name: "The open sea",
      intro: "Set sail from Blackwater Bay. Open the sea chart to explore the islands. Your position and discoveries are saved.",
      bounds: OPEN_SEA_BOUNDS, wind: { direction: 1.3, strength: .9 }, islands,
      player: { ship: "galleon", pos: { x: 0, z: 0 }, heading: 0 },
      waves: [{ title: "Free sailing", subtitle: "One world. Your own adventure.", enemies: [] }],
      repairBetweenWaves: 0,
    },
  };
}
