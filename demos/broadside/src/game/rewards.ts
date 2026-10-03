import { worldOf, worldLevels } from "./campaign";
import type { Progress } from "./progress";

export const GOLD_PER_LEVEL = 1000;
/** One keepsake for each of the four worlds; IDs refer to sculpted relic models. */
export const WORLD_RELICS = [2, 5, 8, 11] as const;
export const CAVE_ITEMS = [0, ...WORLD_RELICS];
export interface VoyageReward {
  gold: number;
  totalGold: number;
  special: number | null;
  model: number;
}
export function goldTotal(progress: Progress): number {
  return Object.keys(progress.voyages).length * GOLD_PER_LEVEL;
}
export function worldGold(progress: Progress, world: number): number {
  return worldLevels(world).filter((level) => !!progress.voyages[level]).length * GOLD_PER_LEVEL;
}
export function worldComplete(progress: Progress, world: number): boolean {
  return worldLevels(world).every((i) => !!progress.voyages[i]);
}
/** Older saves retain every completed level and convert them to gold and world prizes. */
export function syncRewards(progress: Progress): void {
  progress.relics = WORLD_RELICS.filter(
    (_, world) =>
      progress.relics.includes(WORLD_RELICS[world]!) ||
      worldComplete(progress, world),
  );
}
export function awardVoyage(
  progress: Progress,
  index: number,
  stars: number,
  gems: number,
): VoyageReward {
  const previous = progress.voyages[index];
  const world = worldOf(index);
  const hadSpecial =
    progress.relics.includes(WORLD_RELICS[world]!) ||
    worldComplete(progress, world);
  progress.voyages[index] = {
    stars: Math.max(previous?.stars ?? 0, stars),
    gems: Math.max(previous?.gems ?? 0, gems),
  };
  syncRewards(progress);
  const special =
    !hadSpecial && worldComplete(progress, world) ? WORLD_RELICS[world]! : null;
  return {
    gold: previous ? 0 : GOLD_PER_LEVEL,
    totalGold: goldTotal(progress),
    special,
    model: special ?? 0,
  };
}
