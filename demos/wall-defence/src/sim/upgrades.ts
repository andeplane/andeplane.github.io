// Pick-1-of-3 offers. The daily seed fixes a permutation of the pool;
// each pick deals the next up-to-3 unowned upgrades in permutation order.
// Empty pool → the queued pick is skipped (no pause).

import { type GameState, hasUpgrade } from './state'

export const UPGRADE_INFO: { name: string; desc: string }[] = [
  { name: 'Sparking edge', desc: 'Growing wall heads zap the nearest ball for 1 dmg/s.' },
  { name: 'Twin cut', desc: 'Run two cuts at the same time.' },
  { name: 'Detonating claims', desc: 'Sealing a region deals 3 damage to balls within 2 cells.' },
  { name: 'Armored walls', desc: 'Each growing half survives one ball hit.' },
  { name: 'Fast hands', desc: 'Walls grow 40% faster.' },
  { name: 'Fresh paint', desc: 'New walls are breaker-proof for 15 s.' },
  { name: 'Garrison', desc: 'Claims of 4%+ of the board spawn a free turret.' },
  { name: 'Overclaim dividend', desc: '+2¢/s for every % above the current quota.' },
]

// Fill currentOffer from the queue if empty. Deterministic.
export function maybeOffer(s: GameState): void {
  while (s.currentOffer.length === 0 && s.pendingPicks > 0) {
    const unowned = s.offerPerm.filter((u) => !hasUpgrade(s, u))
    if (unowned.length === 0) {
      s.pendingPicks = 0
      return
    }
    s.currentOffer = unowned.slice(0, 3)
    return
  }
}

export function pickUpgrade(s: GameState, choice: number): boolean {
  if (s.currentOffer.length === 0) return false
  if (choice < 0 || choice >= s.currentOffer.length) return false
  const u = s.currentOffer[choice]
  s.upgrades |= 1 << u
  s.currentOffer = []
  s.pendingPicks--
  maybeOffer(s)
  return true
}
