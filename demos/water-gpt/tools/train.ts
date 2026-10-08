/**
 * Offline training for the water GPT. Run once with `npm run train` (not part of the build):
 * it trains calc-gpt (Anders Hafreager's from-scratch TypeScript GPT, copied into
 * src/calcgpt/) on two-digit addition, excluding the held-out pairs, and writes the
 * trained weights to src/data/weights.json. Those are the "factory settings" of the valves.
 *
 *   npm run train -- [steps] [--batch B] [--resume] [--in file] [--out file] [--noise σ]
 *
 * The committed weights were made in two runs (about 45 minutes on one CPU core):
 *   npm run train -- 16000 --batch 64 --out tools/.out/b.json               → 99.8% held-out
 *   npm run train -- 3000 --batch 64 --resume --in tools/.out/b.json --noise 0.01
 *
 * --noise σ enables hardware-aware fine-tuning: each step, the weight matrices that will be
 * crossbars are perturbed by Gaussian noise of σ × max|W|
 * before the forward/backward pass, and the gradient is applied to the clean weights
 * (a straight-through estimator). This makes the model tolerant of valve error.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { CalcGPT, type Param } from '../src/calcgpt/model';
import { Adam } from '../src/calcgpt/optimizer';
import { Batcher, type Problem, type ProblemGenerator } from '../src/calcgpt/data';
import { Mulberry32, randInt, randn, type Rng } from '../src/calcgpt/rng';
import { Tokenizer } from '../src/calcgpt/tokenizer';
import { heldOutSums, isHeldOut, MAX_OPERAND } from '../src/model/heldout';
import { CONFIG, encodeWeights, decodeWeights, type WeightFile } from '../src/model/weights';



class TrainAddition implements ProblemGenerator {
  constructor(private rng: Rng) {}
  sample(): Problem {
    for (;;) {
      const a = randInt(this.rng, 0, MAX_OPERAND + 1);
      const b = randInt(this.rng, 0, MAX_OPERAND + 1);
      if (!isHeldOut(a, b)) return { prompt: `${a}+${b}=`, answer: `${a + b}` };
    }
  }
}

const args = process.argv.slice(2);
const steps = Number(args[0] && /^\d+$/.test(args[0]) ? args[0] : 30000);
const resume = args.includes('--resume');
const ni = args.indexOf('--noise');
const noise = ni >= 0 ? Number(args[ni + 1]) : 0;
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? new URL(args[oi + 1], `file://${process.cwd()}/`) : new URL('../src/data/weights.json', import.meta.url);
const ii = args.indexOf('--in');
const IN = ii >= 0 ? new URL(args[ii + 1], `file://${process.cwd()}/`) : OUT;
const bi = args.indexOf('--batch');
const batchSize = bi >= 0 ? Number(args[bi + 1]) : 64;

const tokenizer = new Tokenizer();
const model = new CalcGPT(CONFIG, new Mulberry32(1337));
let prevSteps = 0;
if (resume && existsSync(IN)) {
  const wf = JSON.parse(readFileSync(IN, 'utf8')) as WeightFile;
  const w = decodeWeights(wf);
  for (const p of model.parameters()) p.data.set(w.get(p.name)!);
  prevSteps = wf.trainedSteps;
  console.log(`resumed from ${prevSteps} steps`);
}

const crossbarNames = new Set<string>();
for (const p of model.parameters()) if (/wqkv|wproj|w1|w2|wout/.test(p.name)) crossbarNames.add(p.name);

const batcher = new Batcher(tokenizer, CONFIG.blockSize);
const gen = new TrainAddition(new Mulberry32(7 + prevSteps));
const lr0 = resume ? 1e-3 : 3e-3;
const opt = new Adam(lr0);
const noiseRng = new Mulberry32(99 + prevSteps);
const evalSet = heldOutSums();

function evaluate(): number {
  let ok = 0;
  for (const s of evalSet) if (model.greedyAnswer(tokenizer, s.prompt) === s.answer) ok++;
  return ok / evalSet.length;
}

const t0 = Date.now();
let ema = 0;
for (let step = 1; step <= steps; step++) {
  // cosine decay with short warmup
  const warm = Math.min(1, step / 300);
  opt.lr = warm * (1e-5 + 0.5 * (lr0 - 1e-5) * (1 + Math.cos((Math.PI * step) / steps)));
  const problems: Problem[] = [];
  for (let i = 0; i < batchSize; i++) problems.push(gen.sample());
  const batch = batcher.encode(problems);
  model.zeroGrads();
  let saved: Map<Param, Float32Array> | null = null;
  if (noise > 0) {
    saved = new Map();
    for (const p of model.parameters()) {
      if (!crossbarNames.has(p.name)) continue;
      saved.set(p, p.data.slice());
      let m = 0;
      for (const v of p.data) m = Math.max(m, Math.abs(v));
      for (let i = 0; i < p.data.length; i++) p.data[i] += noise * m * randn(noiseRng);
    }
  }
  const loss = model.lossBackward(batch);
  if (saved) for (const [p, d] of saved) p.data.set(d);
  opt.step(model.parameters());
  ema = step === 1 ? loss : 0.98 * ema + 0.02 * loss;
  if (step % 1000 === 0 || step === steps) {
    const acc = step % 5000 === 0 || step === steps ? evaluate() : NaN;
    console.log(
      `step ${prevSteps + step}  loss ${ema.toFixed(4)}  lr ${opt.lr.toExponential(2)}  held-out ${
        Number.isNaN(acc) ? '–' : (acc * 100).toFixed(1) + '%'
      }  ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
}

const acc = evaluate();
const params = new Map<string, Float32Array>();
for (const p of model.parameters()) params.set(p.name, p.data);
const file = encodeWeights(params, {
  trainedSteps: prevSteps + steps,
  heldOutAccuracy: acc,
  heldOutCount: evalSet.length,
  noiseAwareSigma: noise,
});
writeFileSync(OUT, JSON.stringify(file));
console.log(`held-out accuracy ${(acc * 100).toFixed(2)}% on ${evalSet.length} sums; wrote ${OUT.pathname}`);
