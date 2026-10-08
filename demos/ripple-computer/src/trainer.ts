/**
 * Builds a training set by running the tank in a few Web Workers (each example is
 * a fresh, noisy trial from still water), then fits the linear readouts.
 */
import { accuracy, trainReadout, type Readout } from './sim/readout.ts';
import { TASK_CLASSES, type TaskName } from './sim/tasks.ts';
import type { WorkMessage, WorkRequest, WorkSample } from './sim/worker.ts';

export interface TrainPlan {
  train: number;
  test: number;
  lambda: number;
}

export const PLANS: Record<TaskName, TrainPlan> = {
  xor: { train: 32, test: 32, lambda: 0.1 },
  digits: { train: 300, test: 100, lambda: 0.1 },
};

export interface TrainResult {
  task: TaskName;
  water: Readout;
  raw: Readout;
  waterTrain: number;
  waterTest: number;
  rawTrain: number;
  rawTest: number;
  examples: number;
  features: number;
  ms: number;
}

const SEED = 20031;

export async function trainTask(
  task: TaskName,
  onProgress: (done: number, total: number) => void,
): Promise<TrainResult> {
  const plan = PLANS[task];
  const total = plan.train + plan.test;
  const t0 = performance.now();
  const nWorkers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const indices = Array.from({ length: total }, (_, i) => i);
  // Interleave so every worker gets a mix of classes and finishes at the same time.
  const chunks: number[][] = Array.from({ length: nWorkers }, () => []);
  indices.forEach((i) => chunks[i % nWorkers].push(i));

  const progress = new Array(nWorkers).fill(0);
  const results = await Promise.all(
    chunks.map(
      (chunk, w) =>
        new Promise<WorkSample[]>((resolve, reject) => {
          const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (ev: MessageEvent<WorkMessage>) => {
            const m = ev.data;
            if (m.type === 'progress') {
              progress[w] = m.done;
              onProgress(
                progress.reduce((a, b) => a + b, 0),
                total,
              );
            } else {
              worker.terminate();
              resolve(m.samples);
            }
          };
          worker.onerror = (e) => {
            worker.terminate();
            reject(new Error(e.message || 'training worker failed'));
          };
          worker.postMessage({ task, indices: chunk, seed: SEED, jobId: w } satisfies WorkRequest);
        }),
    ),
  );
  const all = results.flat().sort((a, b) => a.index - b.index);
  const train = all.filter((s) => s.index < plan.train);
  const test = all.filter((s) => s.index >= plan.train);
  const k = TASK_CLASSES[task];
  const y = train.map((s) => s.label);
  const yt = test.map((s) => s.label);
  const water = trainReadout(train.map((s) => s.x), y, k, plan.lambda);
  const raw = trainReadout(train.map((s) => s.raw), y, k, plan.lambda);
  return {
    task,
    water,
    raw,
    waterTrain: accuracy(water, train.map((s) => s.x), y),
    waterTest: accuracy(water, test.map((s) => s.x), yt),
    rawTrain: accuracy(raw, train.map((s) => s.raw), y),
    rawTest: accuracy(raw, test.map((s) => s.raw), yt),
    examples: plan.train,
    features: train[0].x.length,
    ms: performance.now() - t0,
  };
}
