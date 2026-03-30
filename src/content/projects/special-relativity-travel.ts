import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'special-relativity-travel',
  title: 'Relativistic Space Travel Simulator',
  description: 'Interactive 3D simulator showing time dilation, length contraction, and fuel costs for relativistic interstellar journeys.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'React'],
  liveUrl: 'https://andeplane.github.io/special-relativity-travel/',
  repoUrl: 'https://github.com/andeplane/special-relativity-travel',
  screenshot: '/projects/special-relativity-travel/preview.png',
  longDescription: `
A browser-based simulator that makes the effects of special relativity tangible. Configure a journey between Earth and any star or galaxy, set your ship's max speed (as a fraction of c) and acceleration in g's, and watch the physics update in real time.

## Relativistic physics

All calculations use proper special-relativistic kinematics — no Newtonian approximations:

- **Lorentz factor** — γ = 1 / √(1 − v²/c²) drives all derived quantities
- **Time dilation** — journey time as experienced on the ship vs. clocks back on Earth, integrated across the full acceleration/coast/deceleration profile
- **Length contraction** — the universe shrinks along the direction of travel; the 3D scene shows both the rest-frame distance and the contracted distance side by side
- **Relativistic rocket equation** — used to compute fuel mass for a 1-tonne ship

## 3D visualisation

A Three.js scene renders Earth and the target star, with two distance bars: a blue dashed bar for the rest-frame distance and an orange solid bar that contracts in real time as you increase speed. The bars animate smoothly as you drag the sliders, making length contraction feel intuitive rather than abstract.

## Journey profile

The simulator models a symmetric three-phase journey — accelerate at constant proper acceleration, coast at peak speed, decelerate — and correctly handles the edge case where the distance is short enough that peak speed is never reached.

## Fuel calculator

Fuel requirements are computed for two drive types: a theoretical perfect matter–antimatter engine (exhaust velocity = c) and conventional chemical rockets (I_sp ≈ 450 s). For relativistic speeds, chemical fuel mass quickly exceeds the mass of the observable universe, which the UI notes explicitly.
  `.trim(),
}

export default project
