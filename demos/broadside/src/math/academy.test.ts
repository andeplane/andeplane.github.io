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
  it("upgrades even explicit legacy addition requests to the positive practice mix", () => {
    for (const p of PACKS.filter((p) => p.operator === "add")) for (let seed = 0; seed < 500; seed++) {
      const questions = questionsFor(p.id, seed, 1);
      expect(questions).toEqual(questionsFor(p.id, seed, 2));
      expect(questions.every((q) => q.left > 0 && q.right > 0 && q.answer <= p.limit!)).toBe(true);
    }
  });
  it("retains the original seeded sequence for non-addition saved question sets", () => {
    for (const p of PACKS.filter((p) => p.operator !== "add")) for (let seed = 0; seed < 25; seed++) {
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
  it("earns 100 immediately for a first-try answer and never deducts it for guesses on the next problem", () => {
    const p = freshProgress();
    const run = startVoyage(p, "add-10", 1, 27)!;
    const questions = questionsFor("add-10", run.seed, run.questionSet);
    expect(answerQuestion(p, "add-10", 1, questions[0]!.answer)).toMatchObject({ goldEarned: 100, levelGold: 100 });
    expect(goldTotal(p)).toBe(100);
    expect(bankGold(p)).toEqual([0, 0, 0, 0]);
    expect(pendingMathChests(p)).toEqual([]);
    expect(answerQuestion(p, "add-10", 1, 999)).toMatchObject({ correct: false, goldEarned: 0, questionGoldLost: 100, levelGold: 100 });
    for (let guess = 0; guess < 5; guess++) {
      expect(answerQuestion(p, "add-10", 1, 999)).toMatchObject({ correct: false, questionGoldLost: 0, levelGold: 100 });
      expect(goldTotal(p)).toBe(100);
    }
    expect(answerQuestion(p, "add-10", 1, questions[1]!.answer)).toMatchObject({ correct: true, goldEarned: 0, levelGold: 100 });
    expect(run.problemMistakes).toBe(0);
    expect(answerQuestion(p, "add-10", 1, questions[2]!.answer)).toMatchObject({ goldEarned: 100, levelGold: 200 });
    expect(goldTotal(p)).toBe(200);
  });
  it("packs ten first-try answers into a single 1,000-gold chest without double-counting unfinished earnings", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    expect(goldTotal(p)).toBe(900);
    expect(cargoGold(p)).toBe(0);
    expect(solve(p, "add-10", 1, 1)).toMatchObject({ goldEarned: 100, chestEarned: true, levelGold: 1000 });
    expect(goldTotal(p)).toBe(1000);
    expect(pendingMathChests(p)).toEqual([{ id: 1, operator: "add", gold: 1000, delivered: false }]);
    expect(trackFor(p, "add-10").runs[1]).toBeUndefined();
  });
  it("does not create an empty chest when every problem was guessed", () => {
    const p = freshProgress();
    const run = startVoyage(p, "add-10", 1, 27)!;
    const questions = questionsFor("add-10", run.seed, run.questionSet);
    let result;
    for (const question of questions) {
      expect(answerQuestion(p, "add-10", 1, 999)?.questionGoldLost).toBe(100);
      result = answerQuestion(p, "add-10", 1, question.answer);
      expect(result?.goldEarned).toBe(0);
    }
    expect(result).toMatchObject({ levelComplete: true, chestEarned: false, levelGold: 0 });
    expect(goldTotal(p)).toBe(0);
    expect(chestCount(p)).toBe(0);
    expect(pendingMathChests(p)).toEqual([]);
    expect(startVoyage(p, "add-10", 2, 12)?.level).toBe(2);
  });
  it("forfeits only the mistaken problem and still earns 900 gold for the other nine", () => {
    const p = freshProgress();
    startVoyage(p, "add-10", 1, 27);
    const q = questionsFor("add-10", 27)[0]!;
    expect(answerQuestion(p, "add-10", 1, q.answer + 1)?.correct).toBe(false);
    expect(p.solved).toBe(0);
    expect(trackFor(p, "add-10").runs[1]!.solved).toBe(0);
    expect(solve(p, "add-10", 1)).toMatchObject({ chestEarned: true, levelComplete: true, stars: 2, levelGold: 900 });
    expect(goldTotal(p)).toBe(900);
    expect(chestCount(p)).toBe(1);
    expect(trackFor(p, "add-10").cleared).toBe(1);
    expect(answerQuestion(p, "add-10", 1, q.answer)).toBeNull();
    expect(solve(p, "add-10", 2)).toMatchObject({ chestEarned: true, levelComplete: true, stars: 3 });
    expect(goldTotal(p)).toBe(1900);
  });
  it("collects per-problem earnings into separate level chests when switching operators", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    expect(solve(p, "divide-1", 1, 1)).toMatchObject({ chestEarned: false, levelComplete: false });
    expect(chestCount(p)).toBe(0);
    expect(solve(p, "divide-1", 1, 9)).toMatchObject({ chestEarned: true, levelComplete: true });
    expect(bankGold(p)).toEqual([0, 0, 0, 0]);
    expect(pendingMathChests(p)).toMatchObject([{ operator: "divide", gold: 1000 }]);
    expect(solve(p, "add-10", 1, 1)?.chestEarned).toBe(true);
    expect(pendingMathChests(p)).toMatchObject([{ operator: "divide", gold: 1000 }, { operator: "add", gold: 1000 }]);
    expect(cargoGold(p)).toBe(2000);
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
    expect(solve(loaded, "add-10", 2, 6)).toMatchObject({ chestEarned: true, levelComplete: true, levelGold: 900 });
    expect(bankGold(loaded)).toEqual([1000, 0, 0, 0]);
    expect(cargoGold(loaded)).toBe(1900);
    expect(loaded.solved).toBe(30);
    saveMathProgress(loaded, s);
    expect(readMathProgress(s)).toEqual(loaded);
  });
  it("keeps the first nine rewards when the only mistake is on the final question", () => {
    const p = freshProgress();
    solve(p, "add-10", 1, 9);
    answerQuestion(p, "add-10", 1, 999);
    expect(solve(p, "add-10", 1, 1)).toMatchObject({ chestEarned: true, goldEarned: 0, levelGold: 900 });
    expect(goldTotal(p)).toBe(900);
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
  it("upgrades an unfinished legacy addition level without resetting its position or gold", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 153, pack: "add-10", tracks: {
      "add-10": { cleared: 15, stars: { "15": 3 }, runs: { "16": { level: 16, seed: 27, solved: 3, mistakes: 1 } } },
    } }));
    const p = readMathProgress(s), run = startVoyage(p, "add-10", 16, 999)!;
    expect(run).toEqual({ level: 16, seed: 27, solved: 3, mistakes: 1, problemMistakes: 1, earnedGold: 0, questionSet: 2 });
    const remaining = questionsFor("add-10", run.seed, run.questionSet).slice(run.solved);
    expect(remaining.every((q) => q.left > 0 && q.right > 0)).toBe(true);
    expect(answerQuestion(p, "add-10", 16, remaining[0]!.answer)?.correct).toBe(true);
    expect(goldTotal(p)).toBe(15000);
    saveMathProgress(p, s);
    expect(readMathProgress(s)).toEqual(p);
    expect(solve(p, "add-10", 16, 6)).toMatchObject({ chestEarned: true, levelComplete: true, levelGold: 600 });
    expect(startVoyage(p, "add-10", 17, 27)?.questionSet).toBe(2);
    expect(goldTotal(p)).toBe(15600);
  });
  it("migrates legacy addition runs in every save version while keeping pending cargo and penalties", () => {
    for (const version of [1, 2, 3]) {
      const s = storage();
      s.setItem(SAVE_KEY, JSON.stringify({ version, solved: 12, chests: 2,
        banks: { add: version === 1 ? 1 : 1000, subtract: 0, multiply: 0, divide: 0 },
        cargo: [{ id: 2, operator: "multiply", gold: 100, delivered: false }],
        tracks: { "add-10": { cleared: 1, stars: { "1": 3 }, runs: {
          "2": { level: 2, seed: 27, solved: 2, mistakes: 3, questionSet: 1 },
        } } },
      }));
      const p = readMathProgress(s);
      expect(trackFor(p, "add-10").runs[2]).toEqual({ level: 2, seed: 27, solved: 2, mistakes: 3, problemMistakes: 1, earnedGold: 0, questionSet: 2 });
      expect(p.solved).toBe(12);
      expect(bankedGold(p)).toBe(1000);
      expect(cargoGold(p)).toBe(version === 3 ? 1000 : 0);
      saveMathProgress(p, s);
      expect(readMathProgress(s)).toEqual(p);
    }
  });
  it("upgrades a legacy addition run already held in memory when it is resumed", () => {
    const p = freshProgress();
    trackFor(p, "add-10").runs[1] = { level: 1, seed: 27, solved: 2, mistakes: 1, problemMistakes: 1, earnedGold: 0, questionSet: 1 };
    const run = startVoyage(p, "add-10", 1, 999)!;
    expect(run).toEqual({ level: 1, seed: 27, solved: 2, mistakes: 1, problemMistakes: 1, earnedGold: 0, questionSet: 2 });
    expect(questionsFor("add-10", run.seed, run.questionSet).every((q) => q.left > 0 && q.right > 0)).toBe(true);
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
    expect(goldTotal(p)).toBe(1900);
    const track = trackFor(p, "add-10");
    track.cleared = 1_000_000;
    expect(startVoyage(p, "add-10", 1_000_001, 789)?.level).toBe(1_000_001);
    solve(p, "add-10", 1_000_001);
    expect(track.cleared).toBe(1_000_001);
  });
  it("keeps every pack going beyond page boundaries without raising its difficulty", () => {
    for (const pack of PACKS) for (const cleared of [11, 12, 23, 24, 1_000_000]) {
      const p = freshProgress();
      const track = trackFor(p, pack.id);
      track.cleared = cleared;
      const level = cleared + 1;
      const run = startVoyage(p, pack.id, level, level * 17)!;
      expect(run.level).toBe(level);
      const questions = questionsFor(pack.id, run.seed, run.questionSet);
      for (const q of questions) {
        if (pack.operator === "add") expect(q.left + q.right).toBeLessThanOrEqual(pack.limit!);
        if (pack.operator === "subtract") {
          expect(q.left).toBeLessThanOrEqual(pack.limit!);
          expect(q.answer).toBeGreaterThanOrEqual(0);
        }
        if (pack.operator === "multiply") expect(pack.tables).toContain(q.left);
        if (pack.operator === "divide") expect(pack.tables).toContain(q.right);
        answerQuestion(p, pack.id, level, q.answer);
      }
      expect(track.cleared).toBe(level);
      expect(startVoyage(p, pack.id, level + 1, level * 31)?.level).toBe(level + 1);
      expect(Object.keys(p.tracks)).toEqual([pack.id]);
      expect(pendingMathChests(p)).toMatchObject([{ operator: pack.operator, gold: 1000 }]);
    }
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
    expect(bankedGold(p)).toBe(0);
    expect(pendingMathChests(p)).toHaveLength(26);
    for (const chest of pendingMathChests(p)) expect(deliverMathChest(p, chest.id)).toBe(true);
    expect(bankGold(p)).toEqual([25000, 0, 1000, 0]);
    saveMathProgress(p, s);
    expect(readMathProgress(s).banks).toEqual(p.banks);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 250, operator: "divide", pack: "divide-1" }));
    expect(bankGold(readMathProgress(s))).toEqual([0, 0, 0, 25000]);
    s.setItem(SAVE_KEY, JSON.stringify({ version: 1, solved: 30, banks: { add: 1, subtract: 0, multiply: 2, divide: 0 } }));
    const migrated = readMathProgress(s);
    expect(bankGold(migrated)).toEqual([1000, 0, 2000, 0]);
    expect(chestCount(migrated)).toBe(3);
    solve(migrated, "add-10", 1);
    expect(goldTotal(migrated)).toBe(4000);
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
    expect(goldTotal(p)).toBe(3000);
    expect(bankGold(p)).toEqual([0, 0, 0, 0]);
    saveMathProgress(p, s);
    const midway = readMathProgress(s);
    expect(deliverMathChest(midway, 1)).toBe(true);
    expect(deliverMathChest(midway, 1)).toBe(false);
    expect(deliverMathChest(midway, 999)).toBe(false);
    expect(pendingMathChests(midway).map((chest) => chest.id)).toEqual([2, 3]);
    expect(bankGold(midway)).toEqual([1000, 0, 0, 0]);
    expect(goldTotal(midway)).toBe(3000);
    saveMathProgress(midway, s);
    const resumed = readMathProgress(s);
    expect(deliverMathChest(resumed, 1)).toBe(false);
    expect(deliverMathChest(resumed, 2)).toBe(true);
    expect(deliverMathChest(resumed, 3)).toBe(true);
    expect(pendingMathChests(resumed)).toEqual([]);
    expect(bankGold(resumed)).toEqual([2000, 0, 1000, 0]);
    expect(goldTotal(resumed)).toBe(3000);
    expect(chestCount(resumed)).toBe(3);
  });
  it("keeps v2 banked gold in the cave and assigns new cargo IDs after old chests", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 2, solved: 30, chests: 3,
      banks: { add: 1000, subtract: 0, multiply: 100, divide: 0 } }));
    const p = readMathProgress(s);
    expect(p.version).toBe(4);
    expect(bankGold(p)).toEqual([1000, 0, 100, 0]);
    expect(pendingMathChests(p)).toEqual([]);
    solve(p, "divide-1", 1);
    expect(pendingMathChests(p)).toEqual([{ id: 4, operator: "divide", gold: 1000, delivered: false }]);
    expect(bankedGold(p)).toBe(1100);
    expect(goldTotal(p)).toBe(2100);
    saveMathProgress(p, s);
    expect(readMathProgress(s)).toEqual(p);
  });
  it("repairs old pending perfect-level rewards beside new variable-value chests through delivery and reload", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 3, solved: 10, chests: 1,
      banks: { add: 15000, subtract: 0, multiply: 0, divide: 0 },
      cargo: [{ id: 1, operator: "add", gold: 100, delivered: false }],
    }));
    const p = readMathProgress(s);
    startVoyage(p, "add-10", 1, 27);
    answerQuestion(p, "add-10", 1, 999);
    expect(solve(p, "add-10", 1)?.levelGold).toBe(900);
    expect(pendingMathChests(p).map((chest) => chest.gold)).toEqual([1000, 900]);
    saveMathProgress(p, s);
    const loaded = readMathProgress(s);
    expect(loaded).toEqual(p);
    expect(deliverMathChest(loaded, 1)).toBe(true);
    expect(deliverMathChest(loaded, 2)).toBe(true);
    expect(deliverMathChest(loaded, 2)).toBe(false);
    expect(bankedGold(loaded)).toBe(16900);
    expect(goldTotal(loaded)).toBe(16900);
    saveMathProgress(loaded, s);
    expect(readMathProgress(s)).toEqual(loaded);
  });
  it("repairs the phone save's pending 100-gold perfect level once without changing its 15,000 banked gold", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 3, solved: 162, chests: 16, operator: "add", pack: "add-10",
      banks: { add: 14000, subtract: 0, multiply: 0, divide: 1000 },
      cargo: [{ id: 16, operator: "add", gold: 100, delivered: false }],
      tracks: { "add-20": { cleared: 5, stars: { "5": 1 }, runs: {
        "6": { level: 6, seed: 2570235178, solved: 2, mistakes: 0, questionSet: 2 },
      } } },
    }));
    const repaired = readMathProgress(s);
    expect(repaired.version).toBe(4);
    expect(repaired.banks).toEqual({ add: 14000, subtract: 0, multiply: 0, divide: 1000 });
    expect(pendingMathChests(repaired)).toEqual([{ id: 16, operator: "add", gold: 1000, delivered: false }]);
    expect(repaired.solved).toBe(162);
    expect(repaired.chests).toBe(16);
    expect(trackFor(repaired, "add-20").runs[6]).toMatchObject({ solved: 2, earnedGold: 0, problemMistakes: 0 });
    expect(goldTotal(repaired)).toBe(16000);
    saveMathProgress(repaired, s);
    const reloaded = readMathProgress(s);
    expect(reloaded).toEqual(repaired);
    expect(deliverMathChest(reloaded, 16)).toBe(true);
    expect(deliverMathChest(reloaded, 16)).toBe(false);
    expect(bankedGold(reloaded)).toBe(16000);
    saveMathProgress(reloaded, s);
    expect(readMathProgress(s)).toEqual(reloaded);
  });
  it("does not reinterpret delivered v3 records or legitimate 100-gold v4 rewards", () => {
    const s = storage();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 3, chests: 16,
      banks: { add: 15100, subtract: 0, multiply: 0, divide: 0 },
      cargo: [{ id: 15, operator: "add", gold: 100, delivered: true }],
    }));
    const old = readMathProgress(s);
    expect(old.cargo).toEqual([{ id: 15, operator: "add", gold: 100, delivered: true }]);
    expect(bankedGold(old)).toBe(15100);
    s.setItem(SAVE_KEY, JSON.stringify({ ...freshProgress(), chests: 1,
      cargo: [{ id: 1, operator: "add", gold: 100, delivered: false }],
    }));
    const current = readMathProgress(s);
    expect(cargoGold(current)).toBe(100);
    saveMathProgress(current, s);
    expect(cargoGold(readMathProgress(s))).toBe(100);
  });
  it("keeps the current problem's lost reward and previous first-try earnings across reloads", () => {
    const s = storage(), p = freshProgress();
    const run = startVoyage(p, "add-10", 1, 27)!;
    const questions = questionsFor("add-10", run.seed, run.questionSet);
    answerQuestion(p, "add-10", 1, questions[0]!.answer);
    answerQuestion(p, "add-10", 1, 999);
    saveMathProgress(p, s);
    const loaded = readMathProgress(s), resumed = startVoyage(loaded, "add-10", 1, 999)!;
    expect(resumed).toMatchObject({ solved: 1, problemMistakes: 1, earnedGold: 100 });
    expect(goldTotal(loaded)).toBe(100);
    expect(answerQuestion(loaded, "add-10", 1, 999)?.questionGoldLost).toBe(0);
    expect(answerQuestion(loaded, "add-10", 1, questions[1]!.answer)?.goldEarned).toBe(0);
    expect(solve(loaded, "add-10", 1, 8)?.levelGold).toBe(900);
    expect(pendingMathChests(loaded)).toMatchObject([{ gold: 900 }]);
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
    expect(goldTotal(p)).toBe(1000);
    solve(p, "add-10", 1);
    expect(pendingMathChests(p).map((chest) => chest.id)).toEqual([5, 6]);
    expect(deliverMathChest(p, 5)).toBe(true);
    saveMathProgress(p, s);
    expect(goldTotal(readMathProgress(s))).toBe(2000);
  });
});
