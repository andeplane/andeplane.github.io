import { readFileSync } from "node:fs";
import { currentView, decodeReplay, parseSession } from "../src/replay.ts";
import { legalMoves, score, solveRound } from "../src/engine.ts";

const input = process.argv[2];
if (!input)
  throw new Error("Provide a shared replay URL or a downloaded JSON log");
const session = /^https?:|^#replay=/.test(input)
  ? await decodeReplay(input)
  : parseSession(JSON.parse(readFileSync(input, "utf8")));
const view = currentView(session);
console.log(
  JSON.stringify(
    {
      seed: view.board.seed,
      gameIndex: view.board.gameIndex,
      cursor: session.data.cursor,
      activeLineMoves: view.step,
      loggedActions: session.data.nodes.length,
      foundations: score(view.board),
      bestThisRound: score(solveRound(view.board)),
      state: view.board,
      legalMoves: legalMoves(view.board),
      history: session.data.nodes.map((node, index) => ({
        id: index + 1,
        parent: node.parent,
        actor: node.actor,
        action: node.action,
        description: session.views[index + 1].message,
      })),
    },
    null,
    2,
  ),
);
