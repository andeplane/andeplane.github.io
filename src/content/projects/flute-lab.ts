import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'flute-lab',
  title: 'Recorder Lab',
  description: 'Play a recorder-inspired physical model, follow its pressure waves into a room, and measure the notes with a microphone and Fourier spectrum.',
  tags: ['TypeScript', 'Physics', 'Acoustics', 'Web Audio', 'Interactive'],
  liveUrl: '/demos/flute-lab/',
  screenshot: '/blog/recorder-lab/preview.svg',
  longDescription: `
A steady breath supplies energy. A nonlinear labium boundary and a vibrating air column turn it into sound. Cover the holes and the acoustic path changes: the pitch follows the geometry.

Use **1–8** to play C5, D5, E5, F5, G5, A5, B5, and C6, or toggle individual holes with **QWERTYUIOP**. The scale buttons select fingerings, not oscillators. For a first melody, try **3 2 1 2 3 3 3**. The ten-hole layout is recorder-inspired, rather than an exact reproduction of standard recorder fingering.

The microphone sits in the simulated room. Its pressure signal is both the sound you hear and the input to the Fourier spectrum, with frequency and musical-note labels. Move it to hear how the room changes the signal. Slow the simulation down and the audible frequencies fall with it.

### How the model works

The narrow bore is a 96 kHz digital waveguide with left- and right-traveling pressure waves and three-port tone-hole scattering junctions. Fractional propagation delays come from physical segment lengths. The geometry is calibrated to a C5–C6 chromatic subset at the default breath setting.

Outgoing acoustic flows excite a separate 48 kHz, two-dimensional pressure–velocity room solver. Bore colors show waveguide pressure; room colors show the exterior solver's pressure. This coupling is one-way: exterior reflections do not affect the bore. The labium gain, tone-hole radiation loads, and losses are reduced models; this is not a full 3D turbulent-flow calculation.

This is a new experiment, separate from the unchanged [Tube Acoustics Lab](/#/projects/tube-sim).

### Sources

- [UNSW: flute acoustics](https://newt.phys.unsw.edu.au/jw/fluteacoustics.html)
- [Price, Johnston & McKinnon: the recorder air-jet amplifier](https://arxiv.org/abs/1502.02170)
- [Cook: waveguide flute synthesis with tone-hole junctions](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/integration-of-physical-modeling-for-synthesis-and-animation.pdf?c=icmc;idno=bbp2372.1995.153;format=pdf)
  `.trim(),
}

export default project
