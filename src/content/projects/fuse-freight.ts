import type { ProjectMeta } from '@/types'
const project: ProjectMeta = {
  slug: 'fuse-freight', title: 'Fuse Freight',
  description: 'Little trains for one to five friends: Snake with cargo and theft. Collect loose carts, cut across rivals to steal their wagons, and deliver them to score.',
  tags: ['TypeScript', 'Game', 'Party', 'Multiplayer'],
  liveUrl: 'https://andeplane.github.io/fuse-riders/fuse-freight/',
  repoUrl: 'https://github.com/andeplane/fuse-riders/tree/main/games/fuse-freight',
  screenshot: '/projects/fuse-freight/preview.jpg',
  screenshotAlt: 'Trains with cargo wagons race round a depot floor between two DELIVER docks, one of them cutting through a rival’s tail.',
  longDescription: `Your train drives itself; you only steer left or right. Drive over loose carts to couple them on, cut across a rival’s tail to break its wagons loose, and pull into a DELIVER dock to bank every wagon you pull. The most wagons delivered in 75 seconds wins the round.

Play solo against AI drivers, in an online room, or on a shared TV with phones as controllers.`
}
export default project
