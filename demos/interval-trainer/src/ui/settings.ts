/** Settings panel: difficulty, which key, whether the waves run, and sound on/off. */

import { DIFFICULTIES, type Difficulty } from '../core/difficulty.ts';
import { NOTE_NAMES } from '../core/intervals.ts';
import type { Prefs } from '../core/prefs.ts';
import type { RootMode } from '../core/question.ts';
import { difficultyPicker } from './difficultyPicker.ts';
import { button, field, fieldGroup, panel, row, select, title, toggle } from './panels.ts';

export interface SettingsHandlers {
  onPrefs: (prefs: Prefs) => void;
  onMute: (muted: boolean) => void;
  onResetStats: () => void;
  onClose: () => void;
}

export function buildSettings(
  state: { prefs: Prefs; muted: boolean; forcedSilent: boolean; backend: string },
  handlers: SettingsHandlers,
): HTMLElement {
  const rule = DIFFICULTIES[state.prefs.difficulty];
  const rootOptions = [
    { value: 'random', label: 'A new one each game' },
    ...NOTE_NAMES.map((name, index) => ({ value: String(index), label: `Always ${name}` })),
  ];

  const card = panel(
    title('Settings'),
    fieldGroup(
      'Difficulty',
      difficultyPicker(state.prefs.difficulty, (difficulty: Difficulty) =>
        handlers.onPrefs({ ...state.prefs, difficulty }),
      ),
      `${rule.blurb} Changing it starts a fresh run.`,
    ),
    field(
      'Key',
      select(rootOptions, String(state.prefs.rootMode), (value) => {
        const rootMode: RootMode = value === 'random' ? 'random' : Number(value);
        handlers.onPrefs({ ...state.prefs, rootMode });
      }),
      rule.movingKey
        ? 'Hard re-rolls the key every question, so this waits for Easy or Medium.'
        : 'One key for the whole run — your ear keeps its bearings between questions.',
    ),
    field(
      'Wave field',
      toggle(state.prefs.waves, (waves) => handlers.onPrefs({ ...state.prefs, waves })),
      `Each note ripples at its own wavelength. Rendering via ${state.backend}.`,
    ),
    field(
      'Sound',
      toggle(!state.muted, (on) => handlers.onMute(!on)),
      state.forcedSilent ? 'Forced off by ?mute in the URL.' : 'Needed, really.',
    ),
    row(
      button('Reset practice stats', handlers.onResetStats),
      button('Done', handlers.onClose, 'primary'),
    ),
  );

  return card;
}
