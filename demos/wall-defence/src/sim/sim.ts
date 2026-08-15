// step(state, tickEvents) — the sim's only public entry. Fully determined by
// (seed, event log). Intra-tick order: events → waves → ball movement →
// cuts → gnaw → towers → death sweep → drains → claims recompute → income.
// A non-empty currentOffer freezes the tick counter (pause lives in the sim).

import { CELLS, INCOME_BASE, INCOME_PCT_DIVISOR, OVERCLAIM_CENTS_PER_PCT, QUOTA_PCT, TICK_HZ, Upgrade } from './constants'
import type { SimEvent } from './events'
import { gnawStep, moveBalls, sweepDead } from './balls'
import { expireDrains, openTouchedDrains, recomputeClaims } from './claims'
import { fireTowers, placeTower, sellTower, upgradeTower } from './towers'
import { maybeOffer, pickUpgrade } from './upgrades'
import { updateWaves } from './waves'
import { PLAYING, emptyFx, type GameState } from './state'
import { advanceCuts, startCut } from './walls'

export function step(s: GameState, events: SimEvent[]): void {
  if (s.status !== PLAYING) return

  // 1. Apply events. While an offer is pending, only PickUpgrade is legal.
  for (const e of events) {
    if (s.currentOffer.length > 0 && e.kind !== 'PickUpgrade') continue
    switch (e.kind) {
      case 'StartCut':
        startCut(s, e.cx, e.cy, e.orient)
        break
      case 'PlaceTower':
        placeTower(s, e.cell, e.tower)
        break
      case 'UpgradeTower':
        upgradeTower(s, e.id)
        break
      case 'SellTower':
        sellTower(s, e.id)
        break
      case 'PickUpgrade':
        pickUpgrade(s, e.choice)
        break
    }
  }

  // 2. Frozen while an offer is up: the tick does not advance.
  if (s.currentOffer.length > 0) return

  s.fx = emptyFx()
  s.tick++

  // 3. Waves (telegraph, quota loss check, spawns).
  let ballsChanged = updateWaves(s)
  if (s.status !== PLAYING) return

  // 4. Ball movement (collects draining cells that were touched).
  const drainTouched: number[] = []
  moveBalls(s, drainTouched)

  // 5. Cuts advance (shatters, completions, sparking edge).
  let topologyChanged = advanceCuts(s)

  // 6. Breakers gnaw.
  if (gnawStep(s)) topologyChanged = true

  // 7. Towers fire.
  fireTowers(s)

  // 8. Death sweep (splitter fragments spawn here).
  if (sweepDead(s)) ballsChanged = true

  // 9. Drains: instant-unclaim on touch, then timer expiry.
  if (openTouchedDrains(s, drainTouched)) topologyChanged = true
  if (expireDrains(s)) topologyChanged = true

  // 10. Region recompute on any relevant change.
  if (topologyChanged || ballsChanged) {
    recomputeClaims(s)
    maybeOffer(s)
  }

  // 11. Income once per second.
  if (s.tick % TICK_HZ === 0) {
    const pct = Math.floor((s.claimedCells * 100) / CELLS)
    let income = INCOME_BASE + Math.floor(pct / INCOME_PCT_DIVISOR)
    if ((s.upgrades & (1 << Upgrade.OverclaimDividend)) !== 0) {
      const quotaPct = s.wave >= 1 ? QUOTA_PCT[Math.min(s.wave, QUOTA_PCT.length) - 1] : 0
      if (pct > quotaPct) income += OVERCLAIM_CENTS_PER_PCT * (pct - quotaPct)
    }
    s.money += income
  }
}

export { createState, hashState } from './state'
