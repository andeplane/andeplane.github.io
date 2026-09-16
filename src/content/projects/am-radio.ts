import type { ProjectMeta } from "@/types";
const project: ProjectMeta = {
  slug: "am-radio",
  title: "In the Air — AM Radio Lab",
  description:
    "Tune five broadcasts by moving capacitor plates. Modulated Maxwell fields induce charge on a solved wire antenna, a coupled LC–diode circuit turns the port voltage into audible speaker voltage, and a WebGPU field can drive the same receiver in slow motion.",
  tags: ["Physics", "TypeScript", "WebGPU", "Three.js", "Electromagnetism", "Audio"],
  liveUrl: "/demos/am-radio/",
  repoUrl:
    "https://github.com/andeplane/andeplane.github.io/tree/main/demos/am-radio",
  screenshot: "/projects/am-radio/preview.svg",
  longDescription: `
Five stations share the air: Joplin's *The Entertainer*, a 1919 recording of Rachmaninoff playing Liszt, Roosevelt's first fireside chat, a bell, and a reference tone. Moving two capacitor plates changes the resonant frequency of a 250 μH coil, the air capacitor and the antenna's own capacitance. The stations are simultaneous modulated RF sources; tuning never selects or crossfades the underlying recordings.

The chain is solved end to end. Each transmitter is a current sheet on a one-dimensional Yee grid that covers the last 380 m of the path; the audible receiver uses the exact retarded plane-wave solution of that problem, and the grid recomputes every displayed window so the two can be compared live. The receiving antenna is a 2 m copper dipole whose effective height, capacitance and radiation resistance come from a thin-wire method-of-moments solution of the electric-field integral equation, checked against the half-wave dipole and short-dipole benchmarks. The port drives a parallel LC tank with back-action through the antenna capacitance; a piecewise-linear diode draws current into an RC envelope detector; buffered filtering, AC coupling and a powered amplifier deliver voltage to an 8 Ω resistive speaker model. Energy is accounted at every step: power into the port, re-radiated, dissipated and stored.

A WebGPU solver of the two-dimensional TMz Maxwell equations on a Yee grid with a perfectly matched layer shows propagation, reflection and diffraction through a screen. Its slow mode feeds the field at the receiver, modulated by the actual programs, through the identical antenna port and receiver about two thousand times slower than real time, and recovers the tone and the programs from the 2D field.

Read [A radio you tune with two metal plates](/blog/a-radio-you-tune-with-two-metal-plates) or explore the [Physics interest page](/interests/physics). The approximations that remain are labelled in the lab and listed in the README, and the work was tracked in [issue #63](https://github.com/andeplane/andeplane.github.io/issues/63).

The accompanying theory derives AM sidebands, Maxwell propagation, the receiving antenna as an integral-equation solution, parallel-plate capacitance, LC resonance, the coupled circuit equations, detector time constants, speaker power and the energy balance. A short history follows the move from wireless code to human voices, carefully distinguishing archival recordings from later recreations. Sources and sound credits are included.
  `.trim(),
};
export default project;
