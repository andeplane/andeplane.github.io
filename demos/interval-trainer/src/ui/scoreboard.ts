/** The local highscore boards, and the card you land on when the clock runs out. */

import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '../core/difficulty.ts';
import { MAX_NAME_LENGTH, type Boards, type ScoreEntry } from '../core/highscores.ts';
import { el } from './dom.ts';
import { button, eyebrow, panel, para, row, title } from './panels.ts';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function scoreTable(entries: ScoreEntry[], highlight?: number): HTMLElement {
  if (entries.length === 0) {
    return el('p', 'panel-text panel-empty', 'No scores yet. The board is yours to open.');
  }

  const list = el('ol', 'score-list');
  entries.forEach((entry, index) => {
    const item = el('li', 'score-row');
    if (index === highlight) item.classList.add('is-new');
    item.append(
      el('span', 'score-rank', String(index + 1)),
      el('span', 'score-name', entry.name),
      el('span', 'score-meta micro', `${entry.key} · ${formatDate(entry.dateISO)}`),
      el('span', 'score-value', String(entry.score)),
    );
    list.append(item);
  });
  return list;
}

/** One tab per difficulty: each keeps its own board, so they cannot be compared away. */
function boardTabs(
  boards: Boards,
  shown: Difficulty,
  onSelect: (difficulty: Difficulty) => void,
): HTMLElement {
  const tabs = el('div', 'segmented');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Board');
  for (const id of DIFFICULTY_ORDER) {
    const tab = el('button', 'segment', DIFFICULTIES[id].label);
    tab.type = 'button';
    if (id === shown) tab.classList.add('is-active');
    tab.setAttribute('aria-pressed', String(id === shown));
    if (boards[id].length === 0) tab.classList.add('is-quiet');
    tab.addEventListener('click', () => onSelect(id));
    tabs.append(tab);
  }
  return tabs;
}

export function buildScoreboard(
  boards: Boards,
  shown: Difficulty,
  handlers: {
    onClose: () => void;
    onClear: () => void;
    onSelect: (difficulty: Difficulty) => void;
  },
  highlight?: number,
): HTMLElement {
  return panel(
    eyebrow('local to this browser'),
    title('Highscores'),
    boardTabs(boards, shown, handlers.onSelect),
    scoreTable(boards[shown], highlight),
    row(button('Clear board', handlers.onClear), button('Close', handlers.onClose, 'primary')),
  );
}

export interface GameSummary {
  score: number;
  correct: number;
  wrong: number;
  bestInterval: string | null;
  worstInterval: string | null;
}

export function buildGameOver(
  summary: GameSummary,
  options: { qualifies: boolean; difficulty: Difficulty },
  handlers: {
    onSave: (name: string) => void;
    onPlayAgain: () => void;
    onMenu: () => void;
  },
): HTMLElement {
  const total = summary.correct + summary.wrong;
  const accuracy = total === 0 ? 0 : Math.round((summary.correct / total) * 100);

  const card = panel(
    eyebrow(`time's up · ${DIFFICULTIES[options.difficulty].label.toLowerCase()}`),
    title(String(summary.score)),
    para(
      `${summary.correct} right, ${summary.wrong} wrong &middot; ${accuracy}% accuracy` +
        (summary.worstInterval ? ` &middot; watch your <b>${summary.worstInterval}</b>` : ''),
    ),
  );

  if (options.qualifies) {
    const input = el('input', 'name-input');
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = 'your name';
    input.autocomplete = 'off';
    // Enter is the natural way to finish typing a name; don't make people hunt for the
    // button.
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onSave(input.value);
      }
    });

    card.append(
      para(`That makes the <b>${DIFFICULTIES[options.difficulty].label}</b> board.`),
      row(input, button('Save', () => handlers.onSave(input.value), 'primary')),
    );
    // Focus after the overlay has been shown, so the caret is where the eye is.
    queueMicrotask(() => input.focus());
  }

  // Only one call to action at a time: when there is a name to save, that is the one.
  card.append(
    row(
      button('Play again', handlers.onPlayAgain, options.qualifies ? 'ghost' : 'primary'),
      button('Menu', handlers.onMenu),
    ),
  );

  return card;
}
