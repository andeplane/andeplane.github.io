/**
 * The non-linear parts of a transformer as small hydraulic circuits, so that nothing between
 * the crossbars is done digitally. Each circuit is built from four kinds of part:
 *
 *  - laminar pipes and valves: flow = conductance × head difference (Hagen–Poiseuille);
 *  - junctions: water is conserved, so flows into a node sum to zero (Kirchhoff);
 *  - check valves: water passes one way only;
 *  - sharp-edged orifices: turbulent, so head loss ∝ flow² (the orifice equation).
 *
 * Circuits:
 *
 *  ReLU     a check valve. GELU: a spring-loaded check valve whose poppet port is profiled so
 *           its opening follows Φ(head) (the tanh form GPT-2 uses); flow = head × opening.
 *
 *  softmax  1. a check-valve "max" node: every score head feeds one node through its own check
 *              valve, so the node sits at the highest head, M;
 *           2. each score drives a pilot valve whose port is profiled exponentially, so its
 *              conductance is G_j = G₀ · e^{(s_j − M)/√d} (the 1/√d is in the profile);
 *           3. a constant total inflow Q enters one node and leaves through all those valves
 *              to a common drain. By Kirchhoff the branch flows are q_j = Q · G_j / Σ G:
 *              exactly softmax. A shut valve still leaks a little (G ≥ G_LEAK · G₀).
 *
 *  LayerNorm 1. averaging node: every channel feeds one node through an equal pipe; with no
 *              other outlet the node settles at the mean head μ;
 *           2. each deviation x_i − μ (a head difference) drives flow through an orifice, whose
 *              head loss ∝ flow² gives (x_i − μ)²; a second averaging node gives the variance;
 *           3. the variance head (plus a small fixed head ε) drives an orifice whose flow
 *              ∝ √(v + ε) = σ;
 *           4. each deviation drives flow through a pilot valve opened in proportion to σ, so
 *              the head across it is (x_i − μ) / σ; the factory-set gain γ_i and offset head β_i
 *              finish it.
 *
 * Regulator: between crossbars, each collector pair's flow drives a pilot-operated pressure
 *           regulator (a mechanical hydraulic amplifier) that holds the next reservoir at a
 *           head proportional to that flow. Its gain was set at commissioning; it is built with
 *           the same tolerance as every other part, so each regulator has its own gain error.
 *
 * Biases are fixed inflows from constant-head tanks and residual adds are flows merging in a
 * collector; both are exact by conservation of mass and are not modelled separately.
 *
 * Non-idealities: every part above is manufactured with a fixed relative error,
 * σ = settings.noise (the same tolerance as the crossbar valves), drawn from a counter-based
 * hash of (circuit seed, part, channel) so the GPU realises exactly the same parts. With
 * noise 0 every circuit is exactly the digital function.
 */
import { gauss3 } from './rng.ts';
import { matrixSeed } from './matrix.ts';

/** Leakage of a fully shut exponential valve, relative to fully open. */
export const G_LEAK = 1e-9;

/** Part codes (the middle hash argument). Softmax valves use SOFTMAX_PART + head. */
const P_MEAN = 1;
const P_SQUARE = 2;
const P_VAR = 3;
const P_SQRT = 4;
const P_GAIN = 5;
const P_ACT = 6;
const SOFTMAX_PART = 16;
/** Regulator banks use REGULATOR_PART + bank (bank = head for attention, 0 otherwise). */
const REGULATOR_PART = 32;

export interface ElementPhysics {
  noise: number;
  seed: number;
}

/** The circuit seed for a tag, e.g. "l0.ln1", "L3.fc.act", "l0.softmax". */
export function elementSeed(tag: string, seed: number): number {
  return matrixSeed(`${tag}#element`, seed);
}

/** 1 + σ·ξ for one part, never below 0 (a part cannot pass negative water). */
function part(noise: number, s: number, p: number, i: number): number {
  if (noise === 0) return 1;
  return Math.max(0, 1 + noise * gauss3(s, p, i));
}

export function waterLayerNorm(
  phys: ElementPhysics,
  tag: string,
  x: Float32Array,
  g: Float32Array,
  b: Float32Array,
  eps: number,
  out: Float32Array = new Float32Array(g.length),
): Float32Array {
  const n = g.length;
  const s = elementSeed(tag, phys.seed);
  const nz = phys.noise;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const w = part(nz, s, P_MEAN, i);
    num += w * x[i];
    den += w;
  }
  const mean = num / den;
  num = 0;
  den = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    const w = part(nz, s, P_VAR, i);
    num += w * d * d * part(nz, s, P_SQUARE, i);
    den += w;
  }
  const sd = Math.sqrt(num / den + eps) * part(nz, s, P_SQRT, 0);
  for (let i = 0; i < n; i++) out[i] = ((x[i] - mean) / sd) * g[i] * part(nz, s, P_GAIN, i) + b[i];
  return out;
}

/**
 * Attention weights from scores. `head` picks the valve bank, `j0` is the absolute position of
 * the first key (each cached position has its own valve).
 */
export function waterSoftmax(phys: ElementPhysics, tag: string, head: number, scores: Float32Array, scale: number, j0 = 0): Float32Array {
  const s = elementSeed(tag, phys.seed);
  let mx = -Infinity;
  for (let j = 0; j < scores.length; j++) mx = Math.max(mx, scores[j] * scale);
  const q = new Float32Array(scores.length);
  let z = 0;
  for (let j = 0; j < scores.length; j++) {
    const G = Math.max(G_LEAK, Math.exp(scores[j] * scale - mx) * part(phys.noise, s, SOFTMAX_PART + head, j0 + j));
    q[j] = G;
    z += G;
  }
  for (let j = 0; j < q.length; j++) q[j] /= z;
  return q;
}

export function geluProfile(x: number): number {
  return 0.5 * (1 + Math.tanh(0.7978845608028654 * (x + 0.044715 * x * x * x)));
}

/** ReLU (check valve) or GELU (profiled spring-loaded check valve), in place. */
export function waterActivation(phys: ElementPhysics, tag: string, kind: 'relu' | 'gelu', x: Float32Array): Float32Array {
  const s = elementSeed(tag, phys.seed);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const open = kind === 'relu' ? (v > 0 ? 1 : 0) : geluProfile(v);
    x[i] = v * open * part(phys.noise, s, P_ACT, i);
  }
  return x;
}

/**
 * The regulators after a crossbar, in place: y_i scaled by its regulator's gain error.
 * `tag` names the crossbar ("l0.wqkv", "l0.qk", …), `bank` the head (0 for weight crossbars),
 * `i0` the index of y[0] within the bank.
 */
export function waterRegulate(phys: ElementPhysics, tag: string, bank: number, y: Float32Array, i0 = 0): Float32Array {
  if (phys.noise === 0) return y;
  const s = elementSeed(`${tag}.reg`, phys.seed);
  for (let i = 0; i < y.length; i++) y[i] *= part(phys.noise, s, REGULATOR_PART + bank, i0 + i);
  return y;
}

/** WGSL twins of part() and geluProfile(); needs WGSL_RNG. */
export const WGSL_ELEMENTS = /* wgsl */ `
const G_LEAK: f32 = ${G_LEAK.toExponential()};
fn part(noise: f32, s: u32, pc: u32, i: u32) -> f32 {
  if (noise == 0.0) { return 1.0; }
  return max(0.0, 1.0 + noise * gauss3(s, pc, i));
}
fn geluProfile(x: f32) -> f32 {
  let u = clamp(0.7978845608028654 * (x + 0.044715 * x * x * x), -15.0, 15.0);
  return 0.5 * (1.0 + tanh(u));
}
`;
