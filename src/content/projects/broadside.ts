import type { ProjectMeta } from '@/types'
const project: ProjectMeta = {
  slug: 'broadside', title: 'Broadside · The Treasure Cave',
  description: 'Captain the Black Pearl through islands, rival ships, fortress cannons, and the kraken. Brave stormy seas and bring gold and four special world treasures home to your secret cave.',
  tags: ['TypeScript', 'Babylon.js', 'Game', 'Sailing', 'Touch controls'],
  liveUrl: '/demos/broadside/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/broadside',
  screenshot: '/projects/broadside/storm-battle.jpg',
  screenshotAlt: 'The Black Pearl fires a broadside beside an island fortress as rain falls over pirate ships and whirlpools.',
  screenshotsTitle: 'From sea to secret hideout',
  screenshotsNote: 'Real screenshots from the latest development build. Ship exploration and the treasure hold are previews of features coming to the live demo. Click any image for a closer look.',
  screenshots: [
    {
      src: '/projects/broadside/treasure-cave.jpg',
      alt: 'A huge mound of shining gold coins fills the rocky treasure cave beneath hanging lanterns.',
      caption: 'The treasure cave — a growing hoard of 40,000 gold, with more treasure tucked into the lantern-lit passages.',
      width: 890, height: 985,
    },
    {
      src: '/projects/broadside/captains-deck.jpg',
      alt: 'A first-person view from the captain’s wooden deck, with black sails, rigging and a gangplank leading into the harbor town.',
      caption: 'Walk the captain’s deck — explore the ship on foot, then cross the gangplank into town.',
      width: 890, height: 985,
    },
    {
      src: '/projects/broadside/treasure-hold.jpg',
      alt: 'Inside the Black Pearl’s wooden treasure hold, an open chest overflows with gold and a pink diamond beside rows of stowed chests.',
      caption: 'Inside the treasure hold — lanterns light the gold and stacked chests, with the island visible through the stern windows.',
      width: 1440, height: 900,
    },
  ],
  longDescription: `Four worlds of ten voyages start with learning to steer, then introduce manual cannons, island fortresses, whirlpools, and the kraken. Choose a route around the islands, find optional hidden gems, and reach the treasure at the far sea.

First completions award 1,000 gold, and finishing each world earns a special 3D keepsake: a rose diamond, a captain’s crown, a magical hourglass, or the heart of the ocean. Explore a connected cave with lantern passages, a bridged canal, a glowing grotto, and growing banks of gold. The best stars and gems for each level save in this browser.

Drag the wheel or tap the sea to steer. Tap **BOOM** to fire the broadside facing a pirate; turn sideways to line up the shot. There is no automatic firing. On a keyboard, use **A/D** or **←/→** to steer, **Space** to fire, and **P** to pause.

Stars reward protecting the ship. Replay voyages to improve your score, discover hidden gems, and fill the cave with gold.

Built with Babylon.js, the Black Pearl ship model, original enemy ships, procedural treasures, animated water, and changing weather. Responsive browser checks cover portrait and landscape windows; physical phone performance is still to be tested.`
}
export default project
