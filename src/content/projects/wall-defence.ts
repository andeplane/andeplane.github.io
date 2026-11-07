import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'wall-defence',
  title: 'Wall Defence',
  description:
    'JezzBall × tower defence roguelite. Seal territory, build turrets on it, survive ten telegraphed waves — with a shared daily board.',
  tags: ['Game', 'Canvas', 'TypeScript', 'Deterministic Sim', 'Daily Puzzle'],
  liveUrl: '/demos/wall-defence/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/wall-defence',
  screenshot: '/projects/wall-defence/preview.png',
  longDescription: `
Cut walls to seal off ball-free space, JezzBall style — but sealed territory is
simultaneously your score, your income, and the only ground your turrets can stand on.
Breaker enemies chew through walls and re-open what you claimed, so the wall verb never
retires. Ten telegraphed waves, a pick-1-of-3 upgrade at every claim quota, five-minute
runs.

## One verb, four systems

The design rule the whole game hangs on: *seal a region* feeds score, economy, build
surface and enemy space at once. Every claim pays an income burst, every claim compresses
the surviving balls into less space (so density — the difficulty curve — is emergent, not
scripted), and a breached region powers its towers down until you plug the hole and
reclaim it. There is no separate combat layer; walls, towers, balls and claims compete
for the same grid.

## A deterministic sim underneath

The simulation is pure integer fixed-point math at 60 Hz — no floats, no
transcendentals, a baked sine table for steering, seeded RNG substreams — so the same
seed and inputs produce bit-identical runs everywhere. That buys the **daily board**:
everyone plays the same layout, waves and upgrade offers each UTC day, and the end
screen renders your territory as a spoiler-free emoji grid to share, Wordle style.

Determinism also makes the game testable headlessly: \`npm run check\` replays a bot
game twice and compares per-tick state hashes, and a self-play harness asserts the
balance contract — a bot that builds towers can win, a bot that ignores them always
loses by wave 7. The tower-defence layer is load-bearing by construction, not by hope.

Runs in any browser, desktop or phone. Instant restart; free-play mode with random
seeds when you're done with the daily.
  `.trim(),
}

export default project
