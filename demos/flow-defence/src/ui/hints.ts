// Guided hints: a sequence of objectives that react to what the player
// actually does. Level 1 runs the full tutorial sequence; all levels get the
// build-phase prompt. Rendered by the Hud's hint line.

import { CONFIG } from '../config'
import type { Engine } from '../engine/Engine'
import type { BuildInput } from './input'

export interface HintCtx {
  match: Engine
  input: BuildInput
}

interface Hint {
  text: (ctx: HintCtx) => string
  done: (ctx: HintCtx) => boolean
}

const tutorial: Hint[] = [
  {
    text: () =>
      'The water flows left → right, and the spores will ride it. Press 1 and DRAG walls to seal the TOP and BOTTOM streams near the inlet — leave the middle open.',
    done: ({ match }) => match.wallCellsBuilt >= 80,
  },
  {
    text: () => 'Good — everything must ride the middle river now. Press 2 and click ON that river: the Neutralizer kills spores inside its ring.',
    done: ({ match }) => match.towers.some((t) => t.type === 'neutralizer'),
  },
  {
    text: ({ match }) => `Ready. Press SPACE to call Wave 1 (auto in ${Math.ceil(match.buildTicksLeft / 60)}s).`,
    done: ({ match }) => match.phase !== 'build' || match.waveIndex > 0,
  },
  {
    text: () =>
      `Each kill pays ${CONFIG.enemies.bounty}g. HOLD the RIGHT mouse button to blast water — shove strays back into the ring.`,
    done: ({ match }) => match.waveIndex >= 1 || match.phase === 'over',
  },
  {
    text: () =>
      'Between waves: build. A second Neutralizer doubles the gauntlet; walls re-route the river itself. Repaint damaged walls to repair them.',
    done: ({ match }) => match.waveIndex >= 2 || match.phase === 'over',
  },
  {
    text: () =>
      'SURGE waves slam the current — spores ride faster and walls crack under the hammer. Brace, jet, repair.',
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
