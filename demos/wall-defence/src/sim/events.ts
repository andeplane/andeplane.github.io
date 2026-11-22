// Player input events. A run is fully determined by (seed, event log).
// Log format: { version, seed, events: [{ tick, e }...] } — intra-tick order
// is array order. Ticks frozen on a pending offer don't appear in the log.

import type { TowerType } from './constants'

export type SimEvent =
  | { kind: 'StartCut'; cx: number; cy: number; orient: 0 | 1 } // 0 = vertical line, 1 = horizontal line
  | { kind: 'PlaceTower'; cell: number; tower: TowerType }
  | { kind: 'UpgradeTower'; id: number }
  | { kind: 'SellTower'; id: number }
  | { kind: 'PickUpgrade'; choice: number } // index into currentOffer

export interface LoggedEvent {
  tick: number
  e: SimEvent
}

export interface EventLog {
  version: number
  seed: number
  events: LoggedEvent[]
}

export const LOG_VERSION = 1
