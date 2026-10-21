import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'explore-titanic',
  title: 'Explore Titanic',
  description:
    'Walk the whole of RMS Titanic in your browser, inside and out: from the boat deck down to the engine rooms, built room by room from the 1912 deck plans, on an open North Atlantic in any weather and under the real night sky of 14 April 1912.',
  tags: ['TypeScript', 'Babylon.js', 'Game', 'Exploration', 'History', 'WebXR'],
  liveUrl: '/explore-titanic/',
  screenshot: '/projects/explore-titanic/preview.jpg',
  screenshotAlt: 'Titanic steaming through a dark blue North Atlantic, seen from above her bow, smoke trailing from her funnels',
  screenshotsTitle: 'Inside and out',
  screenshotsNote: 'Screenshots from the live game. Click any image for a closer look.',
  screenshots: [
    {
      src: '/projects/explore-titanic/ship-at-sea.jpg',
      alt: 'Titanic seen from above, her wake running back to the horizon',
      caption: 'The opening view: the ship heaving and pitching on the swell',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/sunset.jpg',
      alt: 'Titanic at sunset under a pale pink sky, the sea dark and calm',
      caption: 'Sunset, one of four times of day',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-grand-staircase-a-deck.jpg',
      alt: 'The forward Grand Staircase seen from A deck, its twin carpeted flights rising to the gallery above',
      caption: 'The forward Grand Staircase from A deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-grand-staircase-boat-deck-top.jpg',
      alt: 'Looking down the Grand Staircase from the boat-deck gallery, ironwork balustrades either side',
      caption: 'Looking down the Grand Staircase from the boat deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-reception-room-d-deck.jpg',
      alt: 'The first-class reception room on D deck, armchairs round small tables and the staircase rising behind',
      caption: 'The D deck reception room at the foot of the staircase',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-dining-saloon-d-deck.jpg',
      alt: 'The long first-class dining saloon with white-clothed tables, green chairs and a moulded ceiling',
      caption: 'The first-class dining saloon on D deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-cafe-parisien-b-deck.jpg',
      alt: 'The Café Parisien with trellis walls, red chairs and the sea through its windows',
      caption: 'The Café Parisien on B deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-lounge-a-deck.jpg',
      alt: 'The first-class lounge with chandeliers, green armchairs and a central bookcase',
      caption: 'The first-class lounge on A deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-cabin-1st-class-c59.jpg',
      alt: 'A first-class cabin with a brass bed, a red sofa and green and oak panelling',
      caption: 'A first-class cabin on C deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-cabin-1st-class-b57.jpg',
      alt: 'A first-class cabin with a brass bed, a dressing table and patterned carpet',
      caption: 'A first-class cabin on B deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-suite-c62-sitting-room.jpg',
      alt: 'A suite sitting room in dark mahogany panelling, with a round table, a blue sofa and a porthole',
      caption: 'A suite sitting room on C deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-cabin-3rd-class-g15.jpg',
      alt: 'A third-class cabin with two tiers of berths on either side and a washstand',
      caption: 'A third-class cabin on G deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-turkish-bath-cooling-room.jpg',
      alt: 'The cooling room of the Turkish bath, with patterned tiles and red couches',
      caption: 'The cooling room of the Turkish bath on F deck',
      width: 1600,
      height: 1000,
    },
    {
      src: '/projects/explore-titanic/interior-gymnasium.jpg',
      alt: 'The gymnasium with its period exercise machines and arched windows',
      caption: 'The gymnasium on the boat deck',
      width: 1600,
      height: 1000,
    },
  ],
  longDescription: `
A first-person walk through RMS Titanic. Stroll the boat deck between the lifeboats,
open a door and step into the gymnasium, take the grand staircase down, and keep going:
every deck from the boat deck to the tank top, with its cabins, saloons, corridors,
stairs, ladders and lifts, about 2,300 rooms in all.

## How it is built

The exterior is a detailed model of the ship, fitted to her real dimensions. The
interiors are generated by scripts from the 1912 deck plans: every wall, door, stair
and room is traced from the plans and built into streamed zones that load around you
as you walk, so the whole ship fits in a browser tab.

## The world around her

She heaves and pitches on an ocean with swell, a wake and a bow wave. Pick day,
sunset, moonlight or the moonless night she sank, when the sky shows the real stars
for that place and time, and clear weather, cloud, rain, snow or fog.

## Controls

WASD to walk, the mouse or arrow keys to look, Shift to run, Space to jump, C to
crouch, F to fly, E to open doors. Esc opens the menu with places to visit and the
graphics settings. It needs a reasonably recent GPU, and the ship streams in as
you walk.
  `.trim(),
}

export default project
