import { Link } from 'react-router-dom';
const base = '/interests/neural-operators';
export default function Overview() {
  return <div className="no-overview">
    <section className="no-start-intro">
      <p className="no-eyebrow">Learn · experiment · investigate</p>
      <h2>How can a model learn a map between whole fields?</h2>
      <p>Start with temperature measurements. Build an integral from samples, train a kernel, then explore what changes when the computation moves into Fourier space. Use the reference and literature collection whenever you want to go deeper.</p>
    </section>
    <div className="no-start-grid">
      <Link to={`${base}/labs?lesson=fields`}><span className="no-eyebrow">Build intuition</span><h3>Start from measurements →</h3><p>Follow the foundations from a continuous field to a learned operator. No prior operator-learning knowledge needed.</p></Link>
      <Link to={`${base}/labs?lesson=thermal`}><span className="no-eyebrow">Play with a model</span><h3>Train a kernel →</h3><p>Inspect its inputs and weights, train on field pairs, and test what sparse measurements change.</p></Link>
      <Link to={`${base}/labs?lesson=fourier-layer`}><span className="no-eyebrow">Explore another representation</span><h3>Try a Fourier layer →</h3><p>Learn six spectral multipliers in a small heat experiment. Then follow the longer Fourier walkthrough.</p></Link>
    </div>
    <section className="no-start-intro">
      <h2>Three questions to keep separate</h2>
      <ol className="no-learning-questions">
        <li><strong>What was measured?</strong> Input samples are the model’s information. A denser output plot does not add observations.</li>
        <li><strong>What is learned?</strong> Parameters are reused across fields. Coordinates, quadrature weights and Fourier transforms also enter the computation, but are not all trainable.</li>
        <li><strong>What counts as success?</strong> A small training loss is a start. Check unseen fields, different grids and the quantities that matter for the application.</li>
      </ol>
    </section>
    <div className="no-start-grid no-reference-grid">
      <Link to={`${base}/concepts`}><h3>Concept reference →</h3><p>Definitions, integral and Fourier formulas, quadrature, wavelets and latency.</p></Link>
      <Link to={`${base}/graph`}><h3>Explore the literature →</h3><p>Follow links between fields, papers and authors, including citations within the collection.</p></Link>
      <Link to={`${base}/reading`}><h3>Find a research direction →</h3><p>Reading routes, application questions, research groups and annotated papers.</p></Link>
    </div>
    <p className="no-muted">The experiments are small teaching models. The collection draws on several research traditions; individual papers provide context, not a required syllabus.</p>
  </div>;
}
