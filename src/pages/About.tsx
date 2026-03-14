export default function About() {
  return (
    <div style={{ maxWidth: '680px' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 2rem', letterSpacing: '-0.02em' }}>
        About
      </h1>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          fontSize: '1.05rem',
          lineHeight: 1.75,
          color: 'var(--color-text)',
        }}
      >
        <p>
          I'm Anders Hafreager, an Engineering Manager at <a href="https://www.cognite.com" target="_blank" rel="noopener noreferrer">Cognite</a>, living in Nydalen, Oslo with my wonderful girlfriend Ingrid and my six-year-old son Ludwig.
        </p>

        <p>
          I have a PhD in computational physics from the University of Oslo, where I built molecular dynamics simulators and studied the behaviour of fluids at the nanoscale. These days I apply that background to making complex simulations accessible in the browser — and to leading engineering teams building industrial software.
        </p>

        <p>
          My work tends to sit at the intersection of physics, computer graphics, and developer experience. I care a lot about performance — not as an end in itself, but because fast, responsive software is more useful and more delightful to use. Getting molecular dynamics running at interactive framerates inside a browser tab, via WebAssembly or WebGPU, is exactly the kind of puzzle I find worth solving.
        </p>

        <p>
          Outside of simulations I build games (a curling simulator with a real friction model, a tower defence game with pathfinding AI), developer tools, and occasional experiments with LLMs. I'm particularly interested in the Claude API and what becomes possible when you combine language models with structured data and domain knowledge.
        </p>

        <p>
          When I'm not in front of a computer I'm probably hiking with Ludwig, listening to music, or deep in a Factorio factory. I'm passionate about music, physics, and AI — and I love how they all connect to the things I build.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />

        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: '0 0 1rem' }}>Get in touch</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li>
              <a href="https://github.com/andeplane" target="_blank" rel="noopener noreferrer">
                GitHub — github.com/andeplane
              </a>
            </li>
            <li>
              <a href="https://linkedin.com/in/andershaf/" target="_blank" rel="noopener noreferrer">
                LinkedIn — andershaf
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: '0 0 1rem' }}>Tech I work with regularly</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {['TypeScript', 'React', 'C++', 'WebAssembly', 'WebGPU', 'Three.js', 'Vite', 'Python', 'LAMMPS', 'Phaser 3'].map((tech) => (
              <span
                key={tech}
                style={{
                  padding: '0.3em 0.75em',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
