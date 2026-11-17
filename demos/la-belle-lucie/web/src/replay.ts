import {
  applyMove,
  cloneBoard,
  describeMove,
  newGame,
  score,
  validateBoard,
  type Board,
  type Move,
} from "./engine";

export type ReplayAction =
  | { kind: "move"; move: Move }
  | { kind: "deal"; board: Board };
export interface ReplayNode {
  parent: number;
  actor: "player" | "computer";
  action: ReplayAction;
}
export interface ReplayData {
  version: 1;
  initial: Board;
  nodes: ReplayNode[];
  cursor: number;
}
export interface ReplayView {
  board: Board;
  roundStart: Board;
  step: number;
  message: string;
}
export interface ReplaySession {
  data: ReplayData;
  views: ReplayView[];
}

export const STORAGE_KEY = "ingrids-solitaire-replay-v1";
const maximumBytes = 2_000_000;
const maximumNodes = 10_000;
const maximumHashLength = 100_000;
const initialMessage = "Initial deal. Try your own moves, or use Next move.";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid replay object");
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error("Invalid replay number");
  return value;
}
function readBoard(value: unknown): Board {
  const source = record(value);
  if (
    typeof source.seed !== "string" ||
    !/^\d{1,20}$/.test(source.seed) ||
    BigInt(source.seed) > (1n << 64n) - 1n
  )
    throw new Error("Invalid replay seed");
  if (
    !Array.isArray(source.foundations) ||
    source.foundations.length !== 4 ||
    !Array.isArray(source.piles) ||
    source.piles.length > 52
  )
    throw new Error("Invalid replay layout");
  const board: Board = {
    seed: source.seed,
    gameIndex: integer(source.gameIndex, 0, Number.MAX_SAFE_INTEGER),
    round: integer(source.round, 1, 3),
    foundations: source.foundations.map((rank) => integer(rank, 0, 13)),
    piles: source.piles.map((pile) => {
      if (!Array.isArray(pile) || pile.length > 52)
        throw new Error("Invalid replay pile");
      return pile.map((card) => integer(card, 0, 51));
    }),
  };
  validateBoard(board);
  return board;
}
function validateFreshDeal(board: Board): void {
  if (
    !board.piles.length ||
    board.piles.some(
      (pile, index) =>
        pile.length !== Math.min(3, 52 - score(board) - index * 3),
    )
  )
    throw new Error("Invalid recorded deal order");
}
function nextView(previous: ReplayView, action: ReplayAction): ReplayView {
  if (action.kind === "move") {
    return {
      board: applyMove(previous.board, action.move),
      roundStart: previous.roundStart,
      step: previous.step + 1,
      message: describeMove(previous.board, action.move),
    };
  }
  const board = cloneBoard(action.board);
  if (
    score(previous.board) === 52 ||
    board.round !== previous.board.round + 1 ||
    board.seed !== previous.board.seed ||
    board.gameIndex !== previous.board.gameIndex ||
    board.foundations.some(
      (rank, suit) => rank !== previous.board.foundations[suit],
    )
  )
    throw new Error("Invalid recorded redeal");
  validateBoard(board);
  validateFreshDeal(board);
  return {
    board,
    roundStart: board,
    step: previous.step + 1,
    message: `Round ${board.round}: remaining cards shuffled into piles of three. Foundations kept.`,
  };
}

export function createSession(initial: Board = newGame()): ReplaySession {
  validateBoard(initial);
  const board = cloneBoard(initial);
  return {
    data: { version: 1, initial: board, nodes: [], cursor: 0 },
    views: [{ board, roundStart: board, step: 0, message: initialMessage }],
  };
}
export function currentView(session: ReplaySession): ReplayView {
  return session.views[session.data.cursor];
}
export function parentCursor(session: ReplaySession): number {
  return session.data.cursor
    ? session.data.nodes[session.data.cursor - 1].parent
    : 0;
}
export function nextCursor(session: ReplaySession): number | undefined {
  for (let index = session.data.nodes.length - 1; index >= 0; index--)
    if (session.data.nodes[index].parent === session.data.cursor)
      return index + 1;
  return undefined;
}
export function seekSession(
  session: ReplaySession,
  cursor: number,
): ReplaySession {
  integer(cursor, 0, session.data.nodes.length);
  return { ...session, data: { ...session.data, cursor } };
}
export function appendAction(
  session: ReplaySession,
  action: ReplayAction,
  actor: ReplayNode["actor"],
): ReplaySession {
  const node = { parent: session.data.cursor, actor, action };
  const view = nextView(currentView(session), action);
  const nodes = [...session.data.nodes, node];
  return {
    data: { ...session.data, nodes, cursor: nodes.length },
    views: [...session.views, view],
  };
}

export function parseSession(value: unknown): ReplaySession {
  const source = record(value);
  if (
    source.version !== 1 ||
    !Array.isArray(source.nodes) ||
    source.nodes.length > maximumNodes
  )
    throw new Error("Unsupported or oversized replay");
  const initial = readBoard(source.initial);
  if (initial.round !== 1 || score(initial) !== 0)
    throw new Error("Replay must include its initial deal");
  validateFreshDeal(initial);
  const session = createSession(initial);
  for (let index = 0; index < source.nodes.length; index++) {
    const raw = record(source.nodes[index]);
    const parent = integer(raw.parent, 0, index);
    if (raw.actor !== "player" && raw.actor !== "computer")
      throw new Error("Invalid replay actor");
    const rawAction = record(raw.action);
    let action: ReplayAction;
    if (rawAction.kind === "move") {
      const move = record(rawAction.move);
      action = {
        kind: "move",
        move: {
          card: integer(move.card, 0, 51),
          destination: integer(move.destination, -1, 51),
        },
      };
    } else if (rawAction.kind === "deal")
      action = { kind: "deal", board: readBoard(rawAction.board) };
    else throw new Error("Invalid replay action");
    const view = nextView(session.views[parent], action);
    session.data.nodes.push({ parent, actor: raw.actor, action });
    session.views.push(view);
  }
  session.data.cursor = integer(source.cursor, 0, session.data.nodes.length);
  return session;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeBase64(value: string): Uint8Array {
  if (
    !value ||
    value.length > maximumHashLength ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new Error("Invalid shared replay");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export async function encodeReplay(session: ReplaySession): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(session.data));
  if (bytes.length > maximumBytes)
    throw new Error(
      "Replay is too large for a link. Download the log instead.",
    );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes.buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const encoded = base64url(compressed);
  if (encoded.length > maximumHashLength)
    throw new Error(
      "Replay is too large for a link. Download the log instead.",
    );
  return `#replay=v1.${encoded}`;
}
export async function decodeReplay(input: string): Promise<ReplaySession> {
  const hash = /^https?:/.test(input) ? new URL(input).hash : input;
  if (!hash.startsWith("#replay=v1."))
    throw new Error("Unsupported shared replay");
  const bytes = decodeBase64(hash.slice("#replay=v1.".length));
  const reader = new Blob([bytes.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Shared replay is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const decoded = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    decoded.set(chunk, offset);
    offset += chunk.length;
  }
  return parseSession(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
  );
}
