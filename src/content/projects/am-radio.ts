import type { ProjectMeta } from "@/types";
const project: ProjectMeta = {
  slug: "am-radio",
  title: "In the Air — AM Radio Lab",
  description:
    "Tune five broadcasts by moving capacitor plates. A coupled LC–diode circuit turns actual AM carriers into audible voltage; a WebGPU Maxwell experiment reveals propagation, reflection and diffraction.",
  tags: ["Physics", "TypeScript", "WebGPU", "Three.js", "Electromagnetism", "Audio"],
  liveUrl: "/demos/am-radio/",
  repoUrl:
    "https://github.com/andeplane/andeplane.github.io/tree/main/demos/am-radio",
  screenshot: "/projects/am-radio/preview.svg",
  longDescription: `
Five stations share the air: Joplin's *The Entertainer*, a 1919 recording of Rachmaninoff playing Liszt, Roosevelt's first fireside chat, a bell, and a reference tone. Moving two capacitor plates changes the resonant frequency of a 250 μH coil and air capacitor. The stations are simultaneous modulated RF sources; tuning never selects or crossfades the underlying recordings.

The audio comes from a coupled circuit simulation. Antenna voltage drives a parallel LC tank through a source resistance; a piecewise-linear diode draws current into an RC envelope detector. Buffered filtering, AC coupling and a powered amplifier deliver voltage to an 8 Ω resistive speaker model. The oscilloscope and power meter measure that same voltage. Rotate the antenna, disconnect the diode, or turn off a transmitter and hear the consequences.

A separate WebGPU experiment solves the two-dimensional TMz Maxwell equations on a Yee grid. Add a conducting screen with an aperture and watch reflection and diffraction emerge. This microsecond-clock experiment is separate from the real-time audible receiver, which uses an analytic incident-field model and an idealized receiving-antenna equivalent circuit.

Read [A radio you tune with two metal plates](/blog/a-radio-you-tune-with-two-metal-plates) or explore the [Physics interest page](/interests/physics). The remaining field-to-antenna coupling is tracked in [issue #63](https://github.com/andeplane/andeplane.github.io/issues/63).

The accompanying theory derives AM sidebands, Maxwell propagation, antenna effective height, parallel-plate capacitance, LC resonance, the coupled circuit equations, detector time constants, and speaker power. A short history follows the move from wireless code to human voices, carefully distinguishing archival recordings from later recreations. Sources and sound credits are included.
  `.trim(),
};
export default project;
