import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'particle-defence',
  title: 'Particle Defence',
  description: '2-player tower defence where particles navigate procedural mazes to attack the enemy base.',
  tags: ['TypeScript', 'Phaser 3', 'Game', 'AI'],
  liveUrl: 'https://andeplane.github.io/particle-defence/',
  repoUrl: 'https://github.com/andeplane/particle-defence',
  screenshot: '/projects/particle-defence/preview.png',
  longDescription: `
A competitive tower defence game where instead of placing turrets, you spawn particles from your base that autonomously navigate a procedurally generated maze toward the enemy base. Supports 1-player vs AI and 2-player local modes.

## Gameplay

Each player controls a base on opposite sides of the map. Particles spawn at intervals and pathfind through the maze using A* — place obstacles to redirect enemy particles while leaving clean corridors for your own. Earn gold by killing enemy particles, spend it on upgrades.

**Upgrade tree** — particles can be upgraded with higher speed, shields, or homing behaviour. Special abilities include area-of-effect blasts and a nuclear strike that clears a large section of the maze.

## AI opponent

The AI controller evaluates the maze topology to decide when to upgrade vs. when to rebuild routing. It uses a threat-score heuristic: if many of its particles are dying in the same map region, it reroutes them and considers a nuke. Difficulty scales by adjusting the AI's gold-spending rate and reaction time.

## Architecture

Built with **Phaser 3** for rendering and physics. All game constants live in a single \`config.ts\` file so balancing changes are easy. The post-game stats screen shows nine dual-series timeline graphs (gold, particles spawned, particles killed, etc.) rendered as canvas line charts with glow effects.
  `.trim(),
}

export default project
