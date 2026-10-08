/**
 * Training-data worker: runs the same tank, from still water, once per example and
 * sends back the probe features. Several of these run in parallel; each one gets a
 * slice of example indices and its own noise seed.
 */
import { buildLayout, WaveTank } from './tank.ts';
import { makeSample, sampleSeed, type TaskName } from './tasks.ts';
import { mulberry32 } from './rng.ts';

export interface WorkRequest {
  task: TaskName;
  /** Example indices to generate (the index decides the class). */
  indices: number[];
  seed: number;
  jobId: number;
}

export interface WorkSample {
  index: number;
  x: Float32Array;
  raw: Float32Array;
  label: number;
}

export type WorkMessage =
  | { type: 'progress'; jobId: number; done: number }
  | { type: 'done'; jobId: number; samples: WorkSample[] };

const tank = new WaveTank(buildLayout());
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkRequest>) => {
  const { task, indices, seed, jobId } = ev.data;
  const samples: WorkSample[] = [];
  let done = 0;
  for (const index of indices) {
    // Per-example seed: the dataset is the same however the work is split.
    const s = makeSample(task, tank, index, mulberry32(sampleSeed(seed, index)));
    samples.push({ index, x: s.x, raw: s.raw, label: s.label });
    done++;
    if (done % 2 === 0 || done === indices.length) ctx.postMessage({ type: 'progress', jobId, done } satisfies WorkMessage);
  }
  ctx.postMessage({ type: 'done', jobId, samples } satisfies WorkMessage);
};
