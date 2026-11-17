import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'la-belle-lucie',
  title: 'La Belle Lucie',
  description:
    'Play the three-deal solitaire, inspect an exact round solver, and explore one million simulated games: conditional odds, score distributions, comebacks and losing streaks.',
  tags: ['TypeScript', 'React', 'C++', 'Probability', 'Monte Carlo', 'Games'],
  liveUrl: '/demos/la-belle-lucie/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/la-belle-lucie',
  longDescription: `
La Belle Lucie deals the whole deck face up in small piles of three. Only the
exposed card can move, tableau piles build down in the same suit, and empty piles
stay empty. You get two reshuffles after the initial deal. This version has no
mercy draw.

## Play and learn

The [game](/demos/la-belle-lucie/) lets you play manually or ask for the next best
move. Learning mode shows the maximum foundation total still reachable in the
current round, and the loss when a move reduces it. The solver reaches that total
with the fewest moves. Undo, hints, foundation targets and replay links make each
decision inspectable.

## One million games

The [interactive statistics](/demos/la-belle-lucie/?view=stats) show cumulative and
new-card histograms for all three rounds, conditional win probabilities, transition
heatmaps, observed comeback deals, strategy comparisons and a losing-streak
calculator. Every conditional result comes from actual joint round scores, with
sample counts and confidence intervals. The complete joint distribution can be
downloaded as JSON or CSV.

The round-optimal policy won **19.3472%** of one million games, with a 95% Wilson
interval of **19.2699–19.4247%**. This measures a fixed policy; it does not prove
the globally optimal three-round winning probability.

## Why the odds are not obvious

The [theory page](/demos/la-belle-lucie/?view=theory) explains direct and indirect
locks, the exact round solver, and the Bellman recurrence for future shuffles.
With 13 cards remaining there are five exposed pile tops; with 12 there are only
four. Foundation totals therefore do not give a simple ordering of future chances.

An independent reduced-deck oracle checks every shuffle and legal move using
rational arithmetic. The native C++20 simulator supports parallel workers,
reproducible seeds and per-game CSV records; its source and reproduction commands
are included with the web app.
  `.trim(),
}

export default project
