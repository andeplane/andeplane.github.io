import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'water-logic',
  title: 'Water Logic',
  description:
    'A 4-bit binary adder made of water jets. A real lattice Boltzmann fluid simulation on the GPU, where colliding and wall-hugging jets decide every bit and you can watch the carry ripple through the chambers.',
  tags: ['TypeScript', 'WebGL2', 'Physics', 'Simulation', 'Fluid dynamics', 'Lattice Boltzmann'],
  liveUrl: '/demos/water-logic/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/water-logic',
  screenshot: '/projects/water-logic/preview.png',
  longDescription: `
Can water add? Not by pouring two buckets into a third (that works, but it is analogue and
it is not very interesting), but *digitally*: bits as jets that are either on or off, gates
as chambers that steer them, and a carry that ripples from one column to the next. In the
1960s people built real computers this way. This exhibit builds a four-bit ripple-carry
adder out of simulated water and lets you open the valves.

## What you are looking at

The board has four columns, one per bit, with the least significant bit on the right, like a
written number. Each column is a **full adder** built from three chambers:

- two **impact elements** (half adders), and
- one **wall-attachment OR element**, which merges their carries.

Toggle the valves A₀…A₃ and B₀…B₃ at the top (or use the presets), and watch the jets
switch. Glowing pipes carry each chamber's answer to the next chamber, the sum lights up
along the bottom, and the panel checks the number the water produced against the right
answer. 15 + 1 is the fun one: the carry has to fight its way through every column.

## How water computes

**The impact element.** A diamond-shaped chamber has a nozzle in each upper face. Each
nozzle fires along the opposite roof. A single jet clings to that roof and rides it round
into a side channel: that is the *sum*, A XOR B. When both nozzles fire they meet head-on
under the apex. Their sideways momenta cancel, and the merged jet drops straight down the
centre channel: that is the *carry*, A AND B. One chamber with no moving parts is a whole
half adder.

**The Coandă effect and the wall-attachment element.** A jet drags the water beside it
along. Next to a wall that water cannot be replaced, so the pressure drops and the jet is
pulled onto the wall, where it stays. This is the Coandă effect. A Y-shaped chamber with two
walls gives a jet two stable homes, which makes a **flip-flop**: one bit of memory in a
block of plastic. A short puff from a control port refills the low-pressure bubble, and the
jet lets go and locks onto the other wall. Here the bottom chamber of each column has an
always-on power jet that hugs its wall and pours out of the NOR channel. Either carry jet
knocks it off the wall and into the OR channel, and that is the carry out.

## Is it real?

The fluid is a two-dimensional **D2Q9 lattice Boltzmann** simulation in WebGL2: nine
populations per cell in ping-pong float textures, one fragment pass per time step, half-way
bounce-back walls, Smagorinsky sub-grid viscosity for stability at a Reynolds number of a few
hundred, velocity inlets for the nozzles and pressure outlets for the drains. Coloured dye is
advected by the computed velocity field. Nothing is keyframed.

Each chamber is its own fluid tile in one big lattice. Between them, a probe measures how
much water leaves through each output channel. Once a reading is clear and has held steady,
it opens or shuts the matching valve on the next chamber, the same job a tube and an
amplifier do in a real fluidic circuit. Every bit of the answer is decided by where the
simulated water went.

One wrinkle is worth knowing about. At this Reynolds number, a big eddy left over from the
previous answer can outlive the jet that made it and steer the next jet into the wrong
channel. That is a genuine memory effect in the fluid. So before a collision chamber
computes, it is **purged**: both jets fire for a moment, the collision sweeps the chamber
clean, and then the real inputs are applied.

A self-test runs on every build with no browser. It drives the CPU reference solver, which
uses the same constants as the GPU kernel. Each gate type must produce the right truth-table
rows from the simulated water, including switching between rows, and the wiring must decode
all 256 possible sums.

## A short history of fluidic computers

Fluid amplification was announced in 1960 by Billy Horton, Romald Bowles and Raymond Warren
at the US Army's Diamond Ordnance Fuze Laboratories. The wall-attachment flip-flop became
the basic building block of a new field, *fluidics*. It promised logic that would shrug off
radiation, heat, vibration and explosive atmospheres. Sperry Rand's FLODAC (1964) was a
small demonstration computer built from air-driven NOR gates, and fluidic controllers went
on to run machine tools and fly in jet engines. Transistors won on speed: a fluidic gate
needs about a millisecond for the fluid to cross the chamber. The idea lives on in
microfluidic logic on lab-on-a-chip devices.
  `.trim(),
}

export default project
