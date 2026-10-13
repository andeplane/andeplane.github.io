/**
 * Sculpt every tank (offline; not part of the build).
 *
 *   node --experimental-strip-types tools/design-tanks.ts
 *
 * Chapter 1: one tank per target matrix in src/model/targets.ts.
 * Chapter 2: one tank per 8×8 tile of the trained model's two weight matrices
 * (run tools/train.ts first). Each floor is inverse-designed with
 * Levenberg–Marquardt through the Helmholtz solve (tools/inverse.ts), on four
 * worker threads, then written to src/data/tanks.bin + tanks.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { allTiles, GAIN, TILE, type Weights } from '../src/model/llm.ts';
import { TARGETS } from '../src/model/targets.ts';
import { NX, NY } from '../src/sim/tank.ts';
import type { BankMeta, TankMeta } from '../src/sim/bank.ts';
import { designLM } from './inverse.ts';

interface Job {
  meta: Omit<TankMeta, 'loss' | 'offset'>;
  W: number[][];
}

const here = dirname(fileURLToPath(import.meta.url));

if (!isMainThread) {
  const job = workerData as Job;
  let best: { c2q: Uint16Array; loss: number } | null = null;
  for (let seed = 1; seed <= 4; seed++) {
    const res = designLM(job.W, { gain: GAIN, iters: 30, seed: seed * 101 + job.meta.id.length, target: 1e-9 });
    if (!best || res.loss < best.loss) best = res;
    if (best.loss < 1e-8) break;
  }
  parentPort!.postMessage({ loss: best!.loss, c2q: best!.c2q });
} else {
  const jobs: Job[] = [];
  for (const t of TARGETS) {
    jobs.push({ meta: { id: t.id, kind: 'matrix', nIn: t.W[0].length, nOut: t.W.length, target: t.id }, W: t.W });
  }
  const model = JSON.parse(readFileSync(join(here, '../src/data/model.json'), 'utf8')) as { weights: Weights };
  for (const tile of allTiles(model.weights)) {
    jobs.push({
      meta: {
        id: `L${tile.layer}-${tile.r}${tile.c}`,
        kind: 'llm',
        nIn: TILE,
        nOut: TILE,
        layer: tile.layer,
        r: tile.r,
        c: tile.c,
        rows: tile.rows,
        cols: tile.cols,
      },
      W: tile.W,
    });
  }
  const only = process.argv[2];
  const todo = only ? jobs.filter((j) => j.meta.id.startsWith(only)) : jobs;
  const results = new Map<string, { loss: number; c2q: Uint16Array }>();
  const t0 = performance.now();
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length) {
        const job = todo[next++];
        const res = await new Promise<{ loss: number; c2q: Uint16Array }>((resolve, reject) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
          w.once('message', resolve);
          w.once('error', reject);
        });
        results.set(job.meta.id, res);
        console.log(`${job.meta.id.padEnd(9)} loss ${res.loss.toExponential(2)}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
      }
    }),
  );
  if (only) process.exit(0);
  const words = new Uint16Array(jobs.length * NX * NY);
  const tanks: TankMeta[] = jobs.map((job, k) => {
    const res = results.get(job.meta.id)!;
    words.set(res.c2q, k * NX * NY);
    return { ...job.meta, loss: Number(res.loss.toExponential(3)), offset: k * NX * NY };
  });
  const meta: BankMeta = { nx: NX, ny: NY, gain: GAIN, tanks };
  writeFileSync(join(here, '../src/data/tanks.json'), JSON.stringify(meta, null, 1));
  writeFileSync(join(here, '../src/data/tanks.bin'), Buffer.from(words.buffer));
  console.log(`wrote ${tanks.length} tanks, ${(words.byteLength / 1024).toFixed(0)} KiB`);
}
