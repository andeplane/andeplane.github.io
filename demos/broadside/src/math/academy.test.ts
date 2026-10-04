import { describe, expect, it } from "vitest";
import { PACKS, SAVE_KEY, answerQuestion, bankGold, chestCount, freshProgress, goldTotal, questionsFor, readMathProgress, saveMathProgress, startVoyage, trackFor } from "./academy";

describe("Captain Calculus question tracks", () => {
  it("generates ten distinct, reproducible facts at every independent difficulty", () => {
    expect(PACKS).toHaveLength(20);
    for (const p of PACKS) for (let seed = 0; seed < 25; seed++) {
      const questions = questionsFor(p.id, seed);
      expect(questions).toHaveLength(10);
      expect(questions).toEqual(questionsFor(p.id, seed));
      expect(new Set(questions.map((q) => `${q.left}:${q.right}`)).size).toBe(10);
      for (const q of questions) {
        expect(Number.isInteger(q.answer)).toBe(true);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        if (p.operator === "add") { expect(q.left + q.right).toBe(q.answer); expect(q.answer).toBeLessThanOrEqual(p.limit!); }
        if (p.operator === "subtract") {
          expect(q.left - q.right).toBe(q.answer);
          expect(q.left).toBeLessThanOrEqual(p.limit!);
          if (p.id === "subtract-ten") { expect(q.left).toBeGreaterThan(10); expect(q.answer).toBeLessThan(10); }
          if (p.id === "subtract-twodigit") { expect(q.left % 10).toBeGreaterThanOrEqual(q.right % 10); expect(q.right).toBeGreaterThanOrEqual(10); }
          if (p.id === "subtract-borrow") expect(q.left % 10).toBeLessThan(q.right % 10);
          if (p.id === "subtract-deep") expect(q.left).toBeGreaterThanOrEqual(100);
        }
        if (p.operator === "multiply") { expect(q.left * q.right).toBe(q.answer); expect(p.tables).toContain(q.left); }
        if (p.operator === "divide") { expect(q.right).toBeGreaterThan(0); expect(q.left / q.right).toBe(q.answer); expect(p.tables).toContain(q.right); }
      }
    }
  });
  it("uses table difficulty rather than addition caps for multiplication and division", () => {
    const mixed = questionsFor("multiply-5", 91);
    expect(mixed.some((q) => q.answer > 50)).toBe(true);
    expect(questionsFor("divide-5", 91).some((q) => q.left > 50)).toBe(true);
    expect(questionsFor("add-10", 1)).not.toEqual(questionsFor("add-10", 2));
  });
});

describe("endless voyages, rewards and isolated saves", () => {
  const storage = () => {
    const data = new Map<string, string>([["broadside.v1", '{"relics":[1,2]}']]);
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  };
  const solve = (p: ReturnType<typeof freshProgress>, pack: string, level: number, count = 10) => {
    const run = startVoyage(p, pack, level, 27)!;
    const questions = questionsFor(pack, run.seed);
    let result;
    for (let i = 0; i < count; i++) result = answerQuestion(p, pack, level, questions[run.solved]!.answer);
    return result;
  };
  it("only advances on a correct answer and awards exactly one chest per ten solved facts", () => {
    const p = freshProgress();
    startVoyage(p, "add-10", 1, 27);
    const q = questionsFor("add-10", 27)[0]!;
    expect(answerQuestion(p, "add-10", 1, q.answer + 1)?.correct).toBe(false);
    expect(p.solved).toBe(0);
    expect(trackFor(p, "add-10").runs[1]!.solved).toBe(0);
    solve(p, "add-10", 1, 9);
    expect(goldTotal(p)).toBe(0);
    const last = questionsFor("add-10", 27)[9]!;
    expect(answerQuestion(p, "add-10", 1, last.answer)).toMatchObject({ chestEarned: true, levelComplete: true, stars: 2 });
    expect(goldTotal(p)).toBe(1000);
    expect(answerQuestion(p, "add-10", 1, last.answer)).toBeNull();
    expect(goldTotal(p)).toBe(1000);
  });
  it("keeps reward credit when switching operators midway through a level", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    expect(solve(p, "divide-1", 1, 1)).toMatchObject({ chestEarned: true, levelComplete: false });
    expect(chestCount(p)).toBe(1);
    expect(bankGold(p)).toEqual([0, 0, 0, 1000]);
    expect(trackFor(p, "add-10").runs[1]!.solved).toBe(9);
    expect(trackFor(p, "divide-1").runs[1]!.solved).toBe(1);
  });
  it("saves unfinished voyages and preserves the sailing game's save", () => {
    const s = storage(), p = freshProgress();
    solve(p, "subtract-deep", 1, 4);
    p.pack = "subtract-deep"; p.operator = "subtract";
    expect(saveMathProgress(p, s)).toBe(true);
    expect(s.data.get("broadside.v1")).toBe('{"relics":[1,2]}');
    const loaded = readMathProgress(s);
    expect(loaded).toEqual(p);
    const run = startVoyage(loaded, "subtract-deep", 1, 999)!;
    expect(run.seed).toBe(27);
    expect(run.solved).toBe(4);
    expect(questionsFor("subtract-deep", run.seed)[run.solved]).toEqual(questionsFor("subtract-deep", 27)[4]);
  });
  it("unlocks sequentially, preserves best stars on replay, and continues beyond authored levels", () => {
    const p = freshProgress();
    expect(startVoyage(p, "add-10", 2, 1)).toBeNull();
    expect(startVoyage(p, "unknown", 1, 1)).toBeNull();
    solve(p, "add-10", 1);
    startVoyage(p, "add-10", 1, 27);
    answerQuestion(p, "add-10", 1, 999);
    solve(p, "add-10", 1);
    expect(trackFor(p, "add-10").stars[1]).toBe(3);
    expect(goldTotal(p)).toBe(2000);
    const track = trackFor(p, "add-10");
    track.cleared = 1_000_000;
    expect(startVoyage(p, "add-10", 1_000_001, 789)?.level).toBe(1_000_001);
    solve(p, "add-10", 1_000_001);
    expect(track.cleared).toBe(1_000_001);
  });
  it("ignores malformed saves, impossible runs, and unrelated keys", () => {
    const s = storage();
    s.setItem(SAVE_KEY, "invalid");
    expect(readMathProgress(s)).toEqual(freshProgress());
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: -5, pack: "bad", tracks: {
      "add-10": { cleared: 1, stars: { "1": 3, "2": 3, "-1": 3 }, runs: { "2": { level: 2, seed: 7, solved: 4, mistakes: 0 }, "3": { level: 3, seed: 7, solved: 15, mistakes: 0 } } },
      "bad": { cleared: 999 },
    } }));
    const p = readMathProgress(s);
    expect(p.solved).toBe(0);
    expect(p.tracks["bad"]).toBeUndefined();
    expect(p.tracks["add-10"]!.stars).toEqual({ "1": 3 });
    expect(Object.keys(p.tracks["add-10"]!.runs)).toEqual(["2"]);
    expect(saveMathProgress(p, { setItem: () => { throw Error("full"); } })).toBe(false);
    expect(readMathProgress({ getItem: () => { throw Error("blocked"); } })).toEqual(freshProgress());
  });
  it("keeps unlimited gold in separate operator banks and upgrades older math saves", () => {
    const p = freshProgress(), s = storage();
    for (let level = 1; level <= 25; level++) solve(p, "add-10", level);
    solve(p, "multiply-1", 1);
    expect(goldTotal(p)).toBe(26000);
    expect(bankGold(p)).toEqual([25000, 0, 1000, 0]);
    saveMathProgress(p, s);
    expect(readMathProgress(s).banks).toEqual(p.banks);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 250, operator: "divide", pack: "divide-1" }));
    expect(bankGold(readMathProgress(s))).toEqual([0, 0, 0, 25000]);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 10, banks: { add: -1, subtract: 8, multiply: 0, divide: 0 } }));
    expect(bankGold(readMathProgress(s))).toEqual([1000, 0, 0, 0]);
  });
});
