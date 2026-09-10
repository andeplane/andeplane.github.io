import { solveTransport } from './transport-solver.ts';
import { initialize, evaluate } from './kernel-network.ts';
import { sourceValue } from './heat-source.ts';
/** One-dimensional teaching operators on [0,1]. All integrals use physical cell lengths. */
export function probe(x: number, seed = 0) {
  const center = seed === 0 ? 0.32 : 0.15 + ((seed * 0.173) % 0.7);
  const width = 0.06 + (seed % 3) * 0.025;
  return 1.5 * Math.exp(-(((x - center) / width) ** 2) / 2)
    - 0.8 * Math.exp(-(((x - (0.76 - (seed % 4) * 0.09)) / 0.105) ** 2) / 2);
}
export function points(n: number, clustered = false) {
  return Array.from({ length: n }, (_, i) => {
    const u = (i + 0.5) / n;
    return clustered ? u ** 2 : u;
  });
}
export function cellWidths(xs: number[]) {
  return xs.map((x, i) => (i === xs.length - 1 ? 1 : (x + xs[i + 1]) / 2)
    - (i === 0 ? 0 : (xs[i - 1] + x) / 2));
}
export function smoothKernel(x: number, y: number) {
  return Math.exp(-(((y - x) / 0.16) ** 2)) / (0.16 * Math.sqrt(Math.PI));
}
export function applyIntegral(xs: number[], values: number[], ys: number[], kernel = smoothKernel, weighted = true) {
  const ds = weighted ? cellWidths(xs) : xs.map(() => 1 / xs.length);
  return ys.map(y => xs.reduce((sum, x, i) => sum + kernel(x, y) * values[i] * ds[i], 0));
}
export function reference(ys: number[], seed = 0) {
  const xs = points(512);
  return applyIntegral(xs, xs.map(x => probe(x, seed)), ys);
}
export function error(pred: number[], target: number[]) {
  return Math.sqrt(pred.reduce((s, v, i) => s + (v - target[i]) ** 2, 0) / Math.max(1e-15, target.reduce((s, v) => s + v * v, 0)));
}
// K_theta(x,y) = d + sum_h c_h tanh(a_h*x+e_h*y+b_h).
// H hidden units: 4H+1 coordinate parameters or 3H+1 displacement parameters.
export const hidden = 12;
export type Aggregation = "direct" | "weighted";
export type KernelArchitecture = "coordinates" | "difference" | "temperature_x" | "temperatures";
export function initialParameters(mode: KernelArchitecture = "coordinates", units = 12, widths: number[] = [units]) {
  return initialize(mode, widths);
}
export function neuralKernel(theta: number[], x: number, y: number, mode: KernelArchitecture = "coordinates", widths?: number[], fx = 0, fy = 0) {
  return evaluate(theta, x, y, mode, widths ?? [(theta.length - 1) / (mode === 'difference' ? 3 : mode === 'temperatures' ? 6 : mode === 'temperature_x' ? 5 : 4)], false, fx, fy).value;
}
export const TRANSPORT_DT = 0.1;
export type TargetMode = "smoothing" | "nonlinear";
export type TrainingOptions = { count: number; inputPoints: number; outputPoints: number; sampling: 'uniform' | 'random' };
export function trainingPairs(withSource = false, targetMode: TargetMode = "smoothing", horizon = TRANSPORT_DT, options: Partial<TrainingOptions> = {}) {
  const { count = 8, inputPoints = 24, outputPoints = 24, sampling = 'uniform' } = options;
  for (const [value, min, max] of [[count, 1, 64], [inputPoints, 2, 96], [outputPoints, 2, 96]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid training set dimensions');
  }
  // Reproducible independent grids for each field; unchanged across optimizer updates.
  function grid(n: number, seed: number) {
    if (sampling === 'uniform') return points(n);
    let state = seed;
    return Array.from({length:n}, () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return (state + 0.5) / 4294967296;
    }).sort((a,b) => a-b);
  }
  return Array.from({ length: count }, (_, i) => {
    const xs = grid(inputPoints, 7919 * (i + 1)), ys = grid(outputPoints, 104729 * (i + 1));
    const values = xs.map(x => probe(x, i + 1));
    return { xs, ys, ds: cellWidths(xs), values, horizon,
      queryValues: ys.map(y => sampleAt(xs, values, y)), targetMode,
      target: targetReference(ys, i + 1, targetMode, horizon).map((v, j) => v + (withSource ? sourceValue(ys[j]) : 0)) };
  });
}
export type KernelTrainer = ReturnType<typeof createTrainer>;
export function createTrainer(mode: KernelArchitecture = "coordinates", withSource = false, units = 12, widths: number[] = [units], aggregation: Aggregation = "weighted") {
  if (!Number.isInteger(units) || units < 1 || units > 12) throw new Error("Hidden units must be an integer from 1 to 12");
  if (widths.length < 1 || widths.length > 5 || widths.some(w => !Number.isInteger(w) || w < 1 || w > 12)) throw new Error("Use 1–5 layers with 1–12 neurons each");
  const theta = initialParameters(mode, units, widths);
  return { mode, units, widths, aggregation, withSource, theta, m: Array(theta.length).fill(0) as number[], v: Array(theta.length).fill(0) as number[], step: 0, loss: 0 };
}
export function trainKernel(state: KernelTrainer, pairs: ReturnType<typeof trainingPairs>) {

  const grad = Array(state.theta.length).fill(0) as number[];
  let loss = 0;
  for (const p of pairs) for (let j = 0; j < p.ys.length; j++) {
    const derivative = Array(state.theta.length).fill(0) as number[];
    let pred = 0;
    for (let i = 0; i < p.xs.length; i++) {
      const fx = p.values[i], fy = p.queryValues[j];
      const factor = (state.aggregation === "direct" ? 1 : fx) * p.ds[i];
      const result = evaluate(state.theta, p.xs[i], p.ys[j], state.mode, state.widths, true, fx, fy);
      pred += factor * result.value;
      for (let k = 0; k < grad.length; k++) derivative[k] += factor * result.derivative[k];
    }
    const e = pred - p.target[j], scale = 1 / (pairs.length * p.ys.length);
    loss += e * e * scale;
    for (let k = 0; k < grad.length; k++) grad[k] += 2 * e * derivative[k] * scale;
  }
  state.step++;
  for (let k = 0; k < grad.length; k++) {
    state.m[k] = 0.9 * state.m[k] + 0.1 * grad[k];
    state.v[k] = 0.999 * state.v[k] + 0.001 * grad[k] ** 2;
    state.theta[k] -= 0.02 * (state.m[k] / (1 - 0.9 ** state.step)) / (Math.sqrt(state.v[k] / (1 - 0.999 ** state.step)) + 1e-8);
  }
  state.loss = loss;
}

const transportCache = new Map<string,ReturnType<typeof solveTransport>>();
export function targetReference(ys: number[], seed: number, target: TargetMode, horizon = TRANSPORT_DT) {
  if (target === 'smoothing') return reference(ys, seed);
  const key = `${seed}:${horizon}:${ys.join(',')}`;
  const cached = transportCache.get(key);
  if (cached) return [...cached.values];
  const result = solveTransport(x => probe(x,seed),ys,{time:horizon});
  if (transportCache.size >= 32) transportCache.delete(transportCache.keys().next().value!);
  transportCache.set(key,result);
  return [...result.values];
}
export function sampleAt(xs: number[], values: number[], y: number) {
  if(y <= xs[0]) return values[0];
  for(let i=1;i<xs.length;i++) if(y <= xs[i]) {
    const t=(y-xs[i-1])/(xs[i]-xs[i-1]);return values[i-1]*(1-t)+values[i]*t;
  }
  return values.at(-1)!;
}
export function applyLearned(theta: number[], mode: KernelArchitecture, widths: number[], xs: number[], values: number[], ys: number[], target: TargetMode, _horizon = TRANSPORT_DT, aggregation: Aggregation = target === "nonlinear" ? "direct" : "weighted") {
  const ds=cellWidths(xs);
  return ys.map(y=> {
    const fy=sampleAt(xs,values,y);
    return xs.reduce((sum,x,i)=>sum+neuralKernel(theta,x,y,mode,widths,values[i],fy)*(aggregation==='direct'?1:values[i])*ds[i],0);
  });
}

export function transportDiagnostics(ys:number[],seed:number,horizon:number) {
  const result=transportCache.get(`${seed}:${horizon}:${ys.join(',')}`);
  return result ? {accepted:result.accepted,rejected:result.rejected,n:result.n} : null;
}
