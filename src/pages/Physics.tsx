import { Link } from 'react-router-dom'
import radio from '@/content/projects/am-radio'
import '@/features/neural-operators/research.css'

export default function Physics() {
  return (
    <div className="no-root">
      <nav className="no-breadcrumb" aria-label="Breadcrumb">
        <Link to="/interests">Interests</Link><span aria-hidden="true">/</span><span aria-current="page">Physics</span>
      </nav>
      <header className="mb-10">
        <p className="no-eyebrow">Fields, forces & things I can measure</p>
        <h1 className="no-page-title">Physics</h1>
        <p className="no-lead">I like making a physical idea into something I can change, watch and measure.</p>
      </header>
      <section className="no-article">
        <h2>From an equation to an experiment</h2>
        <p>A wave equation becomes more interesting when I can send a pulse toward a hole and see what escapes. A resonator becomes more tangible when moving two metal plates changes the voice coming out of a radio.</p>
        <p>That is what draws me to these projects: making the mechanism visible, then asking which observations the model actually supports. A simulation can be useful while leaving out important physics. I want those boundaries to be as clear as the things it gets right.</p>
      </section>
      <section className="mt-12" aria-labelledby="physics-radio">
        <p className="no-eyebrow">Electromagnetism / a new experiment</p>
        <h2 id="physics-radio" className="text-2xl font-semibold tracking-tight mb-6">A radio you tune with geometry</h2>
        <article className="rounded-xl border border-[#292c36] bg-[#12151c] overflow-hidden grid md:grid-cols-2">
          <Link to="/projects/am-radio" aria-label="About In the Air — AM Radio Lab">
            <img src={radio.screenshot} alt="AM carriers and a recovered audio waveform" className="w-full h-full object-cover" />
          </Link>
          <div className="p-6 no-article">
            <h3>In the Air — AM Radio Lab</h3>
            <p>Five simultaneous broadcasts carry piano, a historic fireside chat, bells and a reference tone. Change the separation of capacitor plates, rotate the dipole out of the field, or disconnect the detector. The sound comes from voltage computed across the simulated speaker resistor.</p>
            <p>The chain is solved from the transmitter’s current onward: modulated plane waves on a one-dimensional Maxwell grid induce charge on a 2 m wire antenna whose port is computed from its geometry by a method-of-moments solution, and that port drives the tuned circuit with back-action. A WebGPU solver of the two-dimensional field, with a perfectly matched layer and a screen for diffraction, can drive the same antenna and receiver in a labelled slow mode about two thousand times slower than real time.</p>
            <p><a href="/demos/am-radio/">Open the radio lab ↗</a></p>
            <p><Link to="/blog/a-radio-you-tune-with-two-metal-plates">Read the physics and the model boundaries</Link></p>
          </div>
        </article>
      </section>
      <section className="no-article mt-12">
        <h2>Other ways of making the physics visible</h2>
        <p>In <Link to="/projects/tube-sim">Tube Acoustics Lab</Link>, pressure waves travel through a two-dimensional air domain and interact with openings in its walls. In <Link to="/projects/tidal-locking">Tidal Locking</Link>, the interesting questions are how a tidal torque changes rotation and where energy is dissipated. <Link to="/blog/webgpu-md-two-million-atoms-in-a-browser-tab">Molecular dynamics in a browser</Link> brings the same curiosity down to the motion of atoms.</p>
        <p>Sound connects some of these experiments to my <Link to="/interests/music">interest in music</Link>. The radio belongs here primarily because its subject is electric fields, resonance, rectification and measurement—the recordings give those mechanisms something recognizable to carry.</p>
        <h2>What the radio established</h2>
        <p>The full chain is observable now: modulated fields push charge in a solved antenna, the antenna drives a loaded circuit, and that circuit produces the measured output voltage, with the energy accounted at every step. The scale separation that made this hard—a 333 m wavelength against a 2 m wire and sub-millimetre plates—is handled by a justified subcell antenna port rather than by voxelizing the circuit, and the parts that remain approximations (one-dimensional propagation in real time, a piecewise-linear diode, an ideal amplifier, a resistor for a speaker) are labelled where they appear. <a href="https://github.com/andeplane/andeplane.github.io/issues/63">Issue #63</a> records the work and the measured fidelity table.</p>
      </section>
    </div>
  )
}
