import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'curling-simulator',
  title: 'Curling Simulator',
  description: 'Physics-accurate browser curling game with 3D ice, realistic curl, and full WCF rules.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'Game'],
  liveUrl: 'https://andeplane.github.io/curling-simulator/',
  repoUrl: 'https://github.com/andeplane/curling-simulator',
  screenshot: '/projects/curling-simulator/preview.png',
  longDescription: `
A full-featured curling game that runs in the browser, built with Three.js and TypeScript. The physics model is calibrated to match real-world curling behaviour rather than being a simple approximation.

## Physics model

- **Velocity-dependent friction** — µ ∝ v⁻¹/² so the stone slows more quickly at low speeds, just like on real ice
- **Lateral curl** — curl strengthens late in the trajectory (front-to-back asymmetry), matching how real stones behave due to pebble contact
- **Angular spin decay** — rotational speed bleeds off correctly through the shot
- **Impulse-based collisions** — restitution, tangential friction, and spin transfer between stones; positional correction prevents overlap

## Gameplay

Full 10-end matches with alternating hammer, hog-line violation detection, and WCF scoring. Hold **Space** while a stone is moving to sweep — sweeping reduces friction and extends travel distance.

A curved ghost line predicts the stone's trajectory before you throw, accounting for the current aim angle and speed.

## Renderer

Three.js scene with a textured ice sheet (pebble noise), house rings, side boards, and overhead spotlights with real-time shadows. The 3D perspective makes reading weight and line feel intuitive.
  `.trim(),
}

export default project
