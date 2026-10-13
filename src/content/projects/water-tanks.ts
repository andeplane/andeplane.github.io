import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'water-tanks',
  title: 'The Hydraulic Calculator',
  description:
    'An analogue computer made of water. Glass tanks add, a knife edge scales, a tank integrates, Torricelli takes square roots, and V-shaped vessels square and multiply by the quarter-square rule — with the answer read off the glass and checked against the exact value.',
  tags: ['TypeScript', 'Three.js', 'WebGL', 'Physics', 'Simulation', 'Fluids', 'Analogue computing'],
  liveUrl: '/demos/water-tanks/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/water-tanks',
  screenshot: '/projects/water-tanks/preview.png',
  screenshotAlt:
    'Glass tanks on a dark museum wall: a Torricelli jet arcs from a head tank into a collecting tank while a gate clock times the flow.',
  longDescription: `
Before electronics, people computed with water. In 1949 the economist Bill Phillips built the
**MONIAC**, a cabinet of perspex tanks, pipes and valves in which water stood for money: income
flowed in, taxes and savings drained out through valves, and the levels settled to the
equilibrium of the British economy. A few years earlier, in 1936, Vladimir Lukyanov had built a
hydraulic integrator that solved the heat equation for curing concrete with rows of connected
glass columns, and it stayed in use into the 1980s. This exhibit is a small hydraulic calculator
in that tradition: every number is a volume of water in a glass tank, read on a scale etched into
the glass.

## The six operations

**Addition.** Two tanks drain into a third. Water is conserved, so the third tank holds a + b.
Its scale is in the same units even though it is wider: it measures volume, not height.

**Multiplying by a constant.** A tank drains through a flat nozzle into a uniform sheet of water.
A knife edge stands in the sheet at a fraction k of its width, so k of every drop falls into the
result tank and the rest runs down a chute to the sump: the result is k · x.

**Integration.** A tank is an integrator by construction: its volume is the running total of
everything that has flowed in, V(t) = ∫ u dt. Turn the tap while it runs and a live trace plots
u(t) against the level. Open the capillary leak and the outflow becomes proportional to the
head (laminar flow), so the tank is a leaky integrator, and with the tap shut it decays
exponentially.

**Square root.** Torricelli's law (1643): water leaves an orifice at depth h with the speed of a
stone dropped from height h, v = √(2gh), so the *flow* is proportional to √h. A float valve holds
the head at x while a gate clock opens the orifice for exactly eight seconds; the collecting tank
then holds a volume proportional to √x. The jet's arc lengthens as √h too, and you can see it.

**Squaring with a shaped vessel.** The height water reaches depends on the shape of the glass. In
a V-shaped vessel the width grows in proportion to the height, so the volume up to level h is a
triangle, V = ½ s h². Fill the wedge to level x, empty it into a straight-sided tank, and that
tank reads x². A shaped vessel is a function generator: a horn with width ∝ h² gives x³, and a
logarithmic flare gives an exponential.

**Multiplication.** With a squaring vessel you can multiply the way 1950s electronic analogue
computers did, by the quarter-square rule x·y = ¼[(x+y)² − (x−y)²]. An upper wedge is filled to
level x + y and empties into a middle tank, whose scale reads ¼(x+y)². The middle tank then pours
into a lower wedge until a float valve shuts it at level |x − y|, which takes away ¼(x−y)². What
is left reads x·y.

## The physics is the source of truth

The levels are not animated toward the answer. A small lumped hydraulic model runs underneath:
vessels with a polynomial width profile w(h), orifices obeying Torricelli's law q = a√(2gh),
taps, a capillary leak, a knife-edge splitter, and float valves that shut a link exactly at a set
volume. Water leaving a spout is not teleported either: it is held as in-flight packets that land
after the ballistic fall time from the spout to the target's surface, so a level only rises when
its jet arrives. Because every drop that leaves one vessel is accounted for in another, and the
float valves clip their last step to the set point, the answers are exact to rounding error:
the dynamics decide *when* the machine settles, never *where*. The model has its own test suite
(run with the demo's build) that checks 3 + 4, 0.5 × 6, √9, 3², 2 × 3 and several other inputs
against the exact values, the Torricelli drain time against its closed form, and the leaky
integrator against the exponential solution.

## Rendering the water

The water you see is driven by that model. Each pipe's flow is turned into particles at its
spout, and a 2D position-based fluid (Macklin & Müller, 2013) with XSPH viscosity carries them
under the same gravity: the falling jets, the Torricelli arc, the sheet that the knife edge
splits and the film running down the chute. When a particle plunges below a tank's surface it is
absorbed and kicks a 1D wave equation running along that surface, so pours raise ripples and
bubbles. The particles and tank bodies are splatted into a half-resolution field with
Three.js, blurred into a smooth metaball surface, and composited with refraction of the
background through the water's normal, Beer–Lambert absorption with depth, animated caustics,
a Fresnel rim and a specular glint. The glass, etched scales, valve wheels and instruments are
drawn on top in Canvas 2D.
  `.trim(),
}

export default project
