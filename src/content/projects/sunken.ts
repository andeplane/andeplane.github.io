import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'sunken',
  title: 'Sunken',
  description:
    'A coral reef in a browser tab. WebGPU, marching-cube caves, and water that absorbs red before it absorbs blue.',
  tags: ['WebGPU', 'Three.js', 'TSL', 'Game', 'Procedural', 'Compute Shaders'],
  liveUrl: '/demos/sunken/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/sunken',
  screenshot: '/projects/sunken/preview.png',
  longDescription: `
Swim a reef ten to thirty metres down, thread into caves, and surface to find waves and an
island. No combat, no oxygen meter, no way to lose — the reward loop is discovery.

## One definition, consumed many times

The whole world is a single analytic function. \`field(x, y, z)\` returns signed density —
positive inside rock — and it drives terrain meshing, player collision, prop scattering
and cave validation alike. There is no collider mesh, so rendering and collision share the same underlying surface definition. The displayed mesh is still a finite-resolution approximation, so local differences need checking. The Gerstner wave table is treated the same way:
one definition, evaluated in the shader for the surface and in JavaScript for boat
buoyancy and the waterline test.

That discipline has a second payoff. \`src/world/\` imports no Three.js and no DOM, so the
entire world generator runs in Node — \`npm run world\` validates it headlessly in about a
second, with seventeen checks covering cave connectivity, tunnel clearance, mouth
separation, and whether tunnels actually have rock above them rather than erupting through
the seabed as trenches. Every world bug found became a check.

## Caves that are worth entering

The terrain is layered simplex noise — seabed, island, reef ridges — carved by a second 3D
layer where *two* independent noise fields both cross zero. The intersection of two
zero-sets in 3D is a curve, which is why that yields tunnels rather than blobby pockets.

Noise alone will not guarantee a cave you can find, enter and swim through, so authored
splines, chambers and ceiling skylights are unioned on top, then validated. Marching cubes
meshes it at 0.6 m across a worker pool, baking per-vertex sky visibility as it goes —
which then does a surprising amount of work: caves go genuinely dark, caustics are masked
so they cannot leak onto cave ceilings, and flora only grows where light reaches.

A **signed density field** tells us which side of a surface a point is on. Marching
cubes samples that field on a grid and builds triangles where its sign changes.
Smaller grid cells capture finer caves but require more triangles and computation.

## Water

Extinction is a vec3, not a scalar. Red dies in a few metres while blue survives tens, so
distant things go blue by *losing red first* — the thing a single-colour fog physically
cannot do, and whose absence is why most underwater scenes just look blue-hazed. Getting
the green-to-blue ratio wrong is what makes water read as teal instead of ocean.

Seen from below, the surface produces Snell's window: a 96° cone of refracted sky ringed
by total internal reflection. Caustics — the moving bright patterns on the seabed — are modeled as sunbeams refracted through the wave
surface and projected down, with brightness from how much each beam's footprint
compressed, measured with screen-space derivatives. The volumetric light shafts are
modulated by that same caustic map, so the beams and the pattern they cast on the sand
come from one source and actually line up.

## Life

Fish schools and gulls run one GPU flocking system on compute shaders, split into
per-school buffers — six schools of five hundred interacting only within themselves rather
than one flock of thousands, a reduction in pair checks from roughly (6 × 500)² to 6 × 500² — about sixfold for those fish schools. Actual frame cost includes other work. Crabs walk
the seabed as CPU agents with legs animated procedurally from baked vertex attributes, all
in a single draw call. Some fifty thousand instanced corals, kelp and sponges sway in the
surge, coloured by rotating each instance around the hue wheel rather than linearly interpolating between two colours. The hue rotation is an artistic choice that keeps the palette vivid.

Somewhere in the deepest chamber there is a chest.

## Built in the open

The [PRD](https://github.com/andeplane/andeplane.github.io/blob/main/demos/sunken/docs/PRD.md),
[design doc](https://github.com/andeplane/andeplane.github.io/blob/main/demos/sunken/docs/DESIGN.md)
and [design review](https://github.com/andeplane/andeplane.github.io/blob/main/demos/sunken/docs/REVIEW.md)
are in the repo, along with a
[CLAUDE.md](https://github.com/andeplane/andeplane.github.io/blob/main/demos/sunken/CLAUDE.md)
cataloguing the WebGPU and TSL traps hit along the way — the kind that fail silently, or in
the *next* material rather than where you wrote them.

Needs a browser with WebGPU.
  `.trim(),
}

export default project
