import { describe, expect, it } from 'vitest';
import weightFile from '../../data/weights.json';
import { CalcGPT } from '../../calcgpt/model.ts';
import { Mulberry32 } from '../../calcgpt/rng.ts';
import { Tokenizer } from '../../calcgpt/tokenizer.ts';
import { CONFIG, decodeWeights, type WeightFile } from '../../model/weights.ts';
import { ExactBackend, WaterBackend } from '../../engine/backend.ts';
import { answer } from '../../engine/generate.ts';
import { heldOutSample } from '../../model/heldout.ts';
import { CalcMode } from './mode.ts';

const file = weightFile as unknown as WeightFile;
const mode = new CalcMode();
mode.loadFile(file);
const specs = mode.weights();

/** calc-gpt's own model with the same trained weights: the reference. */
function reference(): CalcGPT {
  const m = new CalcGPT(CONFIG, new Mulberry32(1));
  const w = decodeWeights(file);
  for (const p of m.parameters()) p.data.set(w.get(p.name)!);
  return m;
}

/** The demo's water settings ("realistic" build). */
const REALISTIC = { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1 };

describe('ported calc-gpt forward pass', () => {
  it('matches the reference CalcGPT.forward logits at every position', () => {
    const ref = reference();
    const tok = new Tokenizer();
    for (const text of ['23+45=68;', '7+8=15', '99+99=198;', '0+0=0;']) {
      const ids = tok.encode(text);
      const f = ref.forward(ids, 1, ids.length);
      const seq = mode.newSequence(new ExactBackend(specs));
      for (let t = 0; t < ids.length; t++) {
        const logits = seq.step(ids[t]);
        for (let v = 0; v < CONFIG.vocabSize; v++) expect(logits[v]).toBeCloseTo(f.logits[t * CONFIG.vocabSize + v], 4);
      }
    }
  });

  it('gives the same greedy answers as the reference', () => {
    const ref = reference();
    const tok = new Tokenizer();
    for (const s of heldOutSample(60)) expect(answer(mode, s.prompt, new ExactBackend(specs))).toBe(ref.greedyAnswer(tok, s.prompt));
  });
});

describe('calc-gpt on water', () => {
  const cases = heldOutSample(120);

  it('an ideal crossbar machine gives the exact model\'s answers', () => {
    const w = new WaterBackend(specs, { bits: null, noise: 0, lambda: 0, seed: 1 });
    const ex = new ExactBackend(specs);
    for (const s of cases) expect(answer(mode, s.prompt, w)).toBe(answer(mode, s.prompt, ex));
  });

  it('the realistic machine (6-bit valves, 0.5% valve error, λ = 3e-5) answers held-out sums', () => {
    const w = new WaterBackend(specs, REALISTIC);
    w.commissionSync();
    const ex = new ExactBackend(specs);
    let okW = 0;
    let okE = 0;
    for (const s of cases) {
      if (answer(mode, s.prompt, w) === s.answer) okW++;
      if (answer(mode, s.prompt, ex) === s.answer) okE++;
    }
    // On all 508 held-out sums (tools/evaluate.ts): digital 99.8%, this water build 99.8%.
    expect(okE / cases.length).toBeGreaterThanOrEqual(0.97);
    expect(okW / cases.length).toBeGreaterThanOrEqual(0.97);
  });
});
