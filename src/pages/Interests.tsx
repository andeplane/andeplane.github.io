import { Link } from "react-router-dom";
import AtomsIllustration from "@/features/rendering/AtomsIllustration";
import "@/features/neural-operators/research.css";
export default function Interests() {
  return (
    <div className="no-root">
      <p className="no-eyebrow">Learning, playing & exploring</p>
      <h1 className="no-page-title">Interests</h1>
      <p className="no-lead">Things I enjoy exploring, with the ideas, experiments and projects behind them.</p>
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
      <Link className="no-interest-card" to="/interests/music">
        <div className="no-card-art" aria-hidden="true">
          <svg viewBox="0 0 600 180">
            {Array.from({ length: 14 }, (_, i) => (
              <rect key={i} x={91 + i * 30} y="35" width="28" height="110" rx="3" fill="currentColor" opacity="0.75" />
            ))}
            {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => (
              <rect key={i} x={111 + i * 30} y="35" width="18" height="68" rx="2" fill="#111723" />
            ))}
          </svg>
          <span>PIANO · GUITAR · SOUND</span>
        </div>
        <div className="no-card-body">
          <p className="no-eyebrow">Playing & understanding</p>
          <h2>Music <span>↗</span></h2>
          <p>
            Piano since childhood, a guitar ambition, and curiosity about music theory
            and the physics of sound.
          </p>
          <div className="no-tags">
            <span>Music theory</span>
            <span>Ear training</span>
            <span>Acoustics</span>
          </div>
        </div>
      </Link>
      <Link className="no-interest-card" to="/interests/3d-rendering">
        <div className="no-card-art" aria-hidden="true">
          <AtomsIllustration />
          <span>ATOMS · BONDS · PERCEPTION</span>
        </div>
        <div className="no-card-body">
          <p className="no-eyebrow">The unreasonable effectiveness of</p>
          <h2>3D rendering <span>↗</span></h2>
          <p>
            Why a few well-lit spheres make people stop and look. Billboards, atoms and
            bonds, and giving the visual brain something to work with.
          </p>
          <div className="no-tags">
            <span>Billboarding</span>
            <span>Molecular graphics</span>
            <span>Visual perception</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
