'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KernelArchitecture } from '@/features/neural-operators/labs/lib/continuous';
import { neuralKernel, smoothKernel } from '@/features/neural-operators/labs/lib/continuous';

const SIZE = 96;
const LIMIT = 4;
const BLUE = [37, 93, 229], WHITE = [248, 250, 254], ORANGE = [232, 121, 50];
export default function KernelMap({ theta, step = 0, mode = "coordinates", kernel, caption }: { theta?: number[]; step?: number; mode?: KernelArchitecture; kernel?: (x:number,y:number)=>number; caption?: string }) {
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const values = useMemo(() => Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = (i % SIZE) / (SIZE - 1), y = 1 - Math.floor(i / SIZE) / (SIZE - 1);
    return kernel ? kernel(x,y) : theta ? neuralKernel(theta, x, y, mode) : smoothKernel(x, y);
  }), [theta, step, mode, kernel]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const pixels = ctx.createImageData(SIZE, SIZE);
    values.forEach((value, i) => {
      const t = Math.min(1, Math.abs(value) / LIMIT), endpoint = value < 0 ? BLUE : ORANGE;
      pixels.data.set([...WHITE.map((w, c) => Math.round(w + t * (endpoint[c] - w))), 255], i * 4);
    });
    ctx.putImageData(pixels, 0, 0);
  }, [values]);
  const clipped = values.filter(v => Math.abs(v) > LIMIT).length;
  return <figure className="paper-plot kernel-map">
    <figcaption>{caption ?? (theta ? `Learned kernel Kθ(x, y) · update ${step}` : 'Target kernel K(x, y) · reference only')}</figcaption>
    <div className="kernel-map-grid"><span className="kernel-y-label">Output coordinate y · 0 → 1</span><canvas ref={canvas} onPointerMove={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const col = Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientX - rect.left) / rect.width * SIZE)));
      const row = Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientY - rect.top) / rect.height * SIZE)));
      setHover({ x: col / (SIZE - 1), y: 1 - row / (SIZE - 1), index: row * SIZE + col });
    }} onPointerLeave={() => setHover(null)} style={{ cursor: 'crosshair' }} width={SIZE} height={SIZE} role="img" aria-label={theta ? 'Learned kernel heatmap: input x increases right, output y increases upward, fixed colors from minus four to four' : 'Target kernel heatmap with the same fixed scale'} /><span /><div className="kernel-x-label"><span>0</span><span>Input coordinate x</span><span>1</span></div></div>
    <div style={{ minHeight: '2em', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{hover ? <>x = {hover.x.toFixed(4)} · y = {hover.y.toFixed(4)} · <strong>K{theta ? 'θ' : ''}(x, y) = {values[hover.index].toFixed(6)}</strong></> : 'Hover over a cell to inspect its coordinates and kernel value.'}</div>
    <div className="kernel-colorbar" /><div className="kernel-scale"><span>−4</span><span>0</span><span>+4</span></div>
    <p className="paper-source">Fixed scale −4 to +4 · actual range {Math.min(...values).toFixed(3)} to {Math.max(...values).toFixed(3)}{clipped > 0 ? ` · ${clipped} cells exceed the scale and use the endpoint color` : ''}.</p>
  </figure>;
}
