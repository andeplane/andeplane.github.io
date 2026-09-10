'use client';
import { useEffect, useMemo, useState } from 'react';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { Plot, Control } from './continuous-labs';
const K = 6, NU = 0.02, DT = 0.3;
const query = Array.from({ length: 129 }, (_, i) => i / 128);
// Independent analytic heat solution for periodic, physical-space Gaussian spots.
function temperature(x: number, seed: number, time = 0) {
  const spots = [{ center: 0.2 + (seed * 0.137) % 0.45, sigma: 0.06, amplitude: 1.5 }, { center: 0.75, sigma: 0.09, amplitude: -0.8 }];
  return spots.reduce((sum, p) => {
    const variance = p.sigma ** 2 + 2 * NU * time;
    for (let m = -3; m <= 3; m++) sum += p.amplitude * p.sigma / Math.sqrt(variance) * Math.exp(-((x - p.center + m) ** 2) / (2 * variance));
    return sum;
  }, 0);
}
function transform(samples: number[]) {
  return Array.from({ length: K + 1 }, (_, k) => ({
    re: samples.reduce((s, f, i) => s + f * Math.cos(2 * Math.PI * k * i / samples.length), 0) / samples.length,
    im: samples.reduce((s, f, i) => s - f * Math.sin(2 * Math.PI * k * i / samples.length), 0) / samples.length,
  }));
}
export default function FourierLayerExample() {
  const [n, setN] = useState(16), [seed, setSeed] = useState(0), [step, setStep] = useState(0), [running, setRunning] = useState(false), [weights, setWeights] = useState(Array(K).fill(0.1) as number[]);
  const fit = useMemo(() => {
    const pairs = Array.from({ length: 8 }, (_, j) => {
      const xs = Array.from({ length: 32 }, (_, i) => i / 32);
      return { input: transform(xs.map(x => temperature(x, j + 1))), target: transform(xs.map(x => temperature(x, j + 1, DT))) };
    });
    return Array.from({ length: K }, (_, index) => {
      const k = index + 1;
      const energy = pairs.reduce((s, p) => s + p.input[k].re ** 2 + p.input[k].im ** 2, 0);
      const cross = pairs.reduce((s, p) => s + p.input[k].re * p.target[k].re + p.input[k].im * p.target[k].im, 0);
      return { energy, cross };
    });
  }, []);
  useEffect(() => {
    if (!running) return;
    if (step >= 200) { setRunning(false); return; }
    const timer = setTimeout(() => {
      setWeights(ws => ws.map((w, i) => w - 0.06 * (w - fit[i].cross / fit[i].energy)));
      setStep(s => s + 1);
    }, 30);
    return () => clearTimeout(timer);
  }, [running, step, fit]);
  const xs = Array.from({ length: n }, (_, i) => i / n), samples = xs.map(x => temperature(x, seed)), coefficients = transform(samples), available = Math.min(K, Math.floor((n - 1) / 2));
  const prediction = query.map(y => coefficients[0].re + weights.reduce((sum, w, i) => {
    const k = i + 1;
    return k > available ? sum : sum + 2 * w * (coefficients[k].re * Math.cos(2 * Math.PI * k * y) - coefficients[k].im * Math.sin(2 * Math.PI * k * y));
  }, 0));
  return <>
    <p>This new one-dimensional example learns a <strong>Fourier spectral layer</strong>: initial temperature → temperature after a fixed Δt = 0.3, with diffusivity ν = 0.02 on a periodic unit interval. It is a linear teaching model with six learned multipliers, not a full nonlinear FNO. Its input is a measured hot/cold field, not pre-supplied wave coefficients.</p>
    <div className="paper-route"><span>N temperature samples</span>→<span>DFT</span>→<span>6 learned mode multipliers</span>→<span>Fourier synthesis at 129 positions</span></div>
    <MathTex tex={String.raw`\widehat F_k=\frac1N\sum_{i=0}^{N-1}F_i e^{-2\pi\mathrm i ki/N},\qquad \widehat G_k=w_k\widehat F_k,\qquad \widetilde g(y)=\widehat F_0+2\operatorname{Re}\sum_{k=1}^{6}\widehat G_k e^{2\pi\mathrm i ky}`} />
    <p>The DFT is fixed arithmetic applied to measured samples. Training changes only w₁,…,w₆, shared across real and imaginary coefficients. The mean (mode 0) is preserved. The negative modes follow by complex conjugation because temperature is real. The implementation omits unresolved modes above the input grid’s usable frequency range.</p>
    <div className="paper-actions"><button className="paper-button primary" disabled={step >= 200} onClick={() => setRunning(!running)}>{running ? 'Pause training' : 'Train Fourier layer'}</button><button className="paper-button" onClick={() => { setRunning(false); setStep(0); setWeights(Array(K).fill(0.1)); }}>Reset</button><span>{step} / 200 optimizer updates · one fixed physical horizon</span></div>
    <div className="paper-controls"><Control label="Input samples N" min={4} max={64} value={n} onChange={setN} /></div>
    <button className="paper-button" onClick={() => setSeed(s => s === 0 ? 100 : s + 1)}>Another held-out field</button>
    <div className="paper-two"><Plot label="Initial temperature: sampled input at t = 0" lines={[{ values: query.map(x => temperature(x, seed)), color: '#245de5', name: 'Underlying input field' }]} dots={xs.map((x, i) => ({ x, y: samples[i] }))} /><Plot label="Output at t = 0.3: same weights, finer evaluation grid" lines={[{ values: query.map(y => temperature(y, seed, DT)), color: '#1c9a7b', name: 'Analytic heat reference' }, { values: prediction, color: '#245de5', name: 'Learned spectral prediction' }]} /></div>
    <div className="paper-table-wrap"><table className="paper-table"><thead><tr><th>Mode k</th><th>Input coefficient (real, imaginary)</th><th>Learned wₖ</th><th>Exact heat multiplier</th><th>Used at this N?</th></tr></thead><tbody>{weights.map((w, i) => <tr key={i}><td>{i + 1}</td><td>{coefficients[i + 1].re.toFixed(4)}, {coefficients[i + 1].im.toFixed(4)}</td><td>{w.toFixed(5)}</td><td>{Math.exp(-4 * Math.PI ** 2 * NU * DT * (i + 1) ** 2).toFixed(5)}</td><td>{i + 1 <= available ? 'Yes' : 'No: unresolved'}</td></tr>)}</tbody></table></div>
    <h3>How is this related to the coordinate kernel?</h3>
    <MathTex tex={String.raw`K_w(x,y)=1+2\sum_{k=1}^{6}w_k\cos\bigl(2\pi k(y-x)\bigr)`} />
    <p>This finite Fourier kernel is a weighted sum of six cosine functions plus the mean term. The mode multipliers are its learned parameters. On a sufficiently resolved uniform periodic grid, applying this kernel by quadrature gives the same result as DFT → multiplication → synthesis. Fourier methods compute this structured interaction efficiently; our small demo uses direct sums so the arithmetic is inspectable.</p>
    <details><summary>Training data, objective and executed update</summary><p>Eight distinct initial fields (seeds 1–8) are sampled at 32 points and paired with their analytic heat solutions at t = 0.3. The displayed seed 0 and seeds 100+ are held out. For each mode, training minimizes coefficient error normalized by that mode’s input energy. This normalization prevents high-frequency modes with small amplitudes from learning extremely slowly.</p><MathTex tex={String.raw`L_k=\frac{\sum_s|w_k\widehat F_k^{(s)}-\widehat G_k^{(s)}|^2}{2\sum_s|\widehat F_k^{(s)}|^2},\qquad w_k\leftarrow w_k-0.06\,\frac{\partial L_k}{\partial w_k}`} /><pre><code>{`const energy = sumPairs(reInput**2 + imInput**2);
const cross = sumPairs(reInput*reTarget + imInput*imTarget);
// One full-batch gradient descent update for each real weight:
w = w - 0.06 * (w - cross / energy);
// Forward prediction on each resolved mode:
Ghat.re = w * Fhat.re;
Ghat.im = w * Fhat.im;`}</code></pre></details>
    <p>Increasing output resolution evaluates this same truncated series more densely. Increasing input resolution supplies more observations. Neither adds learned modes: there are always six weights. A full FNO adds feature channels, channel-mixing matrices, local paths and nonlinear field activations between spectral layers.</p>
  </>;
}
