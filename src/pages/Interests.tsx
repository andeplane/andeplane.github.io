import { Link } from "react-router-dom";
import "@/features/neural-operators/research.css";
export default function Interests() {
  return (
    <div className="no-root">
      <p className="no-eyebrow">Reading, questions & connections</p>
      <h1 className="no-page-title">Interests</h1>
      <p className="no-lead">Topics I’m exploring, with the papers and ideas behind them.</p>
      <Link className="no-interest-card" to="/interests/neural-operators">
        <div className="no-card-art" aria-hidden="true">
          <svg viewBox="0 0 600 180">
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M0 ${90 + i * 10} C100 ${-60 + i * 30} 140 ${230 - i * 20} 230 90 S370 ${i * 20} 450 90 S550 ${160 - i * 20} 600 50`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity={1 - i * 0.15}
              />
            ))}
          </svg>
          <span>FUNCTIONS → FIELDS → MODELS</span>
        </div>
        <div className="no-card-body">
          <p className="no-eyebrow">Scientific machine learning</p>
          <h2>
            Neural operators <span>↗</span>
          </h2>
          <p>
            From integral kernels and Fourier layers to sparse computation, physical simulation and
            robotics.
          </p>
          <div className="no-tags">
            <span>Literature graph</span>
            <span>Concepts</span>
            <span>Timeline</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
