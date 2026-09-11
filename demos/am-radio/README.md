# In the Air — AM Radio Lab

Standalone Vite / TypeScript demo. Run `npm ci`, `npm run dev -- --port 5178`, `npm test`, `npm run build` in this directory. The homepage's existing `build:demos` automatically stages the output at `/demos/am-radio/`. `node --experimental-strip-types scripts/measure.ts` prints the table below.

## The chain

`program → current sheet → Maxwell (1D grid) → incident E → dipole port (method of moments) → tuned LC with back-action → diode → RC detector → filters → amplifier → measured 8 Ω voltage`

Every arrow is solved or labelled as an approximation:

- **Transmitters.** Five current sheets at 600, 750, 900, 1050 and 1200 kHz, modulated by the programs with a first-order hold between audio samples. Each sheet radiates E = −η₀J/2; calibrated so the "incident E per carrier" slider is the plane-wave amplitude at the antenna.
- **Propagation (real time).** The last 382 m of the path is a 32-cell Yee grid (Δx = 12.32 m, S = 0.99, Mur ends) at the circuit's 24.576 MHz step; transmitters 209–308 m from the antenna. The audible receiver uses the *exact retarded plane-wave solution* of that problem (the grid cannot be stepped 24.6 million times a second in JavaScript on the audio thread). The grid recomputes every captured 20.8 μs window from the transmitter waveforms while you listen, and the deviation between grid and exact field is shown live (≈1–2 mV/m for five carriers of 1 V/m). This is an explicitly bounded reduced-dimensional model: plane waves, one direction, no ground, no antenna scattering fed back into the grid.
- **Antenna.** A 2 m centre-fed copper dipole of 1 mm radius, solved by a thin-wire method of moments (Harrington pulse/point matching, 41 segments) at the five carriers: h_eff, C_a, R_rad from the wire geometry; R_ohm from the skin effect. Open-circuit voltage from the receiving solve equals h_eff from reciprocity to 0.04 %. The Thévenin port with the tank as the gap load reproduces the full loaded MoM solution to 1e-6. Band spread of h_eff and C_a is under 0.02 %, which justifies one frequency-independent port in the time domain. The incident field is uniform along the wire to 1e-5 (subcell port on a 12 m cell).
- **Coupling.** The port injects C_a·dv_oc/dt into the tank node; C_a is part of the resonance and the port current flows back through it (load back-action). R_a = 33 mΩ is 9e-7 of the port reactance and is left out of the time stepping; its dissipation (re-radiation + copper) is estimated from the port current and reported. The scattered field of the dipole is not re-injected into the grid (1e-8 of the incident power density).
- **Circuit.** 250 μH coil with R_p = 100 kΩ loss (Q ≈ 71), variable 10 × 10 cm air capacitor, 0.15 V / 2 kΩ piecewise-linear diode, 100 kΩ detector with adjustable C, four buffered 5 kHz low-pass sections at RF rate, 30 Hz AC coupling, ideal amplifier with ±3 V rails and 1 Ω output, 8 Ω resistive load. Implicit midpoint at 512 RF substeps per audio sample; the coil is pre-warped so the discrete tank resonates at the physical frequency. Energy accounting at every step.
- **Slow mode (WebGPU).** The 2D TMz grid (256 × 128 × 5 m, Δt = 7.5 ns, 24-cell split-field PML) is driven by the actual modulated programs from a calibrated line current; E_z at the receiver cell goes through the identical port and receiver chain at 7.5 ns, decimated by 2776 to audio. About 2000× slower than real time on an M-series GPU. No audio or real-time solution enters this path.
- **Direct injection** is a labelled bypass of the field and antenna, for isolating the circuit.

## Measured (Apple M-series Mac mini, Node 22, Chrome 140)

| Quantity | Value |
|---|---|
| Antenna | 2 m dipole, radius 1 mm, 41 segments |
| h_eff (MoM) vs L/2 | 0.9799 m vs 1 m (−2.0 %) |
| C_a (MoM) vs πε₀h/(ln(h/a)−1) | 4.851 pF vs 4.708 pF |
| R_rad (MoM) vs 20π²(L/λ)² at 900 kHz | 6.83 mΩ vs 7.12 mΩ |
| R_ohm (copper, skin effect, 900 kHz) | 26.3 mΩ |
| \|X_a\| at 900 kHz | 36.5 kΩ (R_a/\|X_a\| = 9.1e-7) |
| h_eff, C_a spread over 600–1200 kHz | 0.006 %, 0.017 % |
| Half-wave dipole check (0.47 λ, a = 0.001 λ) | Z = 73.5 + j5.5 Ω (textbook ≈ 73 Ω at resonance) |
| Coil Q (R_p/ωL at 900 kHz) | 71 |
| Tank C + C_a at 900 kHz | 125.1 pF |
| 1D grid | 32 cells × 12.32 m, S = 0.99, Mur ABC |
| 1D dispersion at 1200 kHz (Yee relation, verified) | 8.0e-5 |
| 1D retardation and amplitude vs exact solution | < 2e-3; sidebands μ/2 to 1e-4 |
| Yee replay vs exact retarded field (5 stations, ≈5 V/m) | 1.7 mV/m |
| Loaded-port benchmark (time domain vs MoM Thévenin, 600/900/1200 kHz) | < 3 % |
| Discrete energy identity over 40 000 steps | < 1e-9 relative |
| THD of 1 kHz tone, 65 % depth, 1 V/m, gain 3 | 0.09 % |
| THD at 130 % modulation | 9.1 % |
| Adjacent-station rejection (150 kHz) | 18.2 dB (detector loading sets Q ≈ 25) |
| Far-station rejection (600 kHz from 1200) | no output (tank below diode threshold) |
| RF ripple reaching the decimator | > 80 dB below the tone |
| Power at 1 V/m, 1200 kHz carrier | incident 1.33 mW/m², port 25.8 µW, re-radiated + copper 65 pW, available 3.5 W |
| Real-time engine | 38–40 M RF steps/s in Node (61–64 % of a core); 40–45 % audio-thread load in Chrome, 69 ms output latency, no underruns observed |
| 2D grid | 256 × 128 × 5 m, Δt = 7.505 ns, PML L_max = 0.259, 1.3 MiB of GPU buffers |
| 2D PML normal-incidence reflection (600/900/1200 kHz) | < −60 dB (previous 16-cell sponge: −12 dB) |
| 2D amplitude vs analytic line source; 1/√r decay | < 2 %; amp·√r constant to 0.2 % |
| 2D numerical wavelength | within 0.1 % of c/f |
| 2D GPU vs CPU stencil (24 steps) | 4.8e-7 |
| Slow mode, 2 ms of physical time | 266 482 steps in 3.8–4.1 s (65–69 k steps/s, ≈2000× slower than real time) |

## Audio

See `public/audio/CREDITS.md` and the on-page sources. Three recordings are bundled as 90-second, 24 kHz mono MP3 excerpts. The bell is bundled in its original WAV form. Decode, low-pass at 3.5 kHz and peak normalization happen locally; an upload can replace the 900 kHz program. No remote audio requests occur at runtime. The reference tone is generated. The 600 kHz station has a generated melody fallback while loading.

## Source layout

- `src/antenna.ts`: thin-wire method of moments (impedance matrix, receiving and transmitting solves, port derivation).
- `src/propagation.ts`: 1D Yee grid with current-sheet sources and Mur boundaries.
- `src/physics.ts`: transmitters, exact retarded field, antenna port, coupled circuit, receiver chain, energy accounting, grid replay.
- `src/processor.ts`: real-time AudioWorklet, load measurement and scope telemetry.
- `src/field.ts`: WGSL 2D Yee kernels with PML, per-step source stream and probe recording, CPU reference and validation.
- `src/offline.ts`: slow mode (2D field → port → receiver → audio buffer).
- `src/scene.ts`: Three.js bench driven by the replayed grid and port charge.
- `src/main.ts`: controls, audio loading, plots, meters, slow-mode UI and lifecycle.
- `src/theory.ts`, `src/history.ts`: derivations, history and linked primary sources.
- `src/stations.ts`: carrier/program/credit metadata.
- `tests/`: antenna benchmarks, propagation, receiver, field.
- `scripts/measure.ts`: the table above.

## Limits that remain

This is an educational model, not an RF design sign-off. The real-time path is one-dimensional plane-wave propagation with no ground, terrain or 3D antenna near field; the transmitters are sheets, not towers. The antenna port is evaluated at 900 kHz and held constant (spread < 0.02 %), and its 33 mΩ resistance is accounted, not integrated. The diode has no junction capacitance, reverse leakage or temperature dependence. The coil loss is a single parallel resistance; stray capacitance and plate fringing are neglected. The buffer, amplifier and its supply are ideal; the speaker is a resistor and the animated cone is a voltage indicator. The slow mode's 2D source is a cylindrical wave from a line current, not a 3D antenna pattern. The 2D grid's source calibration and probe are within 2 % of analytic; the 1D grid's source is corrected for its one-cell width (up to 1.2 %). The first-order hold of the message and the 5 kHz filters are not brick-wall. WebGPU absence disables only the field panel and the slow mode.
