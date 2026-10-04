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
  return (Object.keys(progress.voyages).length + progress.fishing.chests.length) * GOLD_PER_LEVEL;
}
export function worldGold(progress: Progress, world: number): number {
  return (worldLevels(world).filter((level) => !!progress.voyages[level]).length + progress.fishing.chests.filter(c => c.world === world).length) * GOLD_PER_LEVEL;
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
  if (!previous) progress.cargo.push(index);
  if (special !== null) progress.cargoRelics.push(special);
  return {
    gold: previous ? 0 : GOLD_PER_LEVEL,
    totalGold: goldTotal(progress),
    special,
    model: special ?? 0,
  };
}

/** Completion and total wealth include cargo. The cave shows only delivered chests. */
export function caveProgress(progress: Progress): Progress {
  const pending = new Set(progress.cargo);
  return {
    ...progress,
    voyages: Object.fromEntries(Object.entries(progress.voyages).filter(([i]) => !pending.has(Number(i)))),
    relics: progress.relics.filter(id => !progress.cargoRelics.includes(id)),
    cargo: [],
    cargoRelics: [],
    fishing: { ...progress.fishing, chests: progress.fishing.chests.filter(c => c.delivered) },
  };
}
export function deliverChest(progress: Progress, level: number): boolean {
  if (level < 0) {
    const chest = progress.fishing.chests[-level-1];
    if (!chest || chest.delivered) return false;
    chest.delivered = true; return true;
  }
  const i = progress.cargo.indexOf(level);
  if (i < 0) return false;
  progress.cargo.splice(i, 1);
  progress.cargoRelics = progress.cargoRelics.filter(id => progress.cargo.some(level => WORLD_RELICS[worldOf(level)] === id));
  return true;
}

/** Negative IDs refer to fishing chests; campaign level IDs retain their old meaning. */
export function cargoChests(progress: Progress): number[] {
  return [...progress.cargo, ...progress.fishing.chests.flatMap((c,i)=>c.delivered?[]:[-i-1])];
}
export function chestWorld(progress: Progress, id:number): number {
  return id < 0 ? progress.fishing.chests[-id-1]!.world : worldOf(id);
}
export function awardCatch(progress: Progress, kind:'fish'|'chest', world:number): void {
  if(kind==='fish') progress.fishing.fish++;
  else progress.fishing.chests.push({world, delivered:false});
}
