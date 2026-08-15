// Guided hints: a sequence of objectives that react to what the player
// actually does. Level 1 runs the full tutorial sequence; all levels get the
// build-phase prompt. Rendered by the Hud's hint line.

import { CONFIG } from '../config'
import type { DomainMap } from '../engine/map'
import type { Engine } from '../engine/Engine'
import { CELL } from '../sim/core/constants'
import type { BuildInput } from './input'

export interface HintCtx {
  match: Engine
  input: BuildInput
}

interface Hint {
  text: (ctx: HintCtx) => string
  done: (ctx: HintCtx) => boolean
}

/**
 * Is this inlet arm actually cut off from the domain? True when some column in
 * the left half is fully blocked across the arm's rows — checks the real map,
 * not a wall-cell count, so the hint only advances when the seal would work.
 */
function armSealed(map: DomainMap, arm: number): boolean {
  const seg = map.inletSegments[arm]
  if (!seg) return false
  for (let x = 1; x < map.width >> 1; x++) {
    let blocked = true
    for (let y = seg.y0; y <= seg.y1; y++) {
      const t = map.cellType[y * map.width + x]
      if (t === CELL.OPEN || t === CELL.INLET || t === CELL.OUTLET) {
        blocked = false
        break
      }
    }
    if (blocked) return true
  }
  return false
}

// Every early step also completes once the match outruns it (waveIndex): the
// tutorial teaches one good opening, it never blocks a player doing their own.
const tutorial: Hint[] = [
  {
    text: () =>
      'The water flows left → right, and the enemy will ride it. Press 1 and DRAG walls to seal the TOP and BOTTOM streams right at their mouths — leave the middle open.',
    done: ({ match }) =>
      (armSealed(match.map, 0) && armSealed(match.map, match.map.inletSegments.length - 1)) ||
      match.waveIndex >= 1,
  },
  {
    text: () =>
      'Sealed. Anything spawning behind a seal SUFFOCATES in still water — and still pays bounty. Now press 2 and click ON the middle stream: the Neutralizer kills what crosses its ring.',
    done: ({ match }) => match.towers.some((t) => t.type === 'neutralizer') || match.waveIndex >= 1,
  },
  {
    text: ({ match }) => `Ready. Press SPACE to call Wave 1 (auto in ${Math.ceil(match.buildTicksLeft / 60)}s).`,
    done: ({ match }) => match.phase !== 'build' || match.waveIndex > 0,
  },
  {
    text: () =>
      `The pink motes are SPORES — the enemy. Each one reaching the right edge costs a LIFE; each kill pays ${CONFIG.enemies.bounty}g. HOLD the RIGHT mouse button to blast water and shove them off course.`,
    done: ({ match }) => match.waveIndex >= 1 || match.phase === 'over',
  },
  {
    text: () =>
      'Between waves: build. Another Neutralizer deepens the gauntlet; walls re-route the river itself. Repaint a wall to repair it; press 5 and drag to ERASE walls (half refund). Watch WATER INTAKE (top right) — the base drinks from this river.',
    done: ({ match }) => match.waveIndex >= 2 || match.phase === 'over',
  },
  {
    text: () =>
      'SURGE waves slam the current — spores ride faster, walls strain, and the orange glow is pressure building. Brace, jet, repair.',
    done: ({ match }) => match.phase === 'over',
  },
]

const buildPromptOnly: Hint[] = [
  {
    text: ({ match }) => `Build phase — press SPACE to call the first wave (auto in ${Math.ceil(match.buildTicksLeft / 60)}s).`,
    done: ({ match }) => match.phase !== 'build' || match.waveIndex > 0,
  },
]

export class Hints {
  private readonly sequence: Hint[]
  private index = 0

  constructor(levelNum: number) {
    this.sequence = levelNum === 1 ? tutorial : buildPromptOnly
  }

  /** Current hint text, or null when the sequence is exhausted. */
  current(ctx: HintCtx): string | null {
    while (this.index < this.sequence.length && this.sequence[this.index].done(ctx)) this.index++
    if (this.index >= this.sequence.length) return null
    return this.sequence[this.index].text(ctx)
  }
}
