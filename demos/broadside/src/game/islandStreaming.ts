import type { IslandDef } from "./levels";
import { seaDistance, type Vec2 } from "../sim/math";

/** Only 3D scenery streams; world coordinates and collision islands never change. */
export function islandStreamingPlan(islands: readonly IslandDef[], focus: Vec2, active: ReadonlySet<number>, bounds?: number) {
  const nearest = islands.map((i, index) => ({ index, d: seaDistance(focus, i.pos, bounds) - i.radius }))
    .sort((a, b) => a.d - b.d);
  return {
    load: nearest.filter(i => i.d < 420 && !active.has(i.index)).map(i => i.index),
    unload: nearest.filter(i => i.d > 560 && active.has(i.index)).map(i => i.index),
  };
}
