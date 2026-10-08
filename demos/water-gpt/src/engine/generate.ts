/** Greedy generation, run on water and on the exact digital model side by side. */
import type { ModelMode } from '../modes/types.ts';
import type { Backend, TraceEvent } from './backend.ts';
import { softmax, argmax } from '../modes/calc/forward.ts';

export interface GenStep {
  /** Token chosen by the water model (argmax of its logits). */
  token: number;
  waterProbs: Float32Array;
  /** The exact digital model's prediction for the same prefix. */
  exactProbs: Float32Array | null;
  /** The crossbar operations for the newest position, in order. */
  trace: TraceEvent[];
}

export interface Generation {
  prompt: string;
  promptTrace: TraceEvent[][];
  steps: GenStep[];
  text: string;
}

/**
 * Feed the prompt, then greedily generate until the stop token or the context is full.
 * The exact model reads the same tokens the water model chose, so their probabilities are
 * comparable step by step.
 */
export function generate(mode: ModelMode, prompt: string, water: Backend, exact: Backend | null, withTrace = true): Generation {
  const ids = mode.encode(prompt);
  const ws = mode.newSequence(water);
  const es = exact ? mode.newSequence(exact) : null;
  let cur: TraceEvent[] = [];
  water.trace = withTrace ? (e) => cur.push(e) : null;
  const promptTrace: TraceEvent[][] = [];
  let wl: Float32Array | null = null;
  let el: Float32Array | null = null;
  for (const id of ids) {
    cur = [];
    wl = ws.step(id);
    el = es ? es.step(id) : null;
    promptTrace.push(cur);
  }
  // The trace of the last prompt position is what produced the first answer token.
  const steps: GenStep[] = [];
  const out: number[] = [];
  let pos = ids.length;
  let trace = promptTrace[promptTrace.length - 1] ?? [];
  while (wl) {
    const tok = argmax(wl);
    steps.push({ token: tok, waterProbs: softmax(wl), exactProbs: el ? softmax(el) : null, trace });
    if (tok === mode.stopToken || steps.length >= mode.maxNewTokens || pos >= mode.contextLength) break;
    out.push(tok);
    cur = [];
    wl = ws.step(tok);
    el = es ? es.step(tok) : null;
    trace = cur;
    pos++;
  }
  water.trace = null;
  return { prompt, promptTrace, steps, text: mode.decode(out) };
}

/** Exact-match accuracy of greedy answers on a list of cases. */
export function answer(mode: ModelMode, prompt: string, backend: Backend): string {
  const seq = mode.newSequence(backend);
  let logits: Float32Array | null = null;
  for (const id of mode.encode(prompt)) logits = seq.step(id);
  const out: number[] = [];
  let pos = prompt.length;
  while (logits && out.length < mode.maxNewTokens && pos < mode.contextLength) {
    const t = argmax(logits);
    if (t === mode.stopToken) break;
    out.push(t);
    logits = seq.step(t);
    pos++;
  }
  return mode.decode(out);
}
