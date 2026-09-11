---
title: "From a steady breath to a measured note"
date: "2026-09-11"
description: "Building a playable recorder model: steady breath, acoustic feedback, tone holes, a microphone in a simulated room, and a Fourier plot that can disagree with the button you pressed."
tags: ["Physics", "Music", "Acoustics", "Simulation", "TypeScript", "Web Audio"]
---

After building the [Tube Acoustics Lab](/#/projects/tube-sim), I wanted to try something more musical. Could I give a tube a steady breath, cover its holes with the keyboard, and play a tune? And could the sound come from a microphone somewhere in the simulated room?

That became **[Recorder Lab](/#/projects/flute-lab)**. Hold **Space** to blow, release it to stop, or toggle continuous airflow with the button. Keys **1–8** select fingerings for C5 through C6. Try **3 2 1 2 3 3 3** as a first melody. **QWERTYUIOP** lets you experiment with the individual holes.

![An illustration of Recorder Lab, connecting a recorder bore to room radiation and a microphone spectrum](/blog/recorder-lab/preview.svg)

## A steady breath is not yet a note

The first difficulty is that the input is steady, but sound is an oscillation. Adding a constant source to a linear acoustic solver does not automatically produce a singing flute. Something must turn that supplied energy into repeated pressure variations.

In a recorder, a narrow windway directs the breath toward an edge at the open window. The air jet and the acoustic motion interact, and the resonator helps determine which oscillation is sustained. The player keeps supplying the energy lost through radiation and other losses. [UNSW's flute acoustics introduction](https://newt.phys.unsw.edu.au/jw/fluteacoustics.html) explains this connection between steady power, jet motion, and resonance particularly well.

My first reduced feedback source was not good enough. Opening all the holes changed the sound, but checking the intermediate fingerings exposed the problem: several produced almost the same low pitch, while others jumped to a different mode. Two working endpoint examples did not make a playable instrument.

So the useful test became a scale, including changing fingerings while the instrument was already sounding.

## The mouthpiece is sealed; the window is open

There was another misleading detail in the first version: I drew the source as an open end of the tube. That looks more like blowing across an exposed opening than playing a *blokkfløyte*.

The recorder's windway and window are separate parts. The inlet sits in the player's mouth; the jet meets the labium farther along, at a window open to the surrounding air. [Yamaha's recorder anatomy guide](https://www.yamaha.com/en/musical_instrument_guide/recorder/mechanism/) makes that distinction visible.

The app now draws a sealed mouthpiece and a separate labium window. Its head radiation source is at the window, not at the mouth inlet. Sound can still travel around the instrument into the air near the mouthpiece; sealing the inlet does not make the surrounding room silent.

## A bore that is practical to play

The current instrument uses traveling pressure waves in a one-dimensional bore. A wave moving down a segment takes

$$
\tau = \frac{\ell}{c}
$$

to traverse its length $\ell$, where $c = 343\,\mathrm{m/s}$. Two fractional delay lines per segment carry the waves in opposite directions. This is a digital waveguide implementation of propagation in a narrow tube.

At a hole, the incoming waves scatter between the two bore directions and an outward radiation load. With normalized bore admittances, incoming pressure waves $a$ and $b$, and hole admittance $Y_h$, the junction pressure is

$$
p_j = \frac{2(a+b)}{2+Y_h}.
$$

The outgoing bore waves are $p_j-a$ and $p_j-b$; the outward normalized flow is $Y_h p_j$. A closed hole has $Y_h=0$. The downstream bore remains in the calculation even when an earlier hole is open. [Cook's work on waveguide flute synthesis](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/integration-of-physical-modeling-for-synthesis-and-animation.pdf?c=icmc;idno=bbp2372.1995.153;format=pdf) describes using tubing sections and tone-hole scattering junctions in playable physical models.

The labium is represented by a saturating active reflection: a reduced feedback boundary that replenishes acoustic energy from the breath control. It does **not** resolve the actual jet. Gain saturation and the limits of reduced jet descriptions matter here; [Price, Johnston and McKinnon's air-jet amplifier study](https://arxiv.org/abs/1502.02170) is useful background, rather than a claim that this app reproduces their experimental model.

The bore length and hole positions are calibrated for a chromatic subset from C5 to C6 at the default breath setting. Calibration changes the physical segment lengths, accounting for the phase shifts introduced by the boundary and filters. During playback, a note button only changes which holes are covered. It does not start an oscillator at a requested frequency.

These are simplified recorder-inspired fingerings with ten independent holes, not a standard recorder fingering chart. Covering holes from the mouthpiece toward the bell gives a useful progression; changing a hole beyond an earlier open hole often has a smaller effect.

## The microphone gets the room's pressure

The bore runs at 96 kHz. Its outgoing acoustic flows feed a separate two-dimensional pressure–velocity solver running at 48 kHz:

$$
\frac{\partial \mathbf{u}}{\partial t}=-\frac{1}{\rho}\nabla p,
\qquad
\frac{\partial p}{\partial t}=-\rho c^2\nabla\cdot\mathbf{u}.
$$

This room has a 96 by 40 grid, 12 mm cells, rigid instrument geometry, and absorbing layers around its edges. The microphone samples one exterior pressure cell. Move it and you change the signal being measured. That raw signal feeds the Fourier analysis; the audio branch also applies DC filtering, gain, and soft limiting before reaching the speakers.

There is an important limit: the coupling is **one-way**. The bore excites the room, but room reflections do not return to influence the bore. Fine openings are represented as radiation sources on the room grid. The colors inside the instrument show waveguide pressure; the exterior colors show the room solver's pressure. Source strength is normalized for the demonstration, so the pressure display is not an absolute sound-level prediction for a real recorder.

This is a different tradeoff from the original Tube Acoustics Lab, which resolves the bore and exterior together to investigate what happens at an opening. That app remains unchanged. Here I wanted a playable, tunable instrument while retaining explicit propagation from its openings to a microphone. The hybrid model makes that affordable, at the cost of simplifying the hole radiation, losses, and fluid feedback.

## Let the measurement answer

The Fourier plot sits beside the pressure field, where I can see it while playing. Its x-axis labels both frequency and musical note. A Hann-windowed FFT separates the microphone trace into spectral components, and a peak estimate with a lower-harmonic check marks a likely fundamental.

In the browser, the default C fingering measured about **523.2 Hz**, D about **587.3 Hz**, and E about **659.3 Hz**. These readings come from the microphone history, independently of the selected fingering's name. During a transition the analysis window contains some of both notes, so the readout can briefly lag or become ambiguous.

Slowing the simulation changes the sound too. At quarter speed, a second of simulated history occupies four seconds of listening time:

$$
f_{\mathrm{heard}} = s\,f_{\mathrm{simulation}}.
$$

C5 therefore becomes C3 at $s=1/4$. At a thousandth of real speed, the pressure field becomes easier to follow, but the oscillation falls below hearing. I like that these are two views of the same history.

## What I check

The tests cover silent air without excitation, stable time stepping, wave arrival time, all calibrated fingerings, and live note transitions measured in the room. They also check that removing feedback removes the sustained tone, that releasing the breath lets the field decay, and that changing playback speed stretches the same simulated history.

Those checks establish useful behavior for this model. They do not establish that it sounds exactly like a particular wooden recorder, or that the simplified jet captures all the ways a real player can articulate and overblow.

**[Play Recorder Lab](/#/projects/flute-lab)**, or find it alongside the interval trainer and the original tube experiment under **[Music](/#/interests/music)**. The prominent **How does it work?** button inside the app explains the controls and the model while you have the experiment in front of you.
