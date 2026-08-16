// The campaign: eight arenas, each a pure-data level (terrain + wave table +
// numbers). Levels introduce towers (towerDefs.unlockLevel) and spores
// (sporeDefs.unlockLevel) as the player progresses; passing a level with at
// least one star unlocks the next (ui/progress.ts).
//
// nominalFlux is each arena's measured natural open-flow intake (scratchpad
// flux-measure.mjs) — re-measure whenever inlet.choke or an arena changes.

import type { TerrainShape } from './map'
import type { SporeId } from './sporeDefs'

export interface WaveConfig {
  count: number
  hp: number
  /** Ticks between spawns. */
  interval: number
  /** Inlet arms (segment indices) this wave rides. */
  arms: readonly number[]
  /** Spore types in this wave (uniform pick per spawn); default standard. */
  types?: readonly SporeId[]
  /** Surge waves slam the water hammer while spores ride the faster current. */
  surge?: boolean
}

export interface LevelConfig {
  name: string
  description: string
  lives: number
  startingGold: number
  /** Arena bedrock (fractional coords); omitted = the default pillars. */
  terrain?: readonly TerrainShape[]
  /** This arena's natural open-flow intake (thirst threshold scales off it). */
  nominalFlux?: number
  waves: readonly WaveConfig[]
}

export const LEVELS: readonly LevelConfig[] = [
  {
    name: 'First Spores',
    description: 'Open water, three pillars. Learn the tools.',
    lives: 15,
    startingGold: 165,
    nominalFlux: 13.8,
    terrain: [
      { kind: 'disc', x: 0.32, y: 0.34, r: 13 },
      { kind: 'disc', x: 0.46, y: 0.68, r: 16 },
      { kind: 'disc', x: 0.62, y: 0.3, r: 11 },
    ],
    waves: [
      { count: 8, hp: 1, interval: 32, arms: [1] },
      { count: 12, hp: 1, interval: 26, arms: [1, 2] },
      { count: 14, hp: 1.4, interval: 24, arms: [0, 1, 2] },
      { count: 14, hp: 1.6, interval: 22, arms: [0, 1, 2], surge: true },
      { count: 18, hp: 1.8, interval: 18, arms: [0, 1, 2], surge: true },
    ],
  },
  {
    name: 'Crosscurrents',
    description: 'A serpentine canyon — and something in it swims for your throat.',
    lives: 12,
    startingGold: 165,
    nominalFlux: 4.2,
    terrain: [
      { kind: 'bar', x0: 0.24, y0: 1, x1: 0.24, y1: 0.44, w: 8 },
      { kind: 'bar', x0: 0.47, y0: 0, x1: 0.47, y1: 0.56, w: 8 },
      { kind: 'bar', x0: 0.7, y0: 1, x1: 0.7, y1: 0.44, w: 8 },
      { kind: 'disc', x: 0.86, y: 0.6, r: 9 },
    ],
    waves: [
      { count: 10, hp: 1.2, interval: 26, arms: [0, 2] },
      { count: 12, hp: 1.4, interval: 22, arms: [0, 1, 2], types: ['standard', 'swimmer'] },
      { count: 16, hp: 2.2, interval: 18, arms: [1], surge: true },
      { count: 16, hp: 2.2, interval: 17, arms: [0, 1, 2], types: ['standard', 'swimmer'] },
      { count: 16, hp: 2.6, interval: 15, arms: [0, 2], types: ['swimmer'], surge: true },
      { count: 22, hp: 3, interval: 13, arms: [0, 1, 2], types: ['standard', 'swimmer'], surge: true },
    ],
  },
  {
    name: 'Water Hammer',
    description: 'Everything funnels through one throat — and heavy things ride the surge.',
    lives: 10,
    startingGold: 150,
    nominalFlux: 8.2,
    terrain: [
      { kind: 'disc', x: 0.4, y: 1.08, r: 108 },
      { kind: 'disc', x: 0.4, y: -0.08, r: 108 },
      { kind: 'disc', x: 0.62, y: 0.3, r: 8 },
      { kind: 'disc', x: 0.66, y: 0.62, r: 10 },
      { kind: 'disc', x: 0.8, y: 0.42, r: 7 },
    ],
    waves: [
      { count: 10, hp: 1.4, interval: 24, arms: [0, 1, 2] },
      { count: 12, hp: 1.8, interval: 20, arms: [0, 1, 2], types: ['standard', 'swimmer'] },
      { count: 6, hp: 2, interval: 40, arms: [1], types: ['sinker'] },
      { count: 16, hp: 2.4, interval: 16, arms: [0, 1, 2], surge: true },
      { count: 14, hp: 2.6, interval: 18, arms: [0, 2], types: ['standard', 'sinker'] },
      { count: 18, hp: 3, interval: 14, arms: [0, 1, 2], types: ['swimmer', 'sinker'], surge: true },
      { count: 22, hp: 3.4, interval: 12, arms: [0, 1, 2], types: ['standard', 'swimmer', 'sinker'], surge: true },
    ],
  },
  {
    name: 'The Delta',
    description: 'Braided streams split and recombine — and the enemy splits with them.',
    lives: 10,
    startingGold: 175,
    nominalFlux: 7.8,
    terrain: [
      { kind: 'disc', x: 0.28, y: 0.24, r: 13 },
      { kind: 'disc', x: 0.28, y: 0.76, r: 13 },
      { kind: 'bar', x0: 0.5, y0: 0, x1: 0.5, y1: 0.3, w: 7 },
      { kind: 'bar', x0: 0.5, y0: 0.7, x1: 0.5, y1: 1, w: 7 },
      { kind: 'disc', x: 0.7, y: 0.5, r: 15 },
    ],
    waves: [
      { count: 12, hp: 1.6, interval: 22, arms: [0, 1, 2] },
      { count: 6, hp: 2, interval: 34, arms: [1], types: ['splitter'] },
      { count: 16, hp: 2.2, interval: 18, arms: [0, 2], types: ['standard', 'splitter'] },
      { count: 14, hp: 2.6, interval: 16, arms: [0, 1, 2], types: ['splitter', 'swimmer'], surge: true },
      { count: 18, hp: 2.8, interval: 14, arms: [0, 1, 2], types: ['standard', 'splitter'] },
      { count: 20, hp: 3.2, interval: 12, arms: [0, 1, 2], types: ['splitter', 'sinker'], surge: true },
    ],
  },
  {
    name: 'Maelstrom',
    description: 'A broken ring of rock breeds swarms. Let the water conduct your answer.',
    lives: 10,
    startingGold: 190,
    nominalFlux: 13,
    terrain: [
      { kind: 'disc', x: 0.5, y: 0.18, r: 10 },
      { kind: 'disc', x: 0.36, y: 0.36, r: 9 },
      { kind: 'disc', x: 0.36, y: 0.64, r: 9 },
      { kind: 'disc', x: 0.5, y: 0.82, r: 10 },
      { kind: 'disc', x: 0.64, y: 0.5, r: 11 },
    ],
    waves: [
      { count: 20, hp: 1.2, interval: 14, arms: [0, 1, 2] },
      { count: 28, hp: 1.3, interval: 10, arms: [0, 2], types: ['standard', 'swimmer'] },
      { count: 8, hp: 2.4, interval: 22, arms: [1], types: ['splitter'] },
      { count: 36, hp: 1.5, interval: 8, arms: [0, 1, 2], surge: true },
      { count: 30, hp: 1.8, interval: 9, arms: [0, 1, 2], types: ['standard', 'swimmer', 'splitter'] },
      { count: 44, hp: 2, interval: 7, arms: [0, 1, 2], types: ['standard', 'swimmer'], surge: true },
    ],
  },
  {
    name: 'Blackwater',
    description: 'Almost nothing to see out there. That is the problem.',
    lives: 8,
    startingGold: 190,
    nominalFlux: 13.9,
    terrain: [
      { kind: 'disc', x: 0.34, y: 0.55, r: 9 },
      { kind: 'disc', x: 0.58, y: 0.28, r: 8 },
      { kind: 'disc', x: 0.7, y: 0.7, r: 10 },
    ],
    waves: [
      { count: 12, hp: 1.8, interval: 20, arms: [0, 1, 2] },
      { count: 8, hp: 1.6, interval: 26, arms: [1], types: ['phantom'] },
      { count: 16, hp: 2.2, interval: 16, arms: [0, 2], types: ['standard', 'phantom'] },
      { count: 14, hp: 2.6, interval: 15, arms: [0, 1, 2], types: ['phantom', 'swimmer'], surge: true },
      { count: 18, hp: 3, interval: 13, arms: [0, 1, 2], types: ['standard', 'phantom'] },
      { count: 22, hp: 3.4, interval: 11, arms: [0, 1, 2], types: ['phantom', 'swimmer', 'splitter'], surge: true },
    ],
  },
  {
    name: 'The Locks',
    description: 'Four gates, four chambers. Every one is a killing floor — theirs or yours.',
    lives: 8,
    startingGold: 200,
    nominalFlux: 3,
    terrain: [
      { kind: 'bar', x0: 0.2, y0: 0, x1: 0.2, y1: 0.62, w: 7 },
      { kind: 'bar', x0: 0.4, y0: 1, x1: 0.4, y1: 0.38, w: 7 },
      { kind: 'bar', x0: 0.6, y0: 0, x1: 0.6, y1: 0.62, w: 7 },
      { kind: 'bar', x0: 0.8, y0: 1, x1: 0.8, y1: 0.38, w: 7 },
    ],
    waves: [
      { count: 14, hp: 2, interval: 18, arms: [0, 1, 2] },
      { count: 16, hp: 2.4, interval: 15, arms: [0, 1, 2], types: ['standard', 'swimmer'] },
      { count: 10, hp: 2.8, interval: 20, arms: [0, 2], types: ['sinker', 'phantom'] },
      { count: 18, hp: 3, interval: 13, arms: [0, 1, 2], types: ['splitter', 'swimmer'], surge: true },
      { count: 16, hp: 3.4, interval: 13, arms: [0, 1, 2], types: ['phantom', 'sinker'] },
      { count: 22, hp: 3.8, interval: 11, arms: [0, 1, 2], types: ['standard', 'swimmer', 'splitter'], surge: true },
      { count: 26, hp: 4.2, interval: 10, arms: [0, 1, 2], types: ['swimmer', 'splitter', 'phantom', 'sinker'], surge: true },
    ],
  },
  {
    name: 'The Throat',
    description: 'Everything you have met, all at once, through one narrows. Tame the flow.',
    lives: 12,
    startingGold: 220,
    nominalFlux: 9.7,
    terrain: [
      { kind: 'disc', x: 0.34, y: 1.06, r: 92 },
      { kind: 'disc', x: 0.34, y: -0.06, r: 92 },
      { kind: 'disc', x: 0.56, y: 0.32, r: 9 },
      { kind: 'disc', x: 0.6, y: 0.66, r: 11 },
      { kind: 'disc', x: 0.76, y: 0.46, r: 8 },
      { kind: 'disc', x: 0.88, y: 0.7, r: 7 },
    ],
    waves: [
      { count: 16, hp: 2.2, interval: 16, arms: [0, 1, 2] },
      { count: 20, hp: 2.6, interval: 13, arms: [0, 1, 2], types: ['standard', 'swimmer'] },
      { count: 12, hp: 3, interval: 16, arms: [0, 2], types: ['splitter', 'sinker'] },
      { count: 24, hp: 3, interval: 11, arms: [0, 1, 2], types: ['standard', 'swimmer', 'phantom'], surge: true },
      { count: 18, hp: 3.6, interval: 12, arms: [0, 1, 2], types: ['sinker', 'phantom'] },
      { count: 28, hp: 3.6, interval: 10, arms: [0, 1, 2], types: ['standard', 'swimmer', 'splitter'], surge: true },
      { count: 24, hp: 4.2, interval: 10, arms: [0, 1, 2], types: ['swimmer', 'splitter', 'phantom', 'sinker'] },
      { count: 34, hp: 4.6, interval: 8, arms: [0, 1, 2], types: ['standard', 'swimmer', 'splitter', 'phantom', 'sinker'], surge: true },
    ],
  },
]
