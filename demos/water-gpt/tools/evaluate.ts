/**
 * Held-out accuracy of the trained model, digital vs water, for several machine builds.
 *   npm run evaluate -- [weights.json]
 */
import { readFileSync } from 'node:fs';
import { CalcMode } from '../src/modes/calc/mode';
import { ExactBackend, WaterBackend } from '../src/engine/backend';
import { answer } from '../src/engine/generate';
import type { CrossbarSettings } from '../src/crossbar/tile';
import type { WeightFile } from '../src/model/weights';

const path = process.argv[2] ?? new URL('../src/data/weights.json', import.meta.url).pathname;
const mode = new CalcMode();
mode.loadFile(JSON.parse(readFileSync(path, 'utf8')) as WeightFile);
const specs = mode.weights();
const cases = mode.benchmark();

function acc(b: ExactBackend | WaterBackend): { acc: number; wrong: string[] } {
  let ok = 0;
  const wrong: string[] = [];
  for (const c of cases) {
    const a = answer(mode, c.prompt, b);
    if (a === c.answer) ok++;
    else wrong.push(c.prompt + a);
  }
  return { acc: ok / cases.length, wrong };
}

const t0 = Date.now();
const ex = acc(new ExactBackend(specs));
console.log(`exact digital: ${(ex.acc * 100).toFixed(1)}% of ${cases.length}  (${Date.now() - t0} ms)  wrong: ${ex.wrong.slice(0, 8).join(' ')}`);
const builds: [string, CrossbarSettings][] = [
  ['ideal water', { bits: null, noise: 0, lambda: 0, seed: 1 }],
  ['8-bit', { bits: 8, noise: 0, lambda: 0, seed: 1 }],
  ['6-bit', { bits: 6, noise: 0, lambda: 0, seed: 1 }],
  ['5-bit', { bits: 5, noise: 0, lambda: 0, seed: 1 }],
  ['4-bit', { bits: 4, noise: 0, lambda: 0, seed: 1 }],
  ['noise 0.5%', { bits: null, noise: 0.005, lambda: 0, seed: 1 }],
  ['noise 1%', { bits: null, noise: 0.01, lambda: 0, seed: 1 }],
  ['noise 2%', { bits: null, noise: 0.02, lambda: 0, seed: 1 }],
  ['λ 3e-5', { bits: null, noise: 0, lambda: 3e-5, seed: 1 }],
  ['λ 1e-4', { bits: null, noise: 0, lambda: 1e-4, seed: 1 }],
  ['realistic 6b/0.5%/3e-5', { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1 }],
  ['realistic seed 2', { bits: 6, noise: 0.005, lambda: 3e-5, seed: 2 }],
  ['realistic seed 3', { bits: 6, noise: 0.005, lambda: 3e-5, seed: 3 }],
  ['cheap 4b/2%/1e-4', { bits: 4, noise: 0.02, lambda: 1e-4, seed: 1 }],
];
const only = process.argv[3];
for (const [name, s] of builds) {
  if (only && !name.includes(only)) continue;
  const t = Date.now();
  const w = new WaterBackend(specs, s);
  w.commissionSync();
  const tc = Date.now() - t;
  const r = acc(w);
  console.log(`${name.padEnd(24)} ${(r.acc * 100).toFixed(1)}%  (commission ${tc} ms, eval ${Date.now() - t - tc} ms)  wrong: ${r.wrong.slice(0, 6).join(' ')}`);
}
