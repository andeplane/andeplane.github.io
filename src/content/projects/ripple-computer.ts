import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ripple-computer',
  title: 'The Ripple Computer',
  description:
    'A tank of water that learns. Wave-makers play a question into a 3D ripple tank, ripples scatter off basalt pillars, sixteen probes listen, and a linear readout trained in your browser answers XOR and reads hand-drawn digits.',
  tags: ['TypeScript', 'Three.js', 'WebGL2', 'Physics', 'Machine Learning', 'Simulation'],
  liveUrl: '/demos/ripple-computer/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/ripple-computer',
  screenshot: '/projects/ripple-computer/preview.png',
  screenshotAlt:
    'A 3D ripple tank in a dark gallery: basalt pillars stand in rippling water over a tiled floor lit by caustics, with glowing probes and a readout panel answering 1 XOR 0 = 1.',
  longDescription: `
In 2003 Chrisantha Fernando and Sampsa Sojakka put a glass bucket of water on an
overhead projector, attached small motors to its sides, filmed the ripples, and
trained a simple linear classifier on the video. The water did the hard part. Their
paper, *Pattern Recognition in a Bucket*, solved XOR and told a spoken "zero" from a "one" with
nothing between the input and a single layer of weights except a tank of water. This
exhibit rebuilds that bucket in the browser and lets you watch it think.

## What you are looking at

A ripple tank with seven wave-makers along its left wall, a field of basalt pillars in
the middle and sixteen probes in the open water to the right. Every run starts from
still water. The wave-makers play the input, the ripples spread, bounce off the stones
and the walls and interfere, and the probes record the surface height over time. When
the run ends, a trained linear readout turns those sixteen recordings into an answer.
The probes then glow gold if their signal pushed the vote towards the answer and blue
if it pushed against it.

The water is a real simulation, not an animation. The tank you see is the same solver
that produced the training data: a 2D wave equation with damping, absorbing "beaches"
on three walls and a weak shallow-water nonlinearity (crests travel a little faster
than troughs). The 3D view is drawn from that heightfield in Three.js: the surface
refracts the tiled floor and reflects the gallery's strip lights, and the caustics,
the bright dancing lines on the floor, come from refracting a fine grid of light rays
through the actual surface every frame.

## Reservoir computing

The idea is called *reservoir computing*. You take a rich dynamical system you do not
train at all (a recurrent network with random weights, a laser, a bucket of water)
and drive it with your input. Its state ends up as a high-dimensional, nonlinear,
fading echo of everything that went in. You then train only a linear readout on that
state. Training a linear readout is easy and fast: here it is ridge regression solved
in closed form, one weight per feature per class, fitted in milliseconds.

Hughes, Williamson, Minkov and Fan (*Wave physics as an analog recurrent neural network*,
Science Advances, 2019) made the connection exact: one time step of a discretised wave
equation *is* the update of a recurrent neural network, with the wave speed field as
its weights. They then trained the material itself, inverse-designing the obstacles so
that a vowel's energy ends up at the right output port.

## XOR: why the water matters

XOR is the classic test because no straight line separates it: (0,0) and (1,1) belong
to one class, (1,0) and (0,1) to the other. A linear readout on the two input bits is
stuck at chance, and the exhibit shows that: trained on the same noisy examples, it
scores 50%.

Send the same bits into the tank instead. Each bit switches one wave-maker on or off.
With both on, their ripples overlap and interfere, so the probes see something that is
not just the sum of what each wave-maker produces alone. The readout features are
nonlinear in the surface height (the ripple amplitude at the drive frequency, as a
lock-in amplifier would read it, and the mean squared height, which is roughly what
Fernando and Sojakka's camera saw as brightness), so that interference term shows up
in the features. With it, the very same kind of linear readout gets 100% on unseen
noisy trials.

## Digits

The second task draws a digit on a 5×7 grid and plays it into the tank like a piano
roll: each row is one wave-maker, the columns are played one after another in time.
The readout is trained on 300 noisy runs (pixels flipped, the whole drawing nudged by
one pixel, wave-maker amplitude and timing jittered) and scored on 100 new ones. The
water reaches about 92%, while the same linear readout on the raw pixels gets about
82%: the ripples smear a one-pixel shift into a small change in the probe signals,
where on the raw pixels it is a completely different picture. You can draw your own.

## Honest caveats

The tank is two-dimensional, linear apart from a weak shallow-water term, and has no
surface tension or viscosity beyond a damping constant. The interesting nonlinearity
for XOR comes mostly from interference plus the squared-height features, not from
turbulence. Training runs in Web Workers on the same solver; the build includes a test
that checks volume conservation, the wave arrival time at a probe, and that XOR is
learnable from the water but not from the raw bits.
  `.trim(),
}

export default project
