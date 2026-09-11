'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E, shiftTex } from '@/features/neural-operators/labs/lib/equations';
import { useEffect, useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { Play, Pause } from 'lucide-react';
const amplitudes = Array.from({ length: 6 }, (_, i) =>
  Math.exp(-0.16 * (i + 1) ** 2),
);
const norm = amplitudes.reduce((a, b) => a + b, 0);
const concentration = (x: number, shift: number) =>
  0.5 +
  amplitudes.reduce(
    (s, a, i) =>
      s +
      ((0.4 * a) / norm) * Math.cos(2 * Math.PI * (i + 1) * (x - 0.25 - shift)),
    0,
  );
function curve(shift: number) {
  return Array.from(
    { length: 201 },
    (_, i) => `${40 + i * 3.2},${220 - concentration(i / 200, shift) * 190}`,
  ).join(' ');
}
export default function TransportLab() {
  const [time, setTime] = useState(0),
    [speed, setSpeed] = useState(0.4),
    [play, setPlay] = useState(false);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setTime((t) => (t + 0.015) % 2), 40);
    return () => clearInterval(id);
  }, [play]);
  const shift = speed * time,
    phase = 2 * Math.PI * shift;
  return (
    <section className="transport-lab">
      <div>
        <span className="eyebrow">
          ANOTHER OPERATOR / CARRY A PATTERN WITH THE FLOW
        </span>
        <h2>What if the field moves instead of spreading?</h2>
        <p>
          Imagine a ring-shaped channel carrying a patch of dye at constant
          speed. Here there is no diffusion: the shape stays intact while every
          part moves to the right. This is <strong>advection</strong>.
        </p>
        <p>
          The field is now “dye concentration at each position.” We still map a
          starting field to a later field, but the rule is different from heat
          diffusion.
        </p>
      </div>
      <div className="transport-grid">
        <div className="transport-controls">
          <label>
            Flow speed <b>{speed.toFixed(2)} laps / s</b>
          </label>
          <Slider
            aria-label="Dye flow speed"
            min={0}
            max={1}
            step={0.05}
            value={[speed]}
            onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)}
          />
          <label>
            Time <b>{time.toFixed(2)} s</b>
          </label>
          <Slider
            aria-label="Dye transport time"
            min={0}
            max={2}
            step={0.01}
            value={[time]}
            onValueChange={(v) => {
              setPlay(false);
              setTime(Array.isArray(v) ? v[0] : v);
            }}
          />
          <button className="primary" onClick={() => setPlay((p) => !p)}>
            {play ? <Pause size={15} /> : <Play size={15} />}{' '}
            {play ? 'Pause' : 'Watch the dye move'}
          </button>
          <p>
            Try zero speed, then increase it. When the dye reaches the right
            edge, it reappears on the left: both ends are the same point on the
            ring.
          </p>
        </div>
        <div className="transport-plot">
          <div className="transport-legend">
            <span>— current concentration</span>
            <span>┄ starting concentration</span>
          </div>
          <svg
            viewBox="0 0 710 265"
            role="img"
            aria-label={`Dye profile shifted ${shift.toFixed(2)} laps around a periodic channel`}
          >
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line
                  x1="40"
                  x2="680"
                  y1={220 - v * 190}
                  y2={220 - v * 190}
                  stroke="#2b3f5d"
                />
                <text x="12" y={225 - v * 190} fill="#a3b5cf" fontSize="12">
                  {v}
                </text>
              </g>
            ))}
            <polyline
              points={curve(0)}
              fill="none"
              stroke="#8294b1"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            <polyline
              points={curve(shift)}
              fill="none"
              stroke="#64cde3"
              strokeWidth="3"
            />
            <text x="40" y="250" fill="#a3b5cf" fontSize="12">
              x = 0
            </text>
            <text x="595" y="250" fill="#a3b5cf" fontSize="12">
              x = 1 (same point)
            </text>
          </svg>
          <p>
            Concentration is unchanged in shape and average. Only its position
            changes.
          </p>
        </div>
      </div>
      <div className="transport-math">
        <span className="eyebrow">THE MATH / A SHIFT IS A PHASE CHANGE</span>
        <div className="equation">
          <MathTex tex={shiftTex(shift)} />
        </div>
        <p>
          For one cosine wave, shifting the input means replacing x by x − ct.
          The identity cos(A − B) = cos(A)cos(B) + sin(A)sin(B) tells us exactly
          how to update its coefficients.
        </p>
        <div className="equation">
          <MathTex tex={E.transport} />
        </div>
        <div className="phase-readout">
          <div>
            <span>For k = 1, phase change</span>
            <b>{phase.toFixed(3)} radians</b>
          </div>
          <div>
            <span>New cosine coefficient / a</span>
            <b>{Math.cos(phase).toFixed(3)}</b>
          </div>
          <div>
            <span>New sine coefficient / a</span>
            <b>{Math.sin(phase).toFixed(3)}</b>
          </div>
        </div>
        <p>
          <b>Why this matters:</b> the heat model can multiply a wave by one
          real number because heat only reduces its amplitude. Transport needs
          to mix sine and cosine to shift its phase. A full Fourier neural
          operator uses complex-valued Fourier weights, which can represent both
          changes. A learned transport model would fit this phase change from
          example pairs; this illustration computes it exactly.
        </p>
        <details>
          <summary>
            See the TypeScript for transporting any detected mode
          </summary>
          <div className="code-panel detection-code">
            <pre>
              <code>{`// Initial mode: a*cos(2πkx) + b*sin(2πkx).\n// Shift the entire field right by speed*time.\nconst phase = 2 * Math.PI * k * speed * time;\nconst futureA = a * Math.cos(phase) - b * Math.sin(phase);\nconst futureB = a * Math.sin(phase) + b * Math.cos(phase);\n\n// Evaluate on any output grid. No new amplitudes appear.\nconst value = futureA * Math.cos(2*Math.PI*k*x)\n            + futureB * Math.sin(2*Math.PI*k*x);\n// Repeat for each mode; keep the mean unchanged.`}</code>
            </pre>
          </div>
        </details>
      </div>
    </section>
  );
}
