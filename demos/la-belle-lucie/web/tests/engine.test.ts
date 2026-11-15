import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyMove,
  cloneBoard,
  legalMoves,
  newGame,
  redeal,
  score,
  solveRound,
  validateBoard,
  type Board,
  type Move,
} from "../src/engine.ts";

const nativeEngine = fileURLToPath(
  new URL("../../build/kabal", import.meta.url),
);

// An independent, deliberately direct replay checker. It does not call the
// browser engine's legalMoves or applyMove functions.
function replayIndependently(initial: Board, moves: Move[]): Board {
  const board = cloneBoard(initial);
  for (const move of moves) {
    const source = board.piles.findIndex((pile) => pile.at(-1) === move.card);
    assert.notEqual(source, -1, "Only the exposed card can be moved");
    if (move.destination === -1) {
      const suit = Math.floor(move.card / 13);
      assert.equal(
        board.foundations[suit],
        move.card % 13,
        "Foundation must be in rank order",
      );
      board.piles[source].pop();
      board.foundations[suit]++;
    } else {
      const target = board.piles.findIndex(
        (pile) => pile.at(-1) === move.destination,
      );
      assert.notEqual(
        target,
        -1,
        "Target must be an exposed card, never an empty pile",
      );
      assert.notEqual(target, source);
      assert.equal(
        Math.floor(move.card / 13),
        Math.floor(move.destination / 13),
      );
      assert.equal(move.destination % 13, (move.card % 13) + 1);
      board.piles[source].pop();
      board.piles[target].push(move.card);
    }
    const allCards = board.piles.flat();
    for (let suit = 0; suit < 4; suit++)
      for (let rank = 0; rank < board.foundations[suit]; rank++)
        allCards.push(suit * 13 + rank);
    assert.equal(allCards.length, 52);
    assert.equal(
      new Set(allCards).size,
      52,
      "No card can disappear or appear twice",
    );
  }
  return board;
}

test("same seed and game reproduce exact deals", () => {
  assert.deepEqual(newGame("20261111", 11), newGame("20261111", 11));
  assert.notDeepEqual(
    newGame("20261111", 11).piles,
    newGame("20261111", 12).piles,
  );
  const board = newGame();
  validateBoard(board);
  assert.equal(board.piles.length, 18);
  assert.equal(board.piles.at(-1)!.length, 1);
});

test("a built card locks its destination until it goes to its foundation", () => {
  const board: Board = {
    ...newGame(),
    foundations: [2, 13, 13, 13],
    piles: [[4, 5, 6, 7, 8, 9, 10, 11, 12], [3], [2]],
  };
  validateBoard(board);
  const moved = applyMove(board, { card: 2, destination: 3 });
  assert.deepEqual(moved.piles[1], [3, 2]);
  assert(!legalMoves(moved).some((move) => move.card === 3));
  assert(
    !legalMoves(moved).some((move) => move.card === 2 && move.destination >= 0),
  );
  assert(
    legalMoves(moved).some(
      (move) => move.card === 2 && move.destination === -1,
    ),
  );
  const cleared = applyMove(moved, { card: 2, destination: -1 });
  assert(
    legalMoves(cleared).some(
      (move) => move.card === 3 && move.destination === -1,
    ),
  );
  assert.throws(() => applyMove(moved, { card: 3, destination: -1 }));
});

test("browser and native million-run engine agree on 100 complete games", () => {
  const nativeReport = JSON.parse(
    execFileSync(
      nativeEngine,
      ["simulate", "--games", "100", "--threads", "1", "--seed", "20261111"],
      { encoding: "utf8" },
    ),
  );
  const histogram = Array(53).fill(0);
  const rounds = Array.from({ length: 3 }, () => Array(53).fill(0));
  for (let index = 0; index < 100; index++) {
    let board = newGame("20261111", index);
    for (let round = 0; round < 3; round++) {
      if (score(board) < 52) {
        const solution = solveRound(board);
        const independentlyReplayed = replayIndependently(
          board,
          solution.moves,
        );
        for (const move of solution.moves) board = applyMove(board, move);
        assert.deepEqual(board, independentlyReplayed);
        assert.deepEqual(board.foundations, solution.foundations);
        assert.equal(
          solveRound(board).moves.length,
          0,
          "Maximum score ends the round without a useless tail",
        );
      }
      rounds[round][score(board)]++;
      if (round < 2 && score(board) < 52) board = redeal(board);
    }
    histogram[score(board)]++;
  }
  assert.deepEqual(histogram, nativeReport.finalHistogram);
  rounds.forEach((histogram, index) =>
    assert.deepEqual(histogram, nativeReport.rounds[index].cumulativeHistogram),
  );
});

test("winning example is a legal full replay with retained foundations", () => {
  let board = newGame("20261111", 11);
  const roundScores: number[] = [];
  for (;;) {
    const solution = solveRound(board);
    board = replayIndependently(board, solution.moves);
    roundScores.push(score(board));
    if (score(board) === 52 || board.round === 3) break;
    const previousFoundations = [...board.foundations];
    const next = redeal(board);
    assert.deepEqual(next.foundations, previousFoundations);
    assert.deepEqual(
      redeal(board),
      next,
      "Undo and redeal cannot reroll the shuffle",
    );
    board = next;
  }
  assert.deepEqual(roundScores, [50, 52]);
  assert.throws(() => redeal(board));
});

test("a legal move exposing a permanently blocked king is omitted", () => {
  const board: Board = {
    ...newGame(),
    foundations: [2, 13, 13, 13],
    piles: [[2, 12, 3], [4], [5], [6], [7], [8], [9], [10], [11]],
  };
  validateBoard(board);
  assert(
    legalMoves(board).some((move) => move.card === 3 && move.destination === 4),
  );
  const solution = solveRound(board);
  assert.deepEqual(solution.foundations, board.foundations);
  assert.deepEqual(solution.moves, []);
});

test("reported seed omits four of clubs onto five without losing any progress", () => {
  let board = newGame("1653164152", 0);
  const oldFirstElevenMoves: Move[] = [
    { card: 37, destination: 38 },
    { card: 39, destination: -1 },
    { card: 36, destination: 37 },
    { card: 28, destination: 29 },
    { card: 27, destination: 28 },
    { card: 4, destination: 5 },
    { card: 26, destination: -1 },
    { card: 27, destination: -1 },
    { card: 28, destination: -1 },
    { card: 29, destination: -1 },
    { card: 30, destination: -1 },
  ];
  board = replayIndependently(board, oldFirstElevenMoves);
  assert.deepEqual(board.foundations, [0, 0, 5, 1]);
  const solution = solveRound(board);
  assert.equal(
    solution.foundations.reduce((sum, rank) => sum + rank, 0),
    24,
  );
  assert(
    !solution.moves.some((move) => move.card === 3 && move.destination === 4),
  );
  assert.deepEqual(
    replayIndependently(board, solution.moves).foundations,
    solution.foundations,
  );
});
