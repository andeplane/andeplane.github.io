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

Each player controls a base on opposite sides of the map. Particles spawn at intervals and drift toward the enemy base — biased random motion with wall bounce — so maze walls physically herd them. Place obstacles to redirect enemy particles while leaving clean corridors for your own. Earn gold by killing enemy particles, spend it on upgrades.

**Upgrades** — health, attack, radius, spawn rate, speed, defense, maximum particles and interest on banked gold. Research Laser and Slow towers for damage and area control; the nuke clears enemy particles and towers on a cooldown.

## AI opponent

The AI makes economic and timing decisions: which upgrade to buy, where to place researched towers, and when to use a nuke. It cannot reroute particles, because their motion uses the same local wall-bounce rule as yours. Difficulty changes its priorities and reaction speed.

## Architecture

Built with **Phaser 3** for rendering and physics. All game constants live in a single \`config.ts\` file so balancing changes are easy. The post-game stats screen shows ten dual-series timeline graphs (gold, particles spawned, particles killed, etc.) rendered as canvas line charts with glow effects.
  `.trim(),
}

export default project
