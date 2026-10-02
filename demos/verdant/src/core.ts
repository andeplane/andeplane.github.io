// Public headless entry point. Bundles to one ordinary ESM file with no runtime dependencies.
export * from './engine';
export { levels, getLevel, nextLevel } from './levels';
export { conditions, missionOf, equipmentInfo } from './simulation';
export type { GameState, Species, Equipment } from './simulation';
export type { Point, Deposit, Rock, RootWorld } from './rootWorld';
