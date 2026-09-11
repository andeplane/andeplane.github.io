---
title: "A radio you tune with two metal plates"
date: "2026-09-11"
description: "Five AM broadcasts, a tunable LC circuit, a diode, and a measured speaker voltage. Building a radio from physical equations—and being precise about the Maxwell-to-antenna connection that is still missing."
tags: ["Physics", "Electromagnetism", "Simulation", "WebGPU", "TypeScript"]
---

I wanted to turn a familiar object into an experiment. A radio is a particularly good one: a voice is somewhere in a rapidly oscillating electrical signal, and a few components can make it audible. If I move two metal plates apart, a different voice should come through. The choice should happen in the circuit.

**[Open AM Radio Lab](/demos/am-radio/)** — start the receiver, then move the plate-separation slider or use the frequency presets.

![Five AM carriers and the recovered audio signal](/projects/am-radio/preview.svg)

This is primarily a physics project. The music gives electric fields, resonance and rectification something recognizable to carry. There is also an important boundary to explain immediately: **the audible radio and the spatial Maxwell simulation are currently separate experiments.** The circuit receives voltage from an approximate antenna model. The WebGPU field does not yet induce the voltage that you hear.

## Five stations share one input

The stations carry Joplin’s *The Entertainer*, Rachmaninoff playing Liszt in a 1919 recording, Roosevelt’s first fireside chat, a bell and a 1 kHz test tone. The carrier frequencies are 600, 750, 900, 1050 and 1200 kHz. The recorded music and speech loop through 90-second excerpts; sources and credits are included in the lab.

A carrier is a fast periodic oscillation. Amplitude modulation changes its strength in proportion to a slower message $m(t)$:

$$s(t)=A[1+\mu m(t)]\sin(2\pi f_ct).$$

Here $A$ is the unmodulated carrier amplitude and $\mu$ controls modulation depth. For a sinusoidal message, multiplying the two oscillations creates components at the carrier frequency and at $f_c-f_m$ and $f_c+f_m$. Those neighboring frequencies are the sidebands that carry the audio variation.

All five station voltages add before entering the circuit. The preset buttons change the capacitor; they do not select a recording to play directly. Turning a transmitter off is a separate control.

## The tuning control stores electric energy

For two ideal parallel plates of overlap area $A_p$, separated by an air gap $d$,

$$C=\frac{\epsilon_0 A_p}{d}.$$

Capacitance measures how much charge is stored per volt. Widening the gap lowers the capacitance. With an inductor connected in parallel, the capacitor’s electric energy and the coil’s magnetic energy can exchange:

$$U_C=\tfrac12Cv^2,\qquad U_L=\tfrac12Li^2.$$

In an isolated ideal LC pair, the capacitor current balances the inductor current. Combining $C\dot v=-i$ with $L\dot i=v$ gives $\ddot v+v/(LC)=0$. Its natural frequency is therefore

$$f_0=\frac{1}{2\pi\sqrt{LC}}.$$

The lab uses a 250 μH inductor and a 10 × 10 cm plate overlap. About 125 pF tunes the ideal pair to 900 kHz, corresponding to a gap near 0.708 mm. Pull the plates apart and the frequency rises.

The driven circuit also contains resistance. It responds over a finite bandwidth, which matters: passing only an infinitely narrow carrier would discard the sidebands and the music. The response plot shows the continuous-time tank response with the detector disconnected. The connected diode draws current and changes the loaded response; the plot is not advertised as a measured spectrum of that nonlinear circuit.

## A diode makes the envelope available

The RF voltage swings positive and negative hundreds of thousands of times a second. Its slow average is almost zero. A diode allows current to charge a detector capacitor mainly near positive peaks. Between peaks, a resistor drains that capacitor. Its voltage can then follow the slowly changing envelope.

The simulated tank voltage $v$, coil current $i_L$, and detector voltage $u$ evolve together:

$$C\dot v=\frac{v_s-v}{R_s}-\frac{v}{R_p}-i_L-i_D,$$

$$L\dot i_L=v,\qquad C_d\dot u=i_D-\frac{u}{R_d}.$$

The diode uses a piecewise-linear approximation:

$$i_D=\max\left(0,\frac{v-u-0.15\,\mathrm V}{2\,\mathrm{k}\Omega}\right).$$

That last detail matters: the detector takes its charging current from the tank in the same solve. It is not an envelope curve calculated independently of the circuit’s load.

Try disconnecting the diode. RF can remain in the tank, while the detector discharges and the sound disappears. Or increase the detector’s RC time: storing peaks for too long prevents it from following a falling audio envelope. The full theory in the lab develops the useful time-scale separation and its limits.

## The sound is a measured voltage

An ideal buffer feeds four 5 kHz low-pass stages. A 30 Hz high-pass coupling stage removes the envelope’s DC offset, and a powered voltage amplifier drives an 8 Ω resistor. This resistor is the deliberately simple speaker model requested for the experiment.

The amplifier has finite voltage rails and a 1 Ω output resistance. Its energy comes from its assumed power supply, not from the antenna. The output meter calculates

$$P=\frac{\langle V_R^2\rangle}{8\,\Omega}.$$

The scope and browser audio use that same $V_R$. A separate listening-volume control changes how loudly the browser plays it without changing the simulated circuit’s power. There is no mechanical speaker-cone model; the drawn cone is a voltage indicator.

The circuit runs in an AudioWorklet with 512 RF substeps per audio sample—24.576 million steps per second at 48 kHz audio. An implicit-midpoint solve handles the coupled circuit. It has numerical dispersion even though it is stable; time-step refinement is part of the tests. Stability alone is not evidence of accuracy.

## Where Maxwell’s equations enter—and where they do not yet

The separate field experiment solves the two-dimensional TMz Maxwell equations on a staggered Yee grid. There is an electric component perpendicular to the slice and two magnetic components in the slice. Neighboring field values determine each update, so many cells can be computed in parallel on WebGPU.

A monochromatic line-current source launches a wave. Add a conducting screen with an aperture and reflection and diffraction follow from the boundary conditions and updates. The edges use a lossy sponge to reduce returning waves; it is not an exact open boundary. The field experiment runs on a deliberately slowed microsecond clock.

The audible antenna currently uses a different, analytic model:

$$V_{\mathrm{oc}}=h_{\mathrm{eff}}E\cos\theta.$$

An assumed effective height converts incident electric field into open-circuit voltage, and an assumed source resistance couples it to the tank. Rotating the antenna to 90° removes that projection. This is a useful receiving-antenna approximation, but **the charge distribution and terminal voltage have not emerged from a Maxwell solve around a conducting antenna**.

Connecting those two experiments requires modulated fields, a suitable finite-antenna geometry and feed port, and a consistent exchange of voltage, current and power with the loaded receiver. A circuit drawing is measured in centimeters and fractions of millimeters; a 900 kHz wavelength is roughly 333 meters. The different length and time scales are a central numerical problem.

[Issue #63 tracks that remaining work](https://github.com/andeplane/andeplane.github.io/issues/63), including antenna benchmarks, loading back-action, boundaries, resampling and performance. Until that is done, the accurate description is a physical circuit simulation plus a separate Maxwell field experiment.

## There is some real history in the signal

The earliest voice broadcasts and the earliest surviving recordings are different questions. The National Park Service describes Fessenden’s 1900 voice transmission, while the famous Christmas Eve 1906 broadcast has a more debated historical record. The Hammond Museum’s linked 1906 audio is explicitly a **2006 recreation**; it is not an original recording from the event.

The 900 kHz program in this lab is actual archival audio of Roosevelt’s 12 March 1933 fireside chat. The FDR Library lists the recording in its collection. The 600 kHz Joplin piece, by contrast, is a modern recorded performance of an old composition, not a recording of Joplin himself. Those distinctions are in the credits and the lab’s history section.

For me, the satisfying experiment is still very small: change a distance between plates, watch the electrical response move, and hear what reaches the output. Then ask what would be required for the antenna itself to become an equally observable part of that mechanism.

## Sources and further exploration

- [MIT: Electromagnetics and Applications](https://ocw.mit.edu/courses/6-013-electromagnetics-and-applications-spring-2009/d3be4ea78b036a6362230fb41780cf54_MIT6_013S09_notes.pdf), for resonators, receiving antennas and energy.
- [John B. Schneider: Understanding the FDTD Method](https://eecs.wsu.edu/~schneidj/ufdtd/), for staggered field updates, stability and boundaries.
- [National Park Service: Reginald Fessenden](https://www.nps.gov/people/reginaldfessenden.htm), [the historical debate](https://www.thebdr.net/what-do-we-really-know-about-reginald-fessenden/), and [the Hammond Museum recreation](https://www.hammondmuseumofradio.org/fessenden-2006-recreation.html).
- [FDR Library audio catalogue](https://www.fdrlibrary.org/utterancesfdr).
- [Project details](/projects/am-radio), [Physics interests](/interests/physics), and [the full interactive lab](/demos/am-radio/), including recording credits and more detailed derivations.
