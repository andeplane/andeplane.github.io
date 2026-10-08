/** calc-gpt as a water-computer mode. */
import { CONFIG, decodeWeights, type WeightFile } from '../../model/weights.ts';
import { heldOutSums } from '../../model/heldout.ts';
import { VOCAB } from '../../calcgpt/tokenizer.ts';
import type { Backend } from '../../engine/backend.ts';
import type { ModelMode } from '../types.ts';
import { CalcForward, weightSpecs, type Params } from './forward.ts';

export class CalcMode implements ModelMode {
  readonly id = 'calc';
  readonly vocab = VOCAB.split('');
  readonly contextLength = CONFIG.blockSize;
  readonly stopToken = VOCAB.indexOf(';');
  readonly maxNewTokens = 4;
  private params: Params | null = null;
  private file: WeightFile | null = null;

  readonly copy = {
    label: 'calc-gpt',
    title: 'A GPT that adds, in water',
    intro:
      'Type a sum. Each character is looked up as a row of 32 numbers, and those numbers become the water heads in the input reservoirs. Water then runs through the crossbars of two transformer layers, one after the other, and the output collectors give the score of every possible next character.',
    promptLabel: 'Sum',
    placeholder: '23+45=',
    examples: ['23+45=', '7+8=', '58+67=', '99+99=', '40+2='],
    provenance:
      'The model is <a href="/projects/calc-gpt" target="_top">calc-gpt</a>, a 27 000-parameter GPT written from scratch in TypeScript: 16-character vocabulary, 12-character context, 2 layers, 4 heads, 32-wide. It was trained once, offline, on two-digit additions, and then fine-tuned for a short while with random valve errors added to its weights, so it tolerates an imperfect machine. A fixed 5% of all pairs was held out from training and is used for the accuracy readout below.',
  };

  async load(): Promise<void> {
    if (this.params) return;
    const mod = (await import('../../data/weights.json')) as unknown as { default: WeightFile };
    this.loadFile(mod.default);
  }

  loadFile(f: WeightFile): void {
    this.file = f;
    this.params = decodeWeights(f);
  }

  get parameters(): Params {
    if (!this.params) throw new Error('weights not loaded');
    return this.params;
  }

  facts(): { label: string; value: string }[] {
    const f = this.file!;
    let n = 0;
    for (const v of this.parameters.values()) n += v.length;
    return [
      { label: 'parameters', value: n.toLocaleString('en-US') },
      { label: 'training steps', value: f.trainedSteps.toLocaleString('en-US') },
      { label: 'held-out (digital)', value: `${(f.heldOutAccuracy * 100).toFixed(1)}% of ${f.heldOutCount}` },
    ];
  }

  weights() {
    return weightSpecs(CONFIG, this.parameters);
  }

  encode(text: string): number[] {
    return text.split('').map((c) => this.vocab.indexOf(c));
  }

  decode(ids: number[]): string {
    return ids.map((i) => this.vocab[i]).join('');
  }

  normalise(prompt: string): string {
    const s = prompt.replace(/\s+/g, '');
    return s.endsWith('=') ? s : s + '=';
  }

  validate(prompt: string): string | null {
    const m = /^(\d{1,2})\+(\d{1,2})=$/.exec(prompt);
    if (!m) return 'Type a sum of two numbers from 0 to 99, like 23+45';
    if (m[1].length > 1 && m[1][0] === '0') return 'No leading zeros, please';
    if (m[2].length > 1 && m[2][0] === '0') return 'No leading zeros, please';
    return null;
  }

  newSequence(backend: Backend) {
    return new CalcForward(CONFIG, this.parameters, backend);
  }

  benchmark() {
    return heldOutSums().map(({ prompt, answer }) => ({ prompt, answer }));
  }
}
