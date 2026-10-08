/**
 * A model mode is a pluggable language model for the water computer: its tokenizer, a way to
 * load its weights, the weight matrices that become crossbars, an incremental forward pass
 * that sends every matrix product through a `Backend`, and its own exhibit copy.
 *
 * calc-gpt is the first mode. Larger models (e.g. TinyStories-33M, GPT-2 small) plug in the
 * same way; for them the crossbar backend is expected to be batched on the GPU per tile.
 */
import type { Backend, WeightSpec } from '../engine/backend.ts';

export interface Sequence {
  /** Feed one token; returns logits for the next. */
  step(token: number): Float32Array;
}

export interface BenchmarkCase {
  prompt: string;
  answer: string;
}

export interface ModeCopy {
  /** Name in the mode switcher. */
  label: string;
  title: string;
  /** Short paragraph under the chapter-2 heading (HTML allowed). */
  intro: string;
  promptLabel: string;
  placeholder: string;
  examples: string[];
  /** Paragraph on what this model is and where its weights came from (HTML). */
  provenance: string;
}

export interface ModelMode {
  readonly id: string;
  /**
   * How the app shows this mode: 'exhibit' (default) is calc-gpt's step-by-step crossbar
   * exhibit on CPU crossbars; 'hall' runs on the WebGPU machine and is drawn as a field of
   * valves (the big models, src/big/).
   */
  readonly kind?: 'exhibit' | 'hall';
  readonly copy: ModeCopy;
  /** Display string for each token id (for the probability bars). */
  readonly vocab: string[];
  readonly contextLength: number;
  readonly stopToken: number | null;
  readonly maxNewTokens: number;
  /** Load weights (already trained; nothing is trained in the browser). */
  load(): Promise<void>;
  /** Facts about the loaded weights for the UI (e.g. parameter count, training result). */
  facts(): { label: string; value: string }[];
  weights(): WeightSpec[];
  encode(text: string): number[];
  decode(ids: number[]): string;
  /** Null when the prompt is usable, else a short reason. */
  validate(prompt: string): string | null;
  newSequence(backend: Backend): Sequence;
  /** Optional held-out benchmark with exact answers. */
  benchmark?(): BenchmarkCase[];
  /** Normalise a prompt typed by the user (e.g. add the trailing '='). */
  normalise?(prompt: string): string;
}
