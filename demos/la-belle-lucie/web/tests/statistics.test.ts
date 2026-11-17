import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import {
  analyze,
  bins,
  conditionalCurve,
  distribution,
  stalled,
  streak,
  total,
  transitionMatrix,
  validateStatistics,
  wilson,
  type Entry,
  type StatisticsData,
} from "../src/statistics.ts";

const entries: Entry[] = [
  { scores: [0, 0, 0], count: 2 },
  { scores: [0, 10, 52], count: 1 },
  { scores: [10, 20, 40], count: 3 },
  { scores: [10, 30, 52], count: 4 },
  { scores: [52, 52, 52], count: 2 },
];
test("conditionals use joint scores, retain absorbing wins and distinguish empty cohorts", () => {
  const at10 = analyze(entries, { round: 0, minimum: 10, maximum: 10 });
  assert.equal(at10.games, 7);
  assert.equal(at10.successes, 4);
  assert.equal(at10.probability, 4 / 7);
  assert.equal(
    analyze(entries, { round: 0, minimum: 0, maximum: 0 }).probability,
    1 / 3,
  );
  assert.equal(
    analyze(entries, { round: 0, minimum: 0, maximum: 10 }).probability,
    1 / 2,
  );
  const empty = analyze(entries, { round: 0, minimum: 51, maximum: 51 });
  assert.equal(empty.probability, null);
  assert.equal(empty.interval, null);
  assert.equal(total(empty.histogram[2]), 0);
  const alreadyWon = analyze(entries, { round: 0, minimum: 52, maximum: 52 });
  assert.equal(alreadyWon.probability, 1);
  assert.equal(alreadyWon.gains[1][0], 2);
  assert.equal(
    analyze(entries, undefined, { kind: "gainAtLeast", target: 20 }, 0)
      .successes,
    4,
  );
  assert.equal(
    analyze(entries, undefined, { kind: "finalAtLeast", target: 40 }).successes,
    10,
  );
});
test("transition columns, score summaries and conditional curves reconcile", () => {
  const matrix = transitionMatrix(entries, 0, 2);
  assert.equal(matrix.cells[10][52], 4);
  assert.equal(matrix.samples[10], 7);
  assert.equal(total(matrix.samples), 12);
  assert.equal(conditionalCurve(entries, 0)[10].probability, 4 / 7);
  assert.equal(conditionalCurve(entries, 0)[51].probability, null);
  const d = distribution(analyze(entries, undefined).histogram[0]);
  assert.equal(d.count, 12);
  assert.equal(d.median, 10);
  assert.equal(d.p90, 52);
  const s = stalled(entries, 1);
  assert.equal(s.continuing, 10);
  assert.equal(s.noProgress, 2);
  assert.equal(s.probability, 0.2);
});
test("Wilson intervals and losing streak probabilities handle boundary observations", () => {
  assert.equal(wilson(0, 0), null);
  assert(wilson(0, 10)![1] > 0.27);
  assert(wilson(10, 10)![0] < 0.73);
  assert(Math.abs(streak(0.2, 10).none - 0.8 ** 10) < 1e-12);
  assert.equal(streak(0, 10).atLeastOne, 0);
  assert.equal(streak(1, 10).none, 0);
});
test("published million-game cube matches all seven histograms and known conditional counts", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL("../public/stats/analysis.json", import.meta.url),
      "utf8",
    ),
  ) as StatisticsData;
  const actual = validateStatistics(data);
  assert.equal(analyze(actual, undefined).games, 1_000_000);
  assert.equal(analyze(actual, undefined).successes, 193_472);
  const at10 = analyze(actual, { round: 0, minimum: 10, maximum: 10 });
  assert.equal(at10.games, 37_829);
  assert.equal(at10.successes, 5_287);
  const at0 = analyze(actual, { round: 0, minimum: 0, maximum: 0 });
  assert.equal(at0.games, 19_171);
  assert.equal(at0.successes, 2_033);
  const damaged = structuredClone(data);
  damaged.joint[0][1]++;
  assert.throws(() => validateStatistics(damaged));
  const duplicate = structuredClone(data);
  duplicate.joint.push(duplicate.joint[0]);
  assert.throws(() => validateStatistics(duplicate));
  assert.equal(distribution(bins()).median, null);
});
