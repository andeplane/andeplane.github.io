import { Rng } from "../sim/rng";

export type OperatorId = "add" | "subtract" | "multiply" | "divide";
export type Stars = 1 | 2 | 3;
export const QUESTIONS_PER_LEVEL = 10;
export const GOLD_PER_CHEST = 1000;
export const SAVE_KEY = "broadside.math.v1";

export const OPERATORS = [
  { id: "add", symbol: "+", name: "Addition", verb: "Add the treasure", sample: "3 + 4", color: "#a8dfbe" },
  { id: "subtract", symbol: "−", name: "Subtraction", verb: "Take some away", sample: "9 − 3", color: "#f3c77c" },
  { id: "multiply", symbol: "×", name: "Multiplication", verb: "Make equal groups", sample: "2 × 5", color: "#d2bcf0" },
  { id: "divide", symbol: "÷", name: "Division", verb: "Share the treasure", sample: "12 ÷ 3", color: "#99dce7" },
] as const;

export interface Pack {
  id: string;
  operator: OperatorId;
  name: string;
  label: string;
  description: string;
  example: string;
  island: string;
  limit?: number;
  tables?: readonly number[];
}
const islandNames = ["Little Palm Bay", "Doubloon Island", "Buccaneer Coast", "Stormy Straits", "The Kraken's Deep"];
const islandArt = ["first-sails", "pirate-waters", "first-sails", "whirlpool-straits", "glowing-deep"];
const pack = (operator: OperatorId, index: number, values: Omit<Pack, "operator" | "name" | "island">): Pack => ({
  ...values, operator, name: islandNames[index]!, island: islandArt[index]!,
});
export const PACKS: readonly Pack[] = [
  ...[10, 20, 30, 40, 50].map((limit, i) => pack("add", i, {
    id: `add-${limit}`, label: `Up to ${limit}`, description: `Add two numbers. Their total is ${limit} or less.`,
    example: `${Math.floor(limit * 0.4)} + ${Math.floor(limit * 0.5)}`, limit,
  })),
  pack("subtract", 0, { id: "subtract-takeaway", label: "Take away", description: "Start with up to 10. Take away a little treasure.", example: "8 − 3", limit: 10 }),
  pack("subtract", 1, { id: "subtract-ten", label: "Crossing ten", description: "Start between 11 and 18. Jump back across ten.", example: "14 − 6", limit: 20 }),
  pack("subtract", 2, { id: "subtract-twodigit", label: "Two digits", description: "Subtract two-digit numbers up to 50, without borrowing.", example: "47 − 25", limit: 50 }),
  pack("subtract", 3, { id: "subtract-borrow", label: "Borrowing", description: "Subtract within 100. Exchange a ten for ten ones.", example: "52 − 27", limit: 100 }),
  pack("subtract", 4, { id: "subtract-deep", label: "Three digits", description: "Subtract within 1,000, with borrowing. No negative answers.", example: "402 − 185", limit: 1000 }),
  ...([
    { tables: [2], label: "Twos", example: "2 × 4" },
    { tables: [5, 10], label: "Fives & tens", example: "5 × 7" },
    { tables: [3, 4], label: "Threes & fours", example: "4 × 6" },
    { tables: [6, 7, 8, 9], label: "Sixes to nines", example: "7 × 8" },
    { tables: Array.from({ length: 12 }, (_, i) => i + 1), label: "All tables to 12", example: "12 × 11" },
  ] as const).map((p, i) => pack("multiply", i, {
    id: `multiply-${i + 1}`, ...p,
    description: i === 4 ? "Mix every times table from 1 to 12, with factors up to 12." : `Practice the ${p.tables.join(", ")} times tables, with factors from 1 to 10.`,
  })),
  ...([
    { tables: [2], label: "Share in twos", example: "8 ÷ 2" },
    { tables: [5, 10], label: "Fives & tens", example: "35 ÷ 5" },
    { tables: [3, 4], label: "Threes & fours", example: "24 ÷ 4" },
    { tables: [6, 7, 8, 9], label: "Sixes to nines", example: "56 ÷ 7" },
    { tables: Array.from({ length: 12 }, (_, i) => i + 1), label: "All tables to 12", example: "132 ÷ 12" },
  ] as const).map((p, i) => pack("divide", i, {
    id: `divide-${i + 1}`, ...p,
    description: i === 4 ? "Divide by numbers from 1 to 12. Every answer is a whole number up to 12." : `Share equally into groups of ${p.tables.join(", ")}. Whole-number answers from 1 to 10.`,
  })),
];
export const getPack = (id: string): Pack => PACKS.find((p) => p.id === id) ?? PACKS[0]!;
export const getOperator = (id: OperatorId) => OPERATORS.find((o) => o.id === id)!;
export const packsFor = (id: OperatorId) => PACKS.filter((p) => p.operator === id);

export interface Question {
  operator: OperatorId;
  left: number;
  right: number;
  answer: number;
}
function makeQuestion(p: Pack, rng: Rng): Question {
  let left: number, right: number, answer: number;
  if (p.operator === "add") {
    const total = rng.int(2, p.limit!);
    left = rng.int(0, total);
    right = total - left;
    answer = total;
  } else if (p.operator === "subtract") {
    switch (p.id) {
      case "subtract-takeaway":
        left = rng.int(2, 10); right = rng.int(1, left); break;
      case "subtract-ten":
        left = rng.int(11, 18); right = rng.int(left - 9, 9); break;
      case "subtract-twodigit":
        left = rng.int(12, 50);
        right = rng.int(1, Math.floor(left / 10)) * 10 + rng.int(0, left % 10); break;
      case "subtract-borrow":
        left = rng.int(20, 99);
        if (left % 10 === 9) left--;
        right = rng.int(0, Math.floor(left / 10) - 1) * 10 + rng.int(left % 10 + 1, 9); break;
      default:
        left = rng.int(100, 999);
        right = rng.int(11, left - 1);
        // Guarantee a borrowing problem without building a huge question bank.
        if (left % 10 >= right % 10 && Math.floor(left / 10) % 10 >= Math.floor(right / 10) % 10) {
          left = Math.floor(left / 10) * 10;
          right = Math.min(left - 1, Math.floor(right / 10) * 10 + rng.int(1, 9));
        }
    }
    answer = left - right;
  } else {
    const table = rng.pick(p.tables!);
    const factor = rng.int(1, p.tables!.length === 12 ? 12 : 10);
    if (p.operator === "multiply") {
      left = table; right = factor; answer = left * right;
    } else {
      left = table * factor; right = table; answer = factor;
    }
  }
  return { operator: p.operator, left, right, answer };
}
/** Each voyage has fresh, reproducible questions and no repeated facts within it. */
export function questionsFor(packId: string, seed: number): Question[] {
  const p = getPack(packId), rng = new Rng(seed), questions: Question[] = [], seen = new Set<string>();
  while (questions.length < QUESTIONS_PER_LEVEL) {
    const q = makeQuestion(p, rng), key = `${q.left}:${q.right}`;
    if (seen.has(key)) continue;
    seen.add(key); questions.push(q);
  }
  return questions;
}

export interface Voyage {
  level: number;
  seed: number;
  solved: number;
  mistakes: number;
}
export interface Track {
  cleared: number;
  stars: Record<string, Stars>;
  runs: Record<string, Voyage>;
}
export interface MathProgress {
  version: 1;
  solved: number;
  operator: OperatorId;
  pack: string;
  banks: Record<OperatorId, number>;
  tracks: Record<string, Track>;
}
export const freshProgress = (): MathProgress => ({ version: 1, solved: 0, operator: "add", pack: "add-10", banks: { add: 0, subtract: 0, multiply: 0, divide: 0 }, tracks: {} });
export const goldTotal = (p: MathProgress) => Math.floor(p.solved / QUESTIONS_PER_LEVEL) * GOLD_PER_CHEST;
export const chestCount = (p: MathProgress) => Math.floor(p.solved / QUESTIONS_PER_LEVEL);
export const bankGold = (p: MathProgress) => OPERATORS.map((o) => p.banks[o.id] * GOLD_PER_CHEST);
export function trackFor(p: MathProgress, packId: string): Track {
  return p.tracks[packId] ??= { cleared: 0, stars: {}, runs: {} };
}
export function startVoyage(p: MathProgress, packId: string, level: number, seed: number): Voyage | null {
  if (!PACKS.some((pack) => pack.id === packId)) return null;
  const track = trackFor(p, packId);
  if (!Number.isSafeInteger(level) || level < 1 || level > track.cleared + 1) return null;
  return track.runs[level] ??= { level, seed: seed >>> 0, solved: 0, mistakes: 0 };
}
export interface AnswerResult {
  correct: boolean;
  chestEarned: boolean;
  levelComplete: boolean;
  stars: Stars;
}
export function answerQuestion(p: MathProgress, packId: string, level: number, answer: number): AnswerResult | null {
  const track = p.tracks[packId], run = track?.runs[level];
  if (!run || !Number.isSafeInteger(answer) || answer < 0) return null;
  const question = questionsFor(packId, run.seed)[run.solved]!;
  if (answer !== question.answer) {
    run.mistakes++;
    return { correct: false, chestEarned: false, levelComplete: false, stars: 1 };
  }
  run.solved++;
  p.solved++;
  const chestEarned = p.solved % QUESTIONS_PER_LEVEL === 0;
  if (chestEarned) p.banks[getPack(packId).operator]++;
  const stars: Stars = run.mistakes === 0 ? 3 : run.mistakes <= 3 ? 2 : 1;
  const levelComplete = run.solved === QUESTIONS_PER_LEVEL;
  if (levelComplete) {
    track.cleared = Math.max(track.cleared, level);
    track.stars[level] = Math.max(track.stars[level] ?? 1, stars) as Stars;
    delete track.runs[level];
  }
  return { correct: true, chestEarned, levelComplete, stars };
}

const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** Math progress lives under its own key. Sailing saves are never read or written. */
export function readMathProgress(storage?: Pick<Storage, "getItem">): MathProgress {
  const p = freshProgress();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SAVE_KEY) ?? "null");
    if (!record(raw) || raw.version !== 1) return p;
    p.solved = integer(raw.solved) ? raw.solved : 0;
    const selected = PACKS.find((pack) => pack.id === raw.pack);
    if (selected) { p.pack = selected.id; p.operator = selected.operator; }
    if (OPERATORS.some((o) => o.id === raw.operator)) p.operator = raw.operator as OperatorId;
    // Preserve older math saves, which recorded only the total gold.
    const banks = raw.banks;
    if (record(banks) && OPERATORS.every((o) => integer(banks[o.id])) &&
        OPERATORS.reduce((sum, o) => sum + (banks[o.id] as number), 0) === chestCount(p)) {
      for (const o of OPERATORS) p.banks[o.id] = banks[o.id] as number;
    } else p.banks[p.operator] = chestCount(p);
    if (record(raw.tracks)) for (const pack of PACKS) {
      const source = raw.tracks[pack.id];
      if (!record(source)) continue;
      const track: Track = { cleared: integer(source.cleared) ? source.cleared : 0, stars: {}, runs: {} };
      if (record(source.stars)) for (const [key, stars] of Object.entries(source.stars)) {
        if (/^[1-9]\d*$/.test(key) && integer(Number(key), 1, track.cleared) && integer(stars, 1, 3)) track.stars[key] = stars as Stars;
      }
      if (record(source.runs)) for (const [key, run] of Object.entries(source.runs)) {
        if (!/^[1-9]\d*$/.test(key) || !record(run) || !integer(Number(key), 1, track.cleared + 1) ||
          run.level !== Number(key) || !integer(run.seed, 0, 0xffffffff) || !integer(run.solved, 0, 9) || !integer(run.mistakes)) continue;
        track.runs[key] = { level: Number(key), seed: run.seed, solved: run.solved, mistakes: run.mistakes };
      }
      p.tracks[pack.id] = track;
    }
  } catch { /* A missing or corrupt save starts a new adventure. */ }
  return p;
}
export function saveMathProgress(p: MathProgress, storage?: Pick<Storage, "setItem">): boolean {
  try { if (!storage) return false; storage.setItem(SAVE_KEY, JSON.stringify(p)); return true; }
  catch { return false; }
}
