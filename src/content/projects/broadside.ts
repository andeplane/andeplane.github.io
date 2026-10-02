import type { ProjectMeta } from '@/types'
const project: ProjectMeta = {
  slug: 'broadside', title: 'Broadside · The Treasure Cave',
  description: 'Steer a little pirate ship through islands, rival ships, fortress cannons, and the kraken. Open glowing treasure chests and bring twelve different 3D treasures home to your secret cave.',
  tags: ['TypeScript', 'Babylon.js', 'Game', 'Sailing', 'Touch controls'],
  liveUrl: '/demos/broadside/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside',
  screenshot: '/projects/broadside/preview.jpg',
  longDescription: `Four packs of three voyages start with learning to steer, then introduce manual cannons, island fortresses, and the kraken. Choose a route around the islands, find optional hidden gems, and reach the treasure at the far sea.

Every completed voyage opens an animated 3D chest. Collect gold bars, silver doubloons, colored diamonds, a sapphire ring, and magical keepsakes. Swipe or scroll through the glowing cave to admire the collection. The best stars and gems for each level save in this browser.

Drag the wheel or tap the sea to steer. Tap **BOOM** to fire the broadside facing a pirate; turn sideways to line up the shot. There is no automatic firing. On a keyboard, use **A/D** or **←/→** to steer, **Space** to fire, and **P** to pause.

Young captains receive a rescue if their ship sinks and can always finish the voyage. Stars reward protecting the ship: three for very little damage, two for a rougher crossing, and one for reaching the treasure with help.

Built with Babylon.js, original ship models, procedural treasures, animated water, and synthesized sound. Responsive browser checks cover portrait and landscape windows; physical phone performance is still to be tested.`
}
export default project
