/** Three chips for the difficulty. Shared by the menu and the settings panel. */

import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '../core/difficulty.ts';
import { el } from './dom.ts';

export function difficultyPicker(
  current: Difficulty,
  onPick: (difficulty: Difficulty) => void,
): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Difficulty');
  for (const id of DIFFICULTY_ORDER) {
    const chip = el('button', 'segment', DIFFICULTIES[id].label);
    chip.type = 'button';
    if (id === current) chip.classList.add('is-active');
    chip.setAttribute('aria-pressed', String(id === current));
    chip.addEventListener('click', () => onPick(id));
    group.append(chip);
  }
  return group;
}

/**
 * All three spelled out, not just the one you have chosen: the point of a difficulty
 * picker is comparing them, and "Easy" on its own does not say what gets easier.
 */
export function difficultyLegend(current: Difficulty): HTMLElement {
  const list = el('ul', 'difficulty-legend');
  for (const id of DIFFICULTY_ORDER) {
    const item = el('li');
    if (id === current) item.classList.add('is-active');
    item.append(
      el('b', undefined, DIFFICULTIES[id].label),
      el('span', undefined, DIFFICULTIES[id].blurb),
    );
    list.append(item);
  }
  return list;
}
