import type { ProjectMeta } from '@/types'
const project: ProjectMeta = {
  slug: 'fuse-riders', title: 'Fuse Riders',
  description: 'Steer neon riders, dodge trails, and throw bombs. Play solo against AI or invite friends into an online room for fast, chaotic rounds.',
  tags: ['TypeScript', 'Phaser 3', 'Game', 'Multiplayer'],
  liveUrl: 'https://andeplane.github.io/fuse-riders/',
  repoUrl: 'https://github.com/andeplane/fuse-riders',
  screenshot: '/projects/fuse-riders/preview.png',
  screenshots: [
    {
      src: '/projects/fuse-riders/arena-battle.jpg',
      alt: 'Five riders leave neon trails around arena obstacles and power-ups.',
      caption: 'A solo arena battle — dodge obstacles and neon trails while power-ups appear around the map.',
      width: 1280, height: 720,
    },
    {
      src: '/projects/fuse-riders/neon-trails.jpg',
      alt: 'Pink, orange, purple and green trails weave through a Fuse Riders arena.',
      caption: 'The arena fills with trails as AI riders compete to survive the round.',
      width: 1280, height: 720,
    },
  ],
  longDescription: `A party game for two to five riders. Survive the arena, avoid the trails, and launch bombs and other projectiles. Play solo against AI or create a room and share its invite with friends.

Online rooms support individual screens and a shared TV with phones as controllers. Use left and right to steer and hold then release Fire to throw a bomb.

The game lives in its own repository and deployment; this page links directly to the playable version.`
}
export default project
