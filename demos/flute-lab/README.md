# Recorder Lab

A new, independent demo. `demos/tube-sim` is unchanged.

```sh
npm install
npm run dev
npm test
```

Open `/demos/flute-lab/`. The homepage build discovers this demo automatically
through `scripts/build-demos.mjs`; its project page embeds it using `?embed=1`.

## Play

- Hold **Space** to blow; release to stop. This also starts Web Audio.
- The airflow button toggles sustained blowing. Space takes over from the toggle,
  so releasing it always stops that breath. Leaving the window releases held Space.
- Keys **1–8** choose C5 D5 E5 F5 G5 A5 B5 C6 fingerings.
- Keys **QWERTYUIOP** independently toggle the ten holes. Cover from the
  mouthpiece toward the bell; closing downstream of an open hole has little effect.
- `3 2 1 2 3 3 3` is a first melody to try.
- Click the exterior field to move the microphone.
- Speed changes the number of simulated seconds per listening second, from 1 to
  0.0001. Pitch changes with it. Slowest speeds move below human hearing.
- Pause freezes physics and silences output. Zero breath allows the field to decay.

## Model and limits

This is a **hybrid reduced physical model**, not direct numerical simulation of
jet turbulence or a calibrated reproduction of a particular recorder.

`bore.ts` solves traveling pressure waves using fractional delay lines at 96 kHz.
Each open tone hole is a three-port, admittance-weighted scattering junction:
`p = 2(a + b)/(2 + Yhole)`, with outgoing bore waves `p-a`, `p-b` and outward
normalized flow `Yhole*p`. Closed holes have zero shunt admittance. Both directions
remain present past the first open hole, so custom combinations can affect tuning.
The constant resistive radiation load is simplified; chimney inertance is omitted.

At the labium, a saturating active reflection replenishes acoustic energy from
steady breath. Its high-/low-pass response suppresses DC and extreme high modes.
It is a phenomenological jet boundary, without a convective jet simulation.
Increasing the jet-gain control changes this feedback strength. No note oscillator,
periodic driver, recording, or MIDI pitch generator is used.

Physical bore length is 0.324113 m. The ten hole positions are calibrated with
`tools/calibrate.ts` for a chromatic subset (C5, D5, E5, F5, F-sharp5, G5, A-flat5,
A5, B-flat5, B5, C6) at default breath/gain. Calibration adjusts lengths, accounting
for boundary/filter phase. Playback uses those fixed lengths, never target Hz.
These simplified fingerings are not a standard recorder fingering chart.

`physics.ts` solves the exterior pressure–velocity equations on a 96×40 staggered
grid (12 mm cells, 48 kHz steps, c=343 m/s, rho=1.2 kg/m³). CFL is 0.5955,
below the 2D stability bound. Sponge layers absorb edge reflections. The bore is
masked out of this solver. Its low-pass-filtered outgoing flows are deposited at
exterior opening locations; fine openings are subgrid radiation sources.
Coupling is **one-way**: room pressure does not feed back into the bore. Bore
colors come from the waveguide; exterior colors from the room solver. The fixed arrow is schematic steady breath, not resolved fluid motion. The
mouthpiece inlet is sealed; there is no exterior acoustic source there. A
separate open labium window above the block receives the head radiation source.

Source amplitude uses an illustrative normalization. Pressure is in model Pa;
it is not a prediction of an actual recorder's absolute sound-pressure level.

`audio-worklet.ts` advances the fixed-rate physics clock and interpolates the room
microphone onto the audio-device clock. The same raw pressure history feeds a
16,384-sample Hann-windowed FFT. The audio branch additionally uses an 8 Hz DC
filter, fixed gain, and soft limiting. Relative-dB spectra label equal-tempered
frequencies/notes and estimate the fundamental with peak interpolation and a
lower-harmonic check. Onsets, rapid note changes, very quiet signals, and extreme
slow motion can temporarily make the estimate unreliable. The axis describes
**listening-time** frequencies, so quarter speed moves C5 to C3.

## Validation

`npm test` builds/types-checks the demo, checks CFL, silence, wave arrival,
all calibrated fingerings, live note transitions at the actual room microphone,
feedback dependence, decay, bounded extreme controls, and FFT estimation. It also
executes the production AudioWorklet in a test harness to verify clock/pitch
scaling, pause, reset, and finite output. CPU speed is printed as a diagnostic,
not guaranteed across devices.

## Research

- [UNSW flute acoustics](https://newt.phys.unsw.edu.au/jw/fluteacoustics.html):
  steady flow supplies energy; acoustic feedback and holes select resonance.
- [Cook, waveguide flute and tone-hole junctions](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/integration-of-physical-modeling-for-synthesis-and-animation.pdf?c=icmc;idno=bbp2372.1995.153;format=pdf).
- [Price, Johnston & McKinnon (2015)](https://arxiv.org/abs/1502.02170):
  air-jet amplifier gain saturation and the limitations of reduced jet models.
- [Tube Acoustics Lab](https://andeplane.github.io/#/projects/tube-sim): the
  separate original experiment and inspiration for visualizing exterior pressure.
