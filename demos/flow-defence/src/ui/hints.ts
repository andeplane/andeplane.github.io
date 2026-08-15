// Guided hints: a sequence of objectives that react to what the player
// actually does. Level 1 runs the full tutorial sequence; all levels get the
// build-phase prompt. Rendered by the Hud's hint line.

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
      'The water flows left → right. The invasion will ride it. Press 1 and DRAG a wall across the top inlet stream to seal it off.',
    done: ({ match }) => match.wallCellsBuilt >= 40,
  },
  {
    text: () => 'Good — the water chokes and reroutes. Seal the bottom stream too, leave the middle open.',
    done: ({ match }) => match.wallCellsBuilt >= 90,
  },
  {
    text: () => 'Now press 2 and click ON the middle stream — a Neutralizer kills anything passing its ring.',
    done: ({ match }) => match.towers.some((t) => t.type === 'neutralizer'),
  },
  {
    text: ({ match }) => `Ready. Press SPACE to start the invasion (auto-starts in ${Math.ceil(match.buildTicksLeft / 60)}s).`,
    done: ({ match }) => match.phase !== 'build',
  },
  {
    text: () => 'Kills pay gold — watch the KILLS counter climb. Add a second Neutralizer to the stream.',
    done: ({ match }) => match.towers.filter((t) => t.type === 'neutralizer').length >= 2 || match.phase === 'over',
  },
  {
    text: () =>
      'Hold the line: repaint damaged walls to repair them, and when SURGE INCOMING flashes, brace — pressure spikes crack dams.',
    done: ({ match }) => match.phase === 'over',
  },
]

const buildPromptOnly: Hint[] = [
  {
    text: ({ match }) => `Build phase — press SPACE to start the invasion (auto-starts in ${Math.ceil(match.buildTicksLeft / 60)}s).`,
    done: ({ match }) => match.phase !== 'build',
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
