import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'lunarlander',
  title: 'Lunar Explorer',
  description: 'Browser-based Moon exploration with procedural terrain, LOD chunk streaming, and Three.js.',
  tags: ['TypeScript', 'Three.js', 'Procedural Generation', 'WebGL'],
  repoUrl: 'https://github.com/andeplane/MoonLanderTS',
  longDescription: `
Lunar Explorer is a browser-based Moon flyover experience built with TypeScript and Three.js. Soar over procedurally generated lunar terrain — craters, ridges, and vast flat plains — rendered at stable 60fps through a chunk-based LOD system.

## Terrain system

The heightfield is generated with fractional Brownian motion layered at multiple frequencies, then post-processed with a crater-stamping pass that places impact craters at random positions and scales, each with the characteristic raised rim and central floor geometry.

**LOD chunk streaming** — the terrain is divided into a grid of chunks. As the player moves, nearby chunks are generated at high resolution and distant chunks at coarser resolution. Chunk generation runs in a Web Worker to avoid main-thread stutter. Transitions between LOD levels use morphing to eliminate popping.

## Renderer

The Three.js scene uses a custom lunar surface shader with:
- Normal map derived from the heightfield gradient
- Ambient occlusion baked per-vertex at generation time
- Directional sunlight at a low angle to exaggerate surface relief
- Atmospheric haze that matches the Moon's lack of atmosphere (the horizon darkens rather than brightens)

## Performance

Targeting 60fps on mid-range hardware (2020 MacBook Pro integrated graphics). Chunk generation is amortised across frames; the frustum culling system discards chunks outside the view before issuing draw calls.
  `.trim(),
}

export default project
