import type { ProjectMeta } from '@/types'
const project: ProjectMeta = {
  slug: 'fuse-craft', title: 'Fuse Craft',
  description: 'A neural strategy game: grow a living network across the map, harvest deposits, research and build towers, and destroy the rival brain before it destroys yours.',
  tags: ['TypeScript', 'Game', 'Strategy', 'Multiplayer'],
  liveUrl: 'https://andeplane.github.io/fuse-riders/fuse-craft/',
  repoUrl: 'https://github.com/andeplane/fuse-riders/tree/main/games/fuse-craft',
  screenshot: '/projects/fuse-craft/preview.jpg',
  screenshotAlt: 'A glowing brain at the centre of its neuron network on a hex field, with biomass and insight deposits nearby and the command panel below.',
  longDescription: `You start as a single brain on a hex map. Grow neurons outwards to connect deposits, research new technologies, and raise Pulse, Relay and Siege towers and Bastions where your network meets the enemy. Cutting a supply line can win a fight before it starts.

Play against an AI with one of seven openings, watch two AIs fight, try the open sandbox, or play an online versus match. A tutorial and a How to play guide walk you through the basics.`
}
export default project
