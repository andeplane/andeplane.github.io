---
title: "A radio you tune with two metal plates"
date: "2026-09-11"
description: "Five AM broadcasts, a solved wire antenna, a tunable LC circuit, a diode, and a measured speaker voltage. Building a radio from Maxwell's equations forward—and being precise about what is solved, what is verified, and what is still an approximation."
tags: ["Physics", "Electromagnetism", "Simulation", "WebGPU", "TypeScript"]
---

I wanted to turn a familiar object into an experiment. A radio is a particularly good one: a voice is somewhere in a rapidly oscillating electrical signal, and a few components can make it audible. If I move two metal plates apart, a different voice should come through. The choice should happen in the circuit—and the voice should get there the way it does in the world, as a field that pushes charge along a wire.

**[Open AM Radio Lab](/demos/am-radio/)** — start the receiver, then move the plate-separation slider or use the frequency presets.

![Five AM carriers and the recovered audio signal](/projects/am-radio/preview.svg)

This is primarily a physics project. The music gives electric fields, resonance and rectification something recognizable to carry. The first version of the lab had a boundary I had to state up front: the audible radio used an assumed antenna, and the Maxwell field on the WebGPU grid did not feed it. This version closes that gap. The chain is now `program → transmitter current → Maxwell field → induced charge on a solved dipole → loaded port → tuned LC → detector → measured speaker voltage`, and every arrow is either solved and tested or labelled as an approximation where it appears.

## Five stations share one field

The stations carry Joplin’s *The Entertainer*, Rachmaninoff playing Liszt in a 1919 recording, Roosevelt’s first fireside chat, a bell and a 1 kHz test tone. The carrier frequencies are 600, 750, 900, 1050 and 1200 kHz. The recorded music and speech loop through 90-second excerpts; sources and credits are included in the lab.

A carrier is a fast periodic oscillation. Amplitude modulation changes its strength in proportion to a slower message $m(t)$. Each transmitter is a sheet of current,

$$J(t)=J_0[1+\mu m(t)]\sin(2\pi f_ct),$$

and a sheet of current radiates a plane wave of amplitude $\eta_0 J/2$ in each direction. For a sinusoidal message, multiplying the two oscillations creates components at the carrier frequency and at $f_c-f_m$ and $f_c+f_m$. Those sidebands carry the audio variation, and the tests check that they arrive at the receiver with exactly the ratio $\mu/2$ the identity predicts.

The five fields add in the air. The preset buttons change the capacitor; they do not select a recording to play directly. Turning a transmitter off is a separate control.

## The last four hundred metres

Between the transmitters and the antenna the lab solves Maxwell’s equations in one dimension: a Yee grid of 32 cells, each 12 m, at the receiver circuit’s own time step of 40 ns. That grid has a property worth knowing. At a Courant number of exactly one, the one-dimensional Yee scheme is exact—waves cross one cell per step with no dispersion—but its Nyquist mode is a defective eigenmode, so rounding noise grows linearly, which matters during an hour of listening. The lab runs at 0.99 instead, where every mode is neutrally stable and the dispersion error at 1200 kHz is $8\times10^{-5}$.

There is a second property, less pleasant. Stepping even 32 cells 24.6 million times a second costs more than the audio thread has in JavaScript. So the audible receiver uses the *exact retarded solution* of the same problem—each transmitter’s waveform delayed by its distance over $c$ and scaled by $\eta_0/2$—while the grid recomputes every captured 20 μs window from the transmitter waveforms as you listen. The space–time plot under the scopes is that grid, and the deviation between the two solutions is printed beneath it: about a millivolt per metre for five carriers of one volt per metre. The tests pin the same agreement down more carefully, including a calibration for the fact that a source occupying one cell launches a slightly larger wave than an ideal sheet.

## The antenna is a conductor, not an assumption

The earlier version converted field to voltage with an assumed effective height and an assumed source resistance. The new antenna is a 2 m copper dipole of 1 mm radius, and its properties come from Maxwell’s equations in integral form. On a perfect conductor the tangential electric field must vanish, so the current on the wire has to radiate a field that cancels the incident one along the wire:

$$E^{\mathrm{inc}}_z(z)=j\omega A_z(z)+\partial_z\phi(z),\qquad A_z=\mu_0\!\int I(z')\,\frac{e^{-jkR}}{4\pi R}\,dz'.$$

Harrington’s method of moments turns that into a 41 × 41 complex system for the current on 41 segments. A generator in the centre gap gives the input impedance; a uniform tangential field gives the short-circuit current and the open-circuit voltage; the transmitting current distribution gives the effective height by reciprocity. The two routes to the effective height agree to 0.04 %. The classic benchmark checks the solver: a half-wave dipole at 0.47 λ comes out at 73.5 + j5.5 Ω, the textbook resonance near 73 Ω.

For this short antenna the numbers are $h_{\mathrm{eff}}=0.98$ m (the triangular-current limit is 1 m), $C_a=4.85$ pF (Schelkunoff’s estimate gives 4.71 pF) and a radiation resistance of 6.8 mΩ (the short-dipole formula gives 7.1 mΩ). Those vary by less than 0.02 % across the band, which is what justifies a single frequency-independent port in the time domain. The polarization law $\cos\theta$ is a result too: only the tangential component of the field enters the integral equation.

The port is a Thévenin equivalent, and for a linear antenna that equivalent is exact—the tests confirm that the moment-method solution with the actual tank as the gap load reproduces $V_{\mathrm{oc}}/(Z_a+Z_{\mathrm{load}})$ to one part in a million. In the circuit, the antenna’s capacitance sits on the tank node and its port current flows back through it. The tank loads the antenna; the antenna detunes the tank (the frequency readout includes its 4.85 pF); and the charge on the dipole’s arms, $\pm C_a(v_{\mathrm{oc}}-v)$, is what the 3D bench now colours. What the model does not include is stated where it matters: the port’s 33 mΩ resistance is a millionth of its reactance and is accounted as a loss rather than integrated, and the dipole’s scattered field is not fed back into the grid because its power is $10^{-8}$ of the incident power density.

## The tuning control stores electric energy

For two ideal parallel plates of overlap area $A_p$, separated by an air gap $d$,

$$C=\frac{\epsilon_0 A_p}{d}.$$

Capacitance measures how much charge is stored per volt. Widening the gap lowers the capacitance. With an inductor connected in parallel, the capacitor’s electric energy and the coil’s magnetic energy can exchange, and with the antenna capacitance on the same node the natural frequency is

$$f_0=\frac{1}{2\pi\sqrt{L(C+C_a)}}.$$

The lab uses a 250 μH inductor and a 10 × 10 cm plate overlap. About 125 pF in total tunes the pair to 900 kHz, of which the antenna supplies 4.85 pF. Pull the plates apart and the frequency rises.

The driven circuit also contains resistance. It responds over a finite bandwidth, which matters: passing only an infinitely narrow carrier would discard the sidebands and the music. The response plot shows the continuous-time transfer from incident field to tank voltage with the detector disconnected. The connected diode draws current and sets the real selectivity—about 18 dB against the neighbouring station 150 kHz away, because the detector loads the tank to a Q near 25 whatever the coil’s own Q of 70 would allow.

## A diode makes the envelope available

The RF voltage swings positive and negative hundreds of thousands of times a second. Its slow average is almost zero. A diode allows current to charge a detector capacitor mainly near positive peaks. Between peaks, a resistor drains that capacitor. Its voltage can then follow the slowly changing envelope.

The simulated tank voltage $v$, coil current $i_L$, and detector voltage $u$ evolve together, driven by the port:

$$(C+C_a)\dot v=C_a\dot v_{\mathrm{oc}}-\frac{v}{R_p}-i_L-i_D,\qquad L\dot i_L=v,\qquad C_d\dot u=i_D-\frac{u}{R_d}.$$

The diode uses a piecewise-linear approximation:

$$i_D=\max\left(0,\frac{v-u-0.15\,\mathrm V}{2\,\mathrm{k}\Omega}\right).$$

That last detail matters: the detector takes its charging current from the tank in the same solve. It is not an envelope curve calculated independently of the circuit’s load.

Try disconnecting the diode. RF can remain in the tank, while the detector discharges and the sound disappears. Or increase the detector’s RC time: storing peaks for too long prevents it from following a falling audio envelope. The full theory in the lab develops the useful time-scale separation and its limits.

## The sound is a measured voltage, and every joule has a column

An ideal buffer feeds four 5 kHz low-pass stages. A 30 Hz high-pass coupling stage removes the envelope’s DC offset, and a powered voltage amplifier drives an 8 Ω resistor. This resistor is the deliberately simple speaker model requested for the experiment.

The amplifier has finite voltage rails and a 1 Ω output resistance. Its energy comes from its assumed power supply, not from the antenna, and the meter row makes that visible: the field delivers tens of microwatts into the port, the speaker resistor dissipates milliwatts. Multiplying each circuit equation by its state and adding gives an exact energy balance—port energy in equals the change in stored energy plus every dissipation—and the implicit-midpoint integrator preserves it in discrete form to one part in $10^9$ over forty thousand steps. A number in that row deserves a pause: a conjugately matched load could take watts from this field, because a short dipole’s radiation resistance is so small. A crystal set with a 100 kΩ tank takes a millionth of that. The mismatch is the price of not building a 37 kΩ matching network.

The circuit runs in an AudioWorklet with 512 RF substeps per audio sample—24.576 million steps per second at 48 kHz audio. The midpoint rule has numerical dispersion even though it is stable: a 0.4 % frequency shift at 900 kHz, which at this Q would cost 4 % of amplitude. The coil is pre-warped so the discrete tank resonates exactly where the readout says, and the time-domain amplitude then matches the frequency-domain moment-method solution within 3 %. The audio thread’s load is measured and shown—about 40 % of one core on an M-series machine—together with the output latency.

## Where Maxwell’s equations are solved in two dimensions

The field experiment solves the two-dimensional TMz Maxwell equations on a staggered Yee grid. There is an electric component perpendicular to the slice and two magnetic components in the slice. Neighboring field values determine each update, so many cells can be computed in parallel on WebGPU.

A line current launches a cylindrical wave; add a conducting screen with an aperture and reflection and diffraction follow from the boundary conditions. The first version absorbed the edges with a lossy sponge. Measuring it was sobering: −12 dB at normal incidence, and at grazing incidence so much reflection that the domain behaved as a leaky waveguide and the field along the axis stopped falling as $1/\sqrt r$. It is now a split-field perfectly matched layer of 24 cells: below −60 dB at normal incidence, and the field decays as $1/\sqrt r$ to four digits, which is the evidence for oblique absorption. The amplitude matches the analytic Green’s function of a line current within 2 %, and the numerical wavelength is within 0.1 % of $c/f$.

This grid needs 133 million steps per second of physical time. A GPU does not make a sequential time march faster; it makes each step’s 32 768 cells affordable. So the full-wave path runs deliberately off line, as a labelled slow mode: the transmitter stream of all five modulated programs is written for every step, the GPU solves it in batches while recording the receiver cell, and that series drives the identical antenna port and receiver chain at the grid’s 7.5 ns step. Two milliseconds of physical time take about four seconds—some two thousand times slower than real time—and the 1 kHz tone comes out of the 2D field with the same detector delay the real-time path has. Nothing in that path touches the audio or the real-time solution.

## What is still an approximation

The real-time path is one-dimensional: plane waves, one direction, no ground or terrain, no 3D near field of the antenna. The 2D source is a line current, not a broadcast tower. The antenna port is evaluated at 900 kHz and held constant. The diode has no junction capacitance or reverse leakage; the coil loss is a single resistance; the amplifier and its supply are ideal; the speaker is a resistor and the drawn cone is a voltage indicator. The README lists these with the measured numbers, and the lab labels each one where it appears. [Issue #63](https://github.com/andeplane/andeplane.github.io/issues/63) tracked this work.

## There is some real history in the signal

The earliest voice broadcasts and the earliest surviving recordings are different questions. The National Park Service describes Fessenden’s 1900 voice transmission, while the famous Christmas Eve 1906 broadcast has a more debated historical record. The Hammond Museum’s linked 1906 audio is explicitly a **2006 recreation**; it is not an original recording from the event.

The 900 kHz program in this lab is actual archival audio of Roosevelt’s 12 March 1933 fireside chat. The FDR Library lists the recording in its collection. The 600 kHz Joplin piece, by contrast, is a modern recorded performance of an old composition, not a recording of Joplin himself. Those distinctions are in the credits and the lab’s history section.

For me, the satisfying experiment is still very small: change a distance between plates, watch the electrical response move, and hear what reaches the output. What changed is that the antenna is now as observable as the plates—rotate it and watch the charge on its arms vanish with the tangential field.

## Sources and further exploration

- [MIT: Electromagnetics and Applications](https://ocw.mit.edu/courses/6-013-electromagnetics-and-applications-spring-2009/d3be4ea78b036a6362230fb41780cf54_MIT6_013S09_notes.pdf), for resonators, receiving antennas and energy.
- [John B. Schneider: Understanding the FDTD Method](https://eecs.wsu.edu/~schneidj/ufdtd/), for staggered field updates, stability, the magic time step and boundaries.
- [R. F. Harrington, Field Computation by Moment Methods](https://ieeexplore.ieee.org/document/6773568), for the thin-wire integral equation solved for the antenna.
- [J.-P. Berenger, A perfectly matched layer for the absorption of electromagnetic waves](https://doi.org/10.1006/jcph.1994.1159), for the PML.
- [National Park Service: Reginald Fessenden](https://www.nps.gov/people/reginaldfessenden.htm), [the historical debate](https://www.thebdr.net/what-do-we-really-know-about-reginald-fessenden/), and [the Hammond Museum recreation](https://www.hammondmuseumofradio.org/fessenden-2006-recreation.html).
- [FDR Library audio catalogue](https://www.fdrlibrary.org/utterancesfdr).
- [Project details](/projects/am-radio), [Physics interests](/interests/physics), and [the full interactive lab](/demos/am-radio/), including recording credits and more detailed derivations.
