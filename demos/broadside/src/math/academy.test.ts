import { describe, expect, it } from "vitest";
import { PACKS, SAVE_KEY, answerQuestion, bankGold, bankedGold, cargoGold, chestCount, deliverMathChest, freshProgress, goldTotal, pendingMathChests, questionsFor, readMathProgress, saveMathProgress, startVoyage, trackFor } from "./academy";

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
  it("removes zero addition and gives larger, crossing-ten sums more practice", () => {
    for (const p of PACKS.filter((p) => p.operator === "add")) {
      const sample = Array.from({ length: 500 }, (_, seed) => questionsFor(p.id, seed)).flat();
      expect(sample.every((q) => q.left > 0 && q.right > 0)).toBe(true);
      expect(sample.filter((q) => q.answer > p.limit! / 2).length / sample.length).toBeGreaterThan(0.8);
      if (p.limit! > 10) {
        expect(sample.filter((q) => q.left % 10 + q.right % 10 >= 10).length / sample.length).toBeGreaterThan(0.5);
      }
    }
  });
  it("caps easy identities at one review and avoids reversed copies of the same fact", () => {
    for (const p of PACKS) for (let seed = 0; seed < 100; seed++) {
      const questions = questionsFor(p.id, seed);
      const easy = questions.filter((q) => {
        if (q.operator === "add" || q.operator === "multiply") return Math.min(q.left, q.right) <= 1;
        if (q.operator === "subtract") return q.right === 1 || q.answer === 0;
        return q.right === 1 || q.answer === 1;
      });
      expect(easy.length).toBeLessThanOrEqual(1);
      const facts = questions.map((q) => q.operator === "add" || q.operator === "multiply"
        ? `${Math.min(q.left, q.right)}:${Math.max(q.left, q.right)}` : `${q.left}:${q.right}`);
      expect(new Set(facts).size).toBe(10);
    }
  });
  it("prioritizes sixes to nines in the mixed multiplication and division islands", () => {
    for (const id of ["multiply-5", "divide-5"]) {
      const sample = Array.from({ length: 500 }, (_, seed) => questionsFor(id, seed)).flat();
      const challenging = sample.filter((q) => {
        const factors = q.operator === "multiply" ? [q.left, q.right] : [q.right, q.answer];
        return factors.some((n) => [6, 7, 8, 9].includes(n));
      });
      expect(challenging.length / sample.length).toBeGreaterThan(0.7);
    }
  });
  it("retains the original seeded sequence for saved question sets", () => {
    expect(questionsFor("add-10", 27, 1).map((q) => [q.left, q.right])).toEqual([
      [0, 5], [0, 2], [2, 7], [0, 4], [3, 3], [3, 2], [2, 4], [0, 3], [2, 5], [7, 1],
    ]);
    for (const p of PACKS) for (let seed = 0; seed < 25; seed++) {
      const old = questionsFor(p.id, seed, 1);
      expect(old).toHaveLength(10);
      expect(old).toEqual(questionsFor(p.id, seed, 1));
      expect(new Set(old.map((q) => `${q.left}:${q.right}`)).size).toBe(10);
    }
  });
});

describe("endless voyages, rewards and isolated saves", () => {
  const storage = () => {
    const data = new Map<string, string>([["broadside.v1", '{"relics":[1,2]}']]);
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  };
  const solve = (p: ReturnType<typeof freshProgress>, pack: string, level: number, count = 10) => {
    const run = startVoyage(p, pack, level, 27)!;
    const questions = questionsFor(pack, run.seed, run.questionSet);
    let result;
    for (let i = 0; i < count; i++) result = answerQuestion(p, pack, level, questions[run.solved]!.answer);
    return result;
  };
  it("forfeits the entire level reward after one wrong answer but still unlocks the next level", () => {
    const p = freshProgress();
    startVoyage(p, "add-10", 1, 27);
    const q = questionsFor("add-10", 27)[0]!;
    expect(answerQuestion(p, "add-10", 1, q.answer + 1)?.correct).toBe(false);
    expect(p.solved).toBe(0);
    expect(trackFor(p, "add-10").runs[1]!.solved).toBe(0);
    expect(solve(p, "add-10", 1)).toMatchObject({ chestEarned: false, levelComplete: true, stars: 2 });
    expect(goldTotal(p)).toBe(0);
    expect(chestCount(p)).toBe(0);
    expect(trackFor(p, "add-10").cleared).toBe(1);
    expect(answerQuestion(p, "add-10", 1, q.answer)).toBeNull();
    expect(solve(p, "add-10", 2)).toMatchObject({ chestEarned: true, levelComplete: true, stars: 3 });
    expect(goldTotal(p)).toBe(100);
  });
  it("requires a whole perfect level, even when switching operators", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    expect(solve(p, "divide-1", 1, 1)).toMatchObject({ chestEarned: false, levelComplete: false });
    expect(chestCount(p)).toBe(0);
    expect(solve(p, "divide-1", 1, 9)).toMatchObject({ chestEarned: true, levelComplete: true });
    expect(bankGold(p)).toEqual([0, 0, 0, 0]);
    expect(pendingMathChests(p)).toMatchObject([{ operator: "divide", gold: 100 }]);
    expect(solve(p, "add-10", 1, 1)?.chestEarned).toBe(true);
    expect(pendingMathChests(p)).toMatchObject([{ operator: "divide", gold: 100 }, { operator: "add", gold: 100 }]);
    expect(cargoGold(p)).toBe(200);
  });
  it("persists forfeiture across reloads and switching islands without taking banked gold", () => {
    const s = storage(), p = freshProgress();
    solve(p, "add-10", 1);
    deliverMathChest(p, pendingMathChests(p)[0]!.id);
    solve(p, "add-10", 2, 4);
    answerQuestion(p, "add-10", 2, 999);
    saveMathProgress(p, s);
    const loaded = readMathProgress(s);
    solve(loaded, "multiply-1", 1);
    expect(solve(loaded, "add-10", 2, 6)).toMatchObject({ chestEarned: false, levelComplete: true });
    expect(bankGold(loaded)).toEqual([100, 0, 0, 0]);
    expect(cargoGold(loaded)).toBe(100);
    expect(loaded.solved).toBe(30);
    saveMathProgress(loaded, s);
    expect(readMathProgress(s)).toEqual(loaded);
  });
  it("forfeits gold even when the only mistake is on the final question", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    answerQuestion(p, "add-10", 1, 999);
    expect(solve(p, "add-10", 1, 1)?.chestEarned).toBe(false);
    expect(goldTotal(p)).toBe(0);
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
    expect(run.questionSet).toBe(2);
    expect(questionsFor("subtract-deep", run.seed, run.questionSet)[run.solved]).toEqual(questionsFor("subtract-deep", 27)[4]);
  });
  it("keeps an old unfinished voyage's question and switches new voyages to the improved mix", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 3, pack: "add-10", tracks: {
      "add-10": { cleared: 0, stars: {}, runs: { "1": { level: 1, seed: 27, solved: 3, mistakes: 0 } } },
    } }));
    const p = readMathProgress(s), run = startVoyage(p, "add-10", 1, 999)!;
    expect(run.questionSet).toBe(1);
    expect(questionsFor("add-10", run.seed, run.questionSet)[run.solved]).toMatchObject({ left: 0, right: 4, answer: 4 });
    expect(answerQuestion(p, "add-10", 1, 4)?.correct).toBe(true);
    saveMathProgress(p, s);
    expect(readMathProgress(s)).toEqual(p);
    solve(p, "add-10", 1, 6);
    expect(startVoyage(p, "add-10", 2, 27)?.questionSet).toBe(2);
    expect(questionsFor("add-10", 27)[0]).not.toEqual(questionsFor("add-10", 27, 1)[0]);
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
    expect(goldTotal(p)).toBe(100);
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
    expect(goldTotal(p)).toBe(2600);
    expect(bankedGold(p)).toBe(0);
    expect(pendingMathChests(p)).toHaveLength(26);
    for (const chest of pendingMathChests(p)) expect(deliverMathChest(p, chest.id)).toBe(true);
    expect(bankGold(p)).toEqual([2500, 0, 100, 0]);
    saveMathProgress(p, s);
    expect(readMathProgress(s).banks).toEqual(p.banks);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 250, operator: "divide", pack: "divide-1" }));
    expect(bankGold(readMathProgress(s))).toEqual([0, 0, 0, 25000]);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 30, banks: { add: 1, subtract: 0, multiply: 2, divide: 0 } }));
    const migrated = readMathProgress(s);
    expect(bankGold(migrated)).toEqual([1000, 0, 2000, 0]);
    expect(chestCount(migrated)).toBe(3);
    solve(migrated, "add-10", 1);
    expect(goldTotal(migrated)).toBe(3100);
    saveMathProgress(migrated, s);
    expect(readMathProgress(s)).toEqual(migrated);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 10, banks: { add: -1, subtract: 8, multiply: 0, divide: 0 } }));
    expect(bankGold(readMathProgress(s))).toEqual([1000, 0, 0, 0]);
  });
  it("keeps each earned chest aboard until its individual pour is delivered, including across reloads", () => {
    const s = storage(), p = freshProgress();
    solve(p, "add-10", 1);
    solve(p, "multiply-1", 1);
    solve(p, "add-10", 2);
    expect(pendingMathChests(p).map((chest) => chest.id)).toEqual([1, 2, 3]);
    expect(goldTotal(p)).toBe(300);
    expect(bankGold(p)).toEqual([0, 0, 0, 0]);
    saveMathProgress(p, s);
    const midway = readMathProgress(s);
    expect(deliverMathChest(midway, 1)).toBe(true);
    expect(deliverMathChest(midway, 1)).toBe(false);
    expect(deliverMathChest(midway, 999)).toBe(false);
    expect(pendingMathChests(midway).map((chest) => chest.id)).toEqual([2, 3]);
    expect(bankGold(midway)).toEqual([100, 0, 0, 0]);
    expect(goldTotal(midway)).toBe(300);
    saveMathProgress(midway, s);
    const resumed = readMathProgress(s);
    expect(deliverMathChest(resumed, 1)).toBe(false);
    expect(deliverMathChest(resumed, 2)).toBe(true);
    expect(deliverMathChest(resumed, 3)).toBe(true);
    expect(pendingMathChests(resumed)).toEqual([]);
    expect(bankGold(resumed)).toEqual([200, 0, 100, 0]);
    expect(goldTotal(resumed)).toBe(300);
    expect(chestCount(resumed)).toBe(3);
  });
  it("keeps v2 banked gold in the cave and assigns new cargo IDs after old chests", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 2, solved: 30, chests: 3,
      banks: { add: 1000, subtract: 0, multiply: 100, divide: 0 } }));
    const p = readMathProgress(s);
    expect(p.version).toBe(3);
    expect(bankGold(p)).toEqual([1000, 0, 100, 0]);
    expect(pendingMathChests(p)).toEqual([]);
    solve(p, "divide-1", 1);
    expect(pendingMathChests(p)).toEqual([{ id: 4, operator: "divide", gold: 100, delivered: false }]);
    expect(bankedGold(p)).toBe(1100);
    expect(goldTotal(p)).toBe(1200);
    saveMathProgress(p, s);
    expect(readMathProgress(s)).toEqual(p);
  });
  it("ignores malformed or duplicate cargo without creating new gold on reload", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 3, chests: 0, banks: { add: 0, subtract: 0, multiply: 0, divide: 0 }, cargo: [
      { id: 5, operator: "add", gold: 100, delivered: false },
      { id: 5, operator: "add", gold: 100, delivered: false },
      { id: 6, operator: "unknown", gold: 100, delivered: false },
      { id: 7, operator: "divide", gold: 1000, delivered: false },
      { id: -1, operator: "add", gold: 100, delivered: false },
    ] }));
    const p = readMathProgress(s);
    expect(pendingMathChests(p)).toHaveLength(1);
    expect(goldTotal(p)).toBe(100);
    solve(p, "add-10", 1);
    expect(pendingMathChests(p).map((chest) => chest.id)).toEqual([5, 6]);
    expect(deliverMathChest(p, 5)).toBe(true);
    saveMathProgress(p, s);
    expect(goldTotal(readMathProgress(s))).toBe(200);
  });
});
