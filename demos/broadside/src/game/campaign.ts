/** Level IDs and collectible model IDs are separate: forty voyages, four world prizes. */
export const LEVELS_PER_WORLD = 10;
export const WORLD_COUNT = 4;
export const TOTAL_LEVELS = LEVELS_PER_WORLD * WORLD_COUNT;
export const CAMPAIGN_VERSION = 2;
export const worldOf = (level: number): number =>
  Math.floor(level / LEVELS_PER_WORLD);
export const stageOf = (level: number): number => level % LEVELS_PER_WORLD;
export const worldLevels = (world: number): number[] =>
  Array.from(
    { length: LEVELS_PER_WORLD },
    (_, n) => world * LEVELS_PER_WORLD + n,
  );
export const worldStars = (
  voyages: Record<string, { stars: number }>,
  world: number,
): number =>
  worldLevels(world).reduce((sum, i) => sum + (voyages[i]?.stars ?? 0), 0);
export function completedWorld(voyages: Record<string, unknown>, world: number): boolean {
  return worldLevels(world).every((i) => !!voyages[i]);
}
export function worldUnlocked(voyages: Record<string, unknown>, world: number): boolean {
  return world === 0 || (world > 0 && world < WORLD_COUNT && completedWorld(voyages, 0));
}
export function levelUnlocked(
  voyages: Record<string, unknown>,
  index: number,
): boolean {
  return (
    index >= 0 &&
    index < TOTAL_LEVELS &&
    worldUnlocked(voyages, worldOf(index)) &&
    (index === 0 || !!voyages[index] || !!voyages[index - 1])
  );
}
