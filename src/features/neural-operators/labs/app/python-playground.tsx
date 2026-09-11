'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { Textarea } from '@/features/neural-operators/labs/components/ui/textarea';
import { pythonExample } from '@/features/neural-operators/labs/lib/python-example';
import { Heatmap } from './field-view';
type Plot = {
  n: number;
  out: number;
  pixels: number[];
  reconstructed: number[];
  truth: number[];
};
function validPlot(p: Plot) {
  return (
    p &&
    Number.isInteger(p.n) &&
    p.n > 0 &&
    p.n <= 128 &&
    Number.isInteger(p.out) &&
    p.out > 0 &&
    p.out <= 256 &&
    [p.pixels, p.reconstructed, p.truth].every(
      (a) => Array.isArray(a) && a.every(Number.isFinite),
    ) &&
    p.pixels.length === p.n * p.n &&
    p.reconstructed.length === p.out * p.out &&
    p.truth.length === p.out * p.out
  );
}
export default function PythonPlayground() {
  const [code, setCode] = useState(pythonExample),
    [status, setStatus] = useState('Ready. Python loads only when you run it.'),
    [output, setOutput] = useState(''),
    [running, setRunning] = useState(false),
    [plot, setPlot] = useState<Plot | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setStatus('Stopped. Run again to restart Python.');
  };
  const run = () => {
    setOutput('');
    setPlot(null);
    setRunning(true);
    setStatus('Starting Python…');
    try {
      if (!worker.current) {
        worker.current = new Worker(
          new URL('../lib/python.worker.ts', import.meta.url),
          { type: 'module' },
        );
        worker.current.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'status') setStatus(m.text);
          if (m.type === 'stdout')
            setOutput((o) => (o + '\n' + m.text).slice(-30000));
          if (m.type === 'error') {
            setStatus(
              'Python could not complete. See the output; you can edit and retry.',
            );
            setOutput((o) => o + '\n' + m.text);
            setRunning(false);
            worker.current?.terminate();
            worker.current = null;
          }
          if (m.type === 'done') {
            setRunning(false);
            setStatus('Python finished.');
            try {
              const p = JSON.parse(m.plot);
              if (validPlot(p)) setPlot(p);
              else if (p !== null)
                setStatus(
                  'Python finished. Plot data must contain finite square arrays (input ≤ 128, output ≤ 256).',
                );
            } catch {
              setStatus('Python finished; no valid plot data returned.');
            }
          }
        };
        worker.current.onerror = (e) => {
          setOutput(e.message);
          setStatus(
            'Python could not load. Check your connection and try again.',
          );
          setRunning(false);
          worker.current?.terminate();
          worker.current = null;
        };
      }
      worker.current.postMessage({ code });
    } catch (e) {
      setOutput(String(e));
      setRunning(false);
      setStatus('Could not start the Python worker.');
    }
  };
  return (
    <section className="python-playground">
      <div className="python-title">
        <div>
          <span className="eyebrow">RUN IT YOURSELF / PYTHON + NUMPY</span>
          <h3>The pixel-to-field calculation, with editable code.</h3>
        </div>
        <span className="status-chip">Pyodide · browser execution</span>
      </div>
      <p>
        Change N from 8 to 4, or change M. Run the code and inspect both the
        printed coefficients and reconstructed image. This is the same
        computation as the TypeScript walkthrough. First run needs an internet
        connection to load Python and NumPy.
      </p>
      <label htmlFor="python-editor">Python source</label>
      <Textarea
        id="python-editor"
        className="python-editor"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        disabled={running}
      />
      <div className="python-actions">
        <button className="primary" onClick={run} disabled={running}>
          <Play size={15} /> Run Python
        </button>
        <button className="secondary-button" onClick={stop} disabled={!running}>
          <Square size={14} /> Stop
        </button>
        <button
          className="text-button"
          disabled={running}
          onClick={() => {
            setCode(pythonExample);
            setPlot(null);
            setOutput('');
            setStatus('Example restored.');
          }}
        >
          <RotateCcw size={14} /> Reset example
        </button>
        <span role="status">{status}</span>
      </div>
      <pre className="python-output" aria-label="Python output">
        {output.trim() || 'Printed output will appear here.'}
      </pre>
      {plot && (
        <div className="map-grid three">
          <div>
            <h4>Measured pixels · {plot.n}²</h4>
            <Heatmap
              values={plot.pixels}
              n={plot.n}
              label="Python input pixels"
            />
          </div>
          <div>
            <h4>Reconstructed · {plot.out}²</h4>
            <Heatmap
              values={plot.reconstructed}
              n={plot.out}
              label="Python reconstructed field"
            />
          </div>
          <div>
            <h4>Hidden reference · {plot.out}²</h4>
            <Heatmap
              values={plot.truth}
              n={plot.out}
              label="Python reference field"
            />
          </div>
        </div>
      )}
    </section>
  );
}
