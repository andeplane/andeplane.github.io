import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyMove, newGame, solveRound, score } from "../src/engine.ts";

test("a real mistake loses fifteen reachable foundation cards; returning restores the ideal", () => {
  const initial = newGame("20261111", 11);
  const ideal = score(solveRound(initial));
  const mistake = applyMove(initial, { card: 9, destination: 10 });
  assert.equal(ideal, 50);
  assert.equal(score(solveRound(mistake)), 35);
  assert.equal(ideal - score(solveRound(mistake)), 15);
  const secondMistake = applyMove(mistake, { card: 20, destination: 21 });
  assert.equal(score(solveRound(secondMistake)), 13);
  assert.equal(ideal - score(solveRound(secondMistake)), 37);
  assert.equal(score(solveRound(initial)), 50);
  const preserved = applyMove(initial, { card: 0, destination: -1 });
  assert.equal(score(solveRound(preserved)), ideal);
});

test("all 52 classic vector faces have exact standard poker proportions and correct identities", () => {
  const directory = fileURLToPath(new URL("../public/cards/", import.meta.url));
  const files = readdirSync(directory).filter((file) => file.endsWith(".svg"));
  assert.equal(files.length, 52);
  for (const suit of ["C", "D", "H", "S"])
    for (const rank of [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ]) {
      const source = readFileSync(`${directory}${suit}-${rank}.svg`, "utf8");
      const viewBox = source
        .match(/<svg[^>]*viewBox="([^"]+)"/)![1]
        .split(/\s+/)
        .map(Number);
      assert.equal(viewBox[2] / viewBox[3], 5 / 7);
      assert(source.includes(`face="${rank === "10" ? "T" : rank}${suit}"`));
      assert(!/<script\b|<foreignObject\b|(?:href|src)="https?:/i.test(source));
    }
});
