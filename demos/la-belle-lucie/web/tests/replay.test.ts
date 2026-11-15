import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendAction,
  createSession,
  currentView,
  decodeReplay,
  encodeReplay,
  nextCursor,
  parentCursor,
  parseSession,
  seekSession,
} from "../src/replay.ts";
import { newGame, redeal, score, solveRound } from "../src/engine.ts";

test("a self-contained URL restores actual card order, every action, and the current position", async () => {
  let session = createSession(newGame("20261111", 11));
  session = appendAction(
    session,
    { kind: "move", move: { card: 0, destination: -1 } },
    "player",
  );
  const encoded = await encodeReplay(session);
  assert(encoded.startsWith("#replay=v1."));
  const restored = await decodeReplay(`https://example.com/?seed=0${encoded}`);
  assert.deepEqual(restored.data, session.data);
  assert.deepEqual(currentView(restored), currentView(session));
  assert.deepEqual(restored.data.initial.piles, newGame("20261111", 11).piles);
  assert.equal(restored.data.nodes[0].actor, "player");
});

test("Back and alternative moves retain both branches in the log and shared URL", async () => {
  let session = createSession(newGame());
  session = appendAction(
    session,
    { kind: "move", move: { card: 9, destination: 10 } },
    "player",
  );
  const mistaken = currentView(session).board;
  session = seekSession(session, parentCursor(session));
  assert.equal(session.data.nodes.length, 1);
  session = appendAction(
    session,
    { kind: "move", move: { card: 0, destination: -1 } },
    "computer",
  );
  assert.equal(session.data.nodes.length, 2);
  assert.equal(session.data.nodes[1].parent, 0);
  assert.deepEqual(currentView(seekSession(session, 1)).board, mistaken);
  assert.equal(nextCursor(seekSession(session, 0)), 2);
  session = seekSession(session, 1);
  const restored = await decodeReplay(await encodeReplay(session));
  assert.equal(restored.data.cursor, 1);
  assert.equal(restored.data.nodes.length, 2);
  assert.deepEqual(currentView(restored).board, mistaken);
});

test("recorded redeals retain foundations and the exact resulting layout through replay and Back", async () => {
  let session = createSession(newGame());
  for (const move of solveRound(currentView(session).board).moves)
    session = appendAction(session, { kind: "move", move }, "computer");
  const before = currentView(session).board;
  assert.equal(score(before), 50);
  const dealt = redeal(before);
  session = appendAction(session, { kind: "deal", board: dealt }, "computer");
  assert.deepEqual(currentView(session).roundStart, dealt);
  const restored = await decodeReplay(await encodeReplay(session));
  assert.deepEqual(currentView(restored).board, dealt);
  assert.deepEqual(
    currentView(seekSession(restored, parentCursor(restored))).board,
    before,
  );
  assert.deepEqual(restored.data.nodes.at(-1)!.action, {
    kind: "deal",
    board: dealt,
  });
});

test("invalid, impossible, cyclic and oversized imported logs are rejected", async () => {
  const initial = createSession(newGame()).data;
  assert.throws(() => parseSession({ ...initial, version: 2 }));
  assert.throws(() => parseSession({ ...initial, cursor: 1 }));
  assert.throws(() =>
    parseSession({
      ...initial,
      nodes: [
        {
          parent: 1,
          actor: "player",
          action: { kind: "move", move: { card: 0, destination: -1 } },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseSession({
      ...initial,
      nodes: [
        {
          parent: 0,
          actor: "player",
          action: { kind: "move", move: { card: 2, destination: -1 } },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseSession({
      ...initial,
      initial: { ...initial.initial, piles: [[0, 0]] },
    }),
  );
  assert.throws(() =>
    parseSession({ ...initial, nodes: Array(10001).fill({}) }),
  );
  await assert.rejects(() => decodeReplay("#replay=v1.invalid!"));
  await assert.rejects(() => decodeReplay("#replay=v2.aaaa"));
  await assert.rejects(() => decodeReplay("#replay=v1." + "a".repeat(100001)));
});
