import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'kurvi-packing-loop',
  title: 'Kurvi Packing Loop',
  description:
    'A 3D simulation of a grocery packing line, inspired by how Oda works: boxes circulate a conveyor loop past 26 stations, where people or robot arms pack real products, and leave for the trucks. Tune demand, layout and strategy live and watch throughput respond.',
  tags: ['Simulation', 'Logistics', 'Three.js', 'TypeScript'],
  liveUrl: 'https://andeplane.github.io/groceries-manufacturing/',
  repoUrl: 'https://github.com/andeplane/groceries-manufacturing',
  screenshot: '/projects/kurvi-packing-loop/preview.png',
  screenshotAlt:
    'An orange robot arm packing groceries into Kurvi boxes on a roller conveyor, with throughput statistics and a station utilisation chart',
  longDescription: `
How many items per hour can one person pack in an online grocery warehouse, and what
decides it? This is a simulation of a packing loop for Kurvi, a made-up online grocer,
inspired by how the Norwegian online grocer Oda works.
Orders come in and are split into boxes. The boxes ride a circulating conveyor past 26
packing stations, divert into a station's cache lane when they need products from it,
get packed, merge back, and leave for the dock, where a truck for their delivery area
waits for its last box.

## Watch it, or sweep it

The same simulation core drives two things. In the browser it runs in real time as a
three.js factory hall: the conveyor loop, station lanes and caches, packers at shelves
stocked with a real grocery assortment, products dropping into boxes, outbound lanes and
trucks. Without a screen it simulates a full shift in well under a second, so release
policies and product slotting strategies can be compared across many runs.

## Things to try

Change the order rate, add a themed demand surge, or swap the human packers for robot
arms (or a mix) and see what happens to units per hour, station utilisation and the
queue of boxes waiting to enter the loop. Click any box to see its order, what has been
packed so far and which stations it still has to visit, then follow it around the hall.
Press M to walk the floor. A short guided tour plays on the first visit.

## The products

Every product is drawn with one of 35 procedural packaging shapes (cans, PET bottles,
gable cartons, pillow bags, trays and more), each with the product's photo printed on
its label.

The numbers are a model, not measurements from a real warehouse: packing times, robot
speeds and support overhead are adjustable assumptions.
  `.trim(),
}

export default project
