import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'flow-defence',
  title: 'Flow Defence',
  description:
    'A tower defence where the map is a fluid. A real lattice-Boltzmann river runs on your GPU, the enemies are particles it carries, and every wall you draw is an obstacle the water has to get around.',
  tags: ['TypeScript', 'WebGPU', 'Babylon.js', 'Game', 'Simulation', 'Fluid Dynamics'],
  liveUrl: '/demos/flow-defence/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/flow-defence',
  screenshot: '/projects/flow-defence/preview.png',
  longDescription: `
Tower defence has a maze, a path, and enemies that walk it. This has a river. A
lattice-Boltzmann fluid solver runs on your GPU at 512×256 cells, three substeps per
frame, and the enemies — spores — are particles with no pathfinding at all: they go
where the water goes. Draw a wall and you have not blocked a path, you have changed
a flow field, and the swarm rearranges itself around your wall the way water does.

That single substitution rewrites every rule of the genre. The classic constraint
that you may not fully wall off the map is gone, because physics enforces it better
than a rule could: dam the river and pressure builds behind your dam until it fails.
Not on a timer — by *piping*, the way real earth dams fail. Damage admits
through-flow, through-flow raises shear, shear does more damage, and the breach
cascades along the dam face in a couple of seconds. You can watch it seep before it
goes.

## What you actually do

Paint walls to shape the current, place towers, and hold right mouse for the **jet** —
a radial blast of water at the cursor that shoves the swarm bodily off its line. It is
the one verb that acts on the fluid rather than on the enemies, and it costs stamina.

Towers exploit the medium rather than ignoring it: the Impeller pumps a directed body
force into the water to steer spores into a kill zone, the Congealer thickens the flow
to a crawl, the Vortex spins them in circles, and the Neutralizer just kills whatever
drifts through. Eight of them, across eight arenas, against five kinds of spore — the
Darter swims across the current instead of riding it, the Barnacle is heavy enough that
only a surge moves it, and the Blastocyst bursts into three children exactly where you
killed it, which makes killing it inside your own gauntlet a mistake.

## The base has to drink

The defence is not "keep them out." A base at the outlet needs water, and that turns
the obvious exploit into a losing move. Wall off the river completely and the spores
never reach you — and your base dies of thirst while flood pressure climbs behind your
own dam until it bursts. Seal an arm and the spores trapped in it suffocate quietly and
pay you nothing, so drowning is a defence rather than an income. The strategy the rules
actually reward is a funnel: constrict the flow, leave a throat, and make the throat a
killing floor.

Getting there took several rounds of the game finding exploits I had not thought of.
Becalmed spores now *hunt* for current — they sniff the local speed gradient and crawl
toward moving water, holding their breath while any is in reach — because a dam with a
hair-width canal through it was otherwise a perfect farm, and a rotting blockade
funnelled the swarm through its own cracks. And when a bug report said the intake read
zero on a wide-open map, the culprit turned out to be the jet: blasting inside a
funnel's throat genuinely stalls the net through-flow, so the base now runs a cistern
that forgives starvation it can attribute to your own blast, and nothing else.

## Under the hood

D2Q9 lattice Boltzmann with a fused stream-collide, Smagorinsky turbulence, and partial
bounce-back at walls, so an eroding wall leaks *physically* — its solidity blends the
transmitted and reflected populations rather than flipping a cell from solid to open.
Weakly compressible, which means a surge wave is a real pressure wave travelling at the
lattice speed of sound rather than a scripted effect. Babylon's WebGPU engine, with
every kernel written as plain WGSL.

Every quantity that crosses from GPU back to CPU is a monotone accumulator and the
engine consumes differences between snapshots, so a late or dropped readback can never
lose or double-count a kill. The solver's constants and its erosion rule are imported
by both the WGSL kernels and a CPU reference solver, which is what lets the physics be
unit-tested in Node — mass conservation, a Poiseuille profile within 2%, monotone flux
through a porous plug, dam-breach timing.

Balance is verified by self-play. Bots play the campaign through a scripted API against
a frozen build, and the exploit bots are as important as the winning ones: the drown
farm, the total blockade and the do-nothing bot must all *lose*, or the rules above are
not doing their job. Every balance change is gated on that suite.

Needs a browser with WebGPU.
  `.trim(),
}

export default project
