import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'curling-simulator',
  title: 'Curling Simulator',
  description: 'Browser curling game with 3D ice, a phenomenological curl model, and match scoring.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'Game'],
  liveUrl: 'https://andeplane.github.io/curling-simulator/',
  repoUrl: 'https://github.com/andeplane/curling-simulator',
  screenshot: '/projects/curling-simulator/preview.png',
  longDescription: `
A full-featured curling game that runs in the browser, built with Three.js and TypeScript. Its phenomenological physics model is tuned to reproduce recognizable shots: it models observed behavior without claiming to settle the microscopic cause of curl. In curling, players slide stones toward a circular target, the house; weight means how far a shot travels, and line means its path.

## Physics model

- **Velocity-dependent friction** — µ ∝ v⁻¹/² so the stone slows more quickly at low speeds, in the chosen model (µ is the friction coefficient and v the speed)
- **Lateral curl** — curl strengthens late in the trajectory (front-to-back asymmetry), matching how real stones behave due to pebble contact
- **Angular spin decay** — rotational speed decays through the shot
- **Impulse-based collisions** — restitution, tangential friction, and spin transfer between stones; positional correction prevents overlap

## Gameplay

Ten-end matches with hog-line violation detection and curling-style scoring. An end is one round of deliveries; the hammer is its last stone. The team closest to the center scores for stones closer than the opponent’s nearest stone. This is a game implementation, not a claim of complete tournament-rule coverage. Hold **Space** while a stone is moving to sweep — sweeping reduces friction and extends travel distance.

A curved ghost line predicts the stone's trajectory before you throw, accounting for the current aim angle and speed.

## Renderer

Three.js scene with a textured ice sheet (pebble noise), house rings, side boards, and overhead spotlights with real-time shadows. The 3D perspective makes reading weight and line feel intuitive.
  `.trim(),
}

export default project
