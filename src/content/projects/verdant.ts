import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'verdant',
  title: 'Verdant',
  description:
    'A botanical survival game. Guide growing roots around stones, find water and nitrogen, and keep a tomato, cactus, or Venus flytrap alive through six different habitats.',
  tags: ['TypeScript', 'Three.js', 'Game', 'Simulation', 'Biology'],
  liveUrl: '/demos/verdant/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/verdant',
  screenshot: '/projects/verdant/preview.jpg',
  portrait: true,
  longDescription: `
Roots spend carbon to reach water and minerals. Above the soil, light builds new
carbohydrates while respiration consumes reserves. The plant has to balance both
with heat, humidity, root aeration, and a finite research grant.

Guide root tips through a soil cutaway with **WASD or destination clicks**, branch
with **B**, and switch tips with **Tab**. Select tools with **1–6** to water, feed,
shade, ventilate, or prune. **P** pauses time; **E** opens equipment; **H** opens
the science guide.

The six-level campaign moves from establishing a tomato to growing a CAM cactus
and a carnivorous bog plant. Later habitats bring prolonged heat, warm nights,
and cloudy weather. Success requires enough biomass, healthy tissue, and a root
network that reaches the required resources before the deadline. Wins unlock the
next habitat, with extra stars for vitality and conserving supplies.

The complete game engine is deterministic and independent of rendering. The same
commands run in the browser or headlessly, with reproducible seeds, fixed time
steps, checkpoint saves, and command replays. Tests cover physiology, resource
accounting, obstacle collisions, campaign progression, and viable strategies for
every level.

The mechanisms draw on plant biology, but numerical rates are tuned for play.
This is a teaching model rather than a validated crop predictor. The source
README documents the assumptions and scientific references.
  `.trim(),
}

export default project
