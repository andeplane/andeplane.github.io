# In the Air — AM Radio Lab

Standalone Vite / TypeScript demo. Run `npm ci`, `npm run dev -- --port 5178`, `npm test`, `npm run build` in this directory. The homepage's existing `build:demos` automatically stages the output at `/demos/am-radio/`.

## Model

- Five simultaneous carriers: 600, 750, 900, 1050 and 1200 kHz.
- Incident field -> effective-height receiving-antenna source (2 m, cosine polarization factor) -> 100 kΩ source resistance -> parallel 250 μH / variable air capacitor / 100 kΩ loss -> coupled piecewise-linear diode -> 100 kΩ detector load and adjustable capacitor.
- Diode: 0.15 V threshold, 2 kΩ forward resistance. No junction capacitance, reverse leakage or temperature model.
- Implicit midpoint coupled circuit solve at 512 RF substeps per audio sample. Charge conserved when tuning C. Actual oscillator phase advances every RF step. Audio samples modulate carrier amplitudes, never bypass the circuit.
- Four ideal buffered 5 kHz low-pass sections at RF rate, 30 Hz AC coupling, ideal powered amplifier with ±3 V clipping and 1 Ω output resistance, 8 Ω resistive load. Measured voltage is sent to Web Audio divided by 3 V, then through a separate listening-volume control.
- 3D scene is illustrative, with exaggerated component dimensions and a slowed representative field wave. It does not determine circuit topology; the on-page schematic and `physics.ts` do.
- Separate WebGPU TMz Maxwell simulation: 256 × 128 Yee grid, 5 m cells, Courant number 0.45, 7.505 ns steps. Soft monochromatic line-current source, optional perfect-conductor screen with 105 m aperture, 16-cell lossy boundary sponge. Magnetic field is stored as Z0 H. The slowed field is **not** the real-time audio source. Rendering is directly from GPU storage buffers; a probe reads the GPU field.
- Startup GPU/CPU stencil comparison reports max error. CPU tests check wave arrival, conducting boundary behavior, receiver selectivity, recovered tone, diode and antenna nulls, passive decay, and step convergence.

## Audio

See `public/audio/CREDITS.md` and the on-page sources. Three recordings are bundled as 90-second, 24 kHz mono MP3 excerpts. The bell is bundled in its original WAV form. Decode, low-pass at 3.5 kHz and peak normalization happen locally; an upload can replace the 900 kHz program. No remote audio requests occur at runtime. The reference tone is generated. The 600 kHz station has a generated melody fallback while loading.

## Source layout

- `src/physics.ts`: coupled circuit, modulation, RF oscillators and output stage.
- `src/processor.ts`: real-time AudioWorklet and scope telemetry.
- `src/field.ts`: WGSL Yee compute kernels, rendering, CPU reference and validation.
- `src/scene.ts`: Three.js bench.
- `src/main.ts`: controls, audio loading, plots, meters and lifecycle.
- `src/theory.ts`, `src/history.ts`: derivations, history and linked primary sources.
- `src/stations.ts`: carrier/program/credit metadata.

## Limits

This is an educational model, not an RF design sign-off. The antenna is an assumed equivalent source, not a geometry-derived impedance or a coupled full-wave antenna solve. The nonlinear receiver and separate field experiment intentionally use different clocks. RF midpoint dispersion is under 0.8% at 48 kHz across the station band; loaded resonance differs from the plotted detector-disconnected analytical curve. Sources are held per audio sample. The post-detector filter is not brick-wall. The speaker is a resistor, without electromechanical or acoustic dynamics. WebGPU absence does not prevent circuit audio or scopes.
