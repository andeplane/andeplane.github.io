export interface RoundStatistics {
  round: number;
  meanCumulativeCards: number;
  meanNewCards: number;
  cumulativeWins: number;
  firstWins: number;
  cumulativeHistogram: number[];
  incrementalHistogram: number[];
}
export interface StrategyStatistics {
  id: string;
  label: string;
  games: number;
  wins: number;
  seed: number;
  winProbability: number;
  winProbability95CI: [number, number];
  meanFinalCards: number;
  optimality: { description: string; globallyProvenOptimal: boolean };
}
export interface StatisticsData {
  schemaVersion: 1;
  experiment: {
    id: string;
    games: number;
    seed: string;
    startIndex: number;
    strategy: string;
    description: string;
    sourceRevision: string;
    recordsSha256: string;
    reportSha256: string;
    engineSha256: string;
    samplingNote: string;
  };
  rounds: RoundStatistics[];
  finalHistogram: number[];
  joint: [number, number][];
  examples: {
    id: string;
    title: string;
    gameIndex: number;
    scores: number[];
  }[];
  strategies: StrategyStatistics[];
}
export type Entry = { scores: [number, number, number]; count: number };
export type Cohort = { round: 0 | 1; minimum: number; maximum: number };
export type Outcome = {
  kind: "win" | "finalAtLeast" | "gainAtLeast";
  target: number;
};
export const bins = () => Array<number>(53).fill(0);
export const total = (values: number[]) =>
  values.reduce((sum, n) => sum + n, 0);

export function validateStatistics(data: StatisticsData): Entry[] {
  if (
    data.schemaVersion !== 1 ||
    !Number.isSafeInteger(data.experiment?.games) ||
    data.experiment.games < 1 ||
    data.rounds?.length !== 3 ||
    !Array.isArray(data.joint)
  )
    throw new Error("Unsupported statistics data");
  const seen = new Set<number>();
  const cumulative = [bins(), bins(), bins()],
    incremental = [bins(), bins(), bins()];
  const entries = data.joint.map(([index, count]) => {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= 53 ** 3 ||
      seen.has(index) ||
      !Number.isSafeInteger(count) ||
      count < 1
    )
      throw new Error("Invalid joint score counts");
    seen.add(index);
    const scores: Entry["scores"] = [
      Math.floor(index / 53 ** 2),
      Math.floor(index / 53) % 53,
      index % 53,
    ];
    if (scores[0] > scores[1] || scores[1] > scores[2])
      throw new Error("Scores decrease between rounds");
    scores.forEach((score, r) => {
      cumulative[r][score] += count;
      incremental[r][score - (r ? scores[r - 1] : 0)] += count;
    });
    return { scores, count };
  });
  const equal = (a: number[], b: number[]) =>
    Array.isArray(b) && b.length === 53 && a.every((n, i) => n === b[i]);
  if (
    total(cumulative[0]) !== data.experiment.games ||
    !equal(cumulative[2], data.finalHistogram)
  )
    throw new Error("Joint scores do not match the experiment");
  data.rounds.forEach((round, r) => {
    if (
      round.round !== r + 1 ||
      !equal(cumulative[r], round.cumulativeHistogram) ||
      !equal(incremental[r], round.incrementalHistogram) ||
      round.cumulativeWins !== cumulative[r][52] ||
      round.firstWins !== cumulative[r][52] - (r ? cumulative[r - 1][52] : 0)
    )
      throw new Error("Joint scores do not match the round summaries");
  });
  return entries;
}

export function wilson(
  successes: number,
  trials: number,
): [number, number] | null {
  if (!trials) return null;
  const z = 1.959963984540054,
    p = successes / trials,
    divisor = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / divisor;
  const radius =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) /
    divisor;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function matches(entry: Entry, cohort?: Cohort): boolean {
  return (
    !cohort ||
    (entry.scores[cohort.round] >= cohort.minimum &&
      entry.scores[cohort.round] <= cohort.maximum)
  );
}
export function isSuccess(
  entry: Entry,
  outcome: Outcome,
  round: 0 | 1,
): boolean {
  if (outcome.kind === "win") return entry.scores[2] === 52;
  if (outcome.kind === "finalAtLeast") return entry.scores[2] >= outcome.target;
  return entry.scores[round + 1] - entry.scores[round] >= outcome.target;
}
export function analyze(
  entries: Entry[],
  cohort: Cohort | undefined,
  outcome: Outcome = { kind: "win", target: 52 },
  round: 0 | 1 = cohort?.round ?? 0,
) {
  const selected = entries.filter((entry) => matches(entry, cohort));
  const histogram = [bins(), bins(), bins()],
    gains = [bins(), bins(), bins()];
  let games = 0,
    successes = 0;
  for (const entry of selected) {
    games += entry.count;
    if (isSuccess(entry, outcome, round)) successes += entry.count;
    entry.scores.forEach((score, r) => {
      histogram[r][score] += entry.count;
      gains[r][score - (r ? entry.scores[r - 1] : 0)] += entry.count;
    });
  }
  return {
    games,
    successes,
    probability: games ? successes / games : null,
    interval: wilson(successes, games),
    histogram,
    gains,
  };
}
export function distribution(histogram: number[]) {
  const count = total(histogram);
  const quantile = (fraction: number) => {
    if (!count) return null;
    let accumulated = 0;
    for (let i = 0; i < histogram.length; i++) {
      accumulated += histogram[i];
      if (accumulated >= Math.max(1, Math.ceil(fraction * count))) return i;
    }
    return null;
  };
  return {
    count,
    mean: count
      ? histogram.reduce((sum, n, i) => sum + n * i, 0) / count
      : null,
    p10: quantile(0.1),
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    p90: quantile(0.9),
  };
}
export function conditionalCurve(entries: Entry[], round: 0 | 1) {
  const samples = bins(),
    wins = bins();
  entries.forEach(({ scores, count }) => {
    samples[scores[round]] += count;
    if (scores[2] === 52) wins[scores[round]] += count;
  });
  return samples.map((n, score) => ({
    score,
    games: n,
    wins: wins[score],
    probability: n ? wins[score] / n : null,
    interval: wilson(wins[score], n),
  }));
}
export function transitionMatrix(entries: Entry[], from: 0 | 1, to: 1 | 2) {
  const cells = Array.from({ length: 53 }, bins),
    samples = bins();
  entries.forEach(({ scores, count }) => {
    cells[scores[from]][scores[to]] += count;
    samples[scores[from]] += count;
  });
  return { cells, samples };
}
export function stalled(entries: Entry[], round: 1 | 2) {
  let continuing = 0,
    noProgress = 0;
  entries.forEach(({ scores, count }) => {
    if (scores[round - 1] === 52) return;
    continuing += count;
    if (scores[round] === scores[round - 1]) noProgress += count;
  });
  return {
    continuing,
    noProgress,
    probability: continuing ? noProgress / continuing : null,
  };
}
export function streak(probability: number, games: number) {
  if (probability <= 0)
    return { none: 1, atLeastOne: 0, expectedWait: Infinity };
  if (probability >= 1) return { none: 0, atLeastOne: 1, expectedWait: 1 };
  const logNone = games * Math.log1p(-probability);
  return {
    none: Math.exp(logNone),
    atLeastOne: -Math.expm1(logNone),
    expectedWait: 1 / probability,
  };
}
