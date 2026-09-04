/** The opening screen. Three ways in, the difficulty, and a reminder of what the board says. */

import { DIFFICULTIES, type Difficulty } from '../core/difficulty.ts';
import { difficultyLegend, difficultyPicker } from './difficultyPicker.ts';
import { el } from './dom.ts';
import { button, eyebrow, panel, para, row, title } from './panels.ts';

export interface MenuHandlers {
  onPractice: () => void;
  onGame: () => void;
  onTutorial: () => void;
  onScores: () => void;
  onDifficulty: (difficulty: Difficulty) => void;
}

export function buildMenu(
  handlers: MenuHandlers,
  info: { bestScore: number | null; difficulty: Difficulty; firstVisit: boolean },
): HTMLElement {
  const card = panel(
    eyebrow('ear training'),
    title('Name the note'),
    para(
      'Every question sounds the <b>root and its fifth together</b> to set the key, then ' +
        'one more note. Say where that note sits: <b>3</b> or <b>3b</b>, <b>7</b> or ' +
        '<b>7b</b>.',
    ),
    difficultyPicker(info.difficulty, handlers.onDifficulty),
    difficultyLegend(info.difficulty),
    el('p', 'panel-text panel-text--tight', 'Each one keeps its own highscore board.'),
  );

  if (info.firstVisit) {
    card.append(
      row(
        button('Start the tutorial', handlers.onTutorial, 'primary'),
        button('Skip to practice', handlers.onPractice),
      ),
    );
  } else {
    card.append(
      row(
        button('Practice', handlers.onPractice, 'primary'),
        button('Play the game', handlers.onGame, 'primary'),
      ),
      row(button('Tutorial', handlers.onTutorial), button('Highscores', handlers.onScores)),
    );
  }

  if (info.bestScore !== null) {
    const best = el(
      'p',
      'panel-foot micro',
      `best on ${DIFFICULTIES[info.difficulty].label.toLowerCase()} · ${info.bestScore}`,
    );
    card.append(best);
  }

  return card;
}
