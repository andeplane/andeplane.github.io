/**
 * Practice mode's payoff: a bar per interval showing how often you get it right, so the
 * one you keep missing stops being a vague feeling.
 */

import { answersFor, type Difficulty } from '../core/difficulty.ts';
import { accuracy, type StatsMap } from '../core/stats.ts';
import { el } from './dom.ts';

/** Only the degrees the current difficulty asks about — the rest are not your problem. */
export function renderStatsStrip(
  root: HTMLElement,
  stats: StatsMap,
  difficulty: Difficulty,
): void {
  const shown = answersFor(difficulty);
  // Empty gauges say nothing and look like a broken image; the strip earns its space only
  // once there is something in it.
  const hasData = shown.some((i) => (stats[i.semitones]?.total ?? 0) > 0);
  root.dataset.empty = hasData ? 'no' : 'yes';

  root.replaceChildren(
    ...shown.map((interval) => {
      const tally = stats[interval.semitones];
      const rate = accuracy(tally);
      const column = el('div', 'stat');
      if (rate === null) column.classList.add('is-empty');
      // Colour by how well it is going, so a weak interval shows up at a glance.
      if (rate !== null) column.dataset.level = rate >= 0.8 ? 'good' : rate >= 0.5 ? 'ok' : 'poor';
      column.title =
        rate === null
          ? `${interval.label} — not tried yet`
          : `${interval.label} — ${tally.correct}/${tally.total} correct`;

      const gauge = el('div', 'stat-gauge');
      const fill = el('i', 'stat-fill');
      fill.style.height = `${Math.round((rate ?? 0) * 100)}%`;
      gauge.append(fill);

      column.append(gauge, el('span', 'stat-label', interval.label));
      return column;
    }),
  );
}
