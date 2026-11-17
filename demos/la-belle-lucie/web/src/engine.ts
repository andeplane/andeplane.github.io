export interface Move {
  card: number;
  destination: number;
}
export interface Board {
  piles: number[][];
  foundations: number[];
  round: number;
  seed: string;
  gameIndex: number;
}
export interface Solution {
  moves: Move[];
  foundations: number[];
  nodes: number;
  exact: true;
}

const mask = (1n << 64n) - 1n;
class Random {
  constructor(private state: bigint) {
    this.state &= mask;
  }
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & mask;
    let value = this.state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & mask;
    return value ^ (value >> 31n);
  }
  below(limit: number): number {
    const bound = BigInt(limit);
    const threshold = ((1n << 64n) - bound) % bound;
    let value: bigint;
    do {
      value = this.next();
    } while (value < threshold);
    return Number(value % bound);
  }
}

function streamSeed(seed: string, index: number, domain: bigint): bigint {
  return new Random(
    BigInt(seed) ^ ((BigInt(index) * 0xd1342543de82ef95n) & mask) ^ domain,
  ).next();
}

export const score = (board: Pick<Board, "foundations">): number =>
  board.foundations.reduce((a, b) => a + b, 0);
export const cloneBoard = (board: Board): Board => ({
  ...board,
  piles: board.piles.map((pile) => [...pile]),
  foundations: [...board.foundations],
});

export function validateBoard(board: Board): void {
  if (board.round < 1 || board.round > 3 || board.foundations.length !== 4)
    throw new Error("Invalid round or foundations");
  const seen = new Set<number>();
  for (let suit = 0; suit < 4; suit++) {
    const rank = board.foundations[suit];
    if (!Number.isInteger(rank) || rank < 0 || rank > 13)
      throw new Error("Invalid foundation");
    for (let value = 0; value < rank; value++) seen.add(suit * 13 + value);
  }
  for (const pile of board.piles)
    for (const card of pile) {
      if (!Number.isInteger(card) || card < 0 || card >= 52 || seen.has(card))
        throw new Error("Duplicate or invalid card");
      seen.add(card);
    }
  if (seen.size !== 52) throw new Error("Missing card");
}

function deal(
  seed: string,
  gameIndex: number,
  round: number,
  foundations: number[],
): Board {
  const random = new Random(
    streamSeed(seed, gameIndex, 0x6465616c00000000n + BigInt(round - 1)),
  );
  const cards: number[] = [];
  for (let suit = 0; suit < 4; suit++)
    for (let rank = foundations[suit]; rank < 13; rank++)
      cards.push(suit * 13 + rank);
  for (let size = cards.length; size > 1; size--) {
    const target = random.below(size);
    [cards[size - 1], cards[target]] = [cards[target], cards[size - 1]];
  }
  const piles: number[][] = [];
  for (let start = 0; start < cards.length; start += 3)
    piles.push(cards.slice(start, start + 3));
  const board = {
    seed,
    gameIndex,
    round,
    foundations: [...foundations],
    piles,
  };
  validateBoard(board);
  return board;
}

export function newGame(seed = "20261111", gameIndex = 11): Board {
  if (
    !/^\d{1,20}$/.test(seed) ||
    BigInt(seed) > mask ||
    !Number.isSafeInteger(gameIndex) ||
    gameIndex < 0
  )
    throw new Error("Invalid game identifier");
  return deal(seed, gameIndex, 1, [0, 0, 0, 0]);
}

export function legalMoves(board: Board): Move[] {
  const exposed = new Set(
    board.piles.flatMap((pile) => (pile.length ? [pile.at(-1)!] : [])),
  );
  const moves: Move[] = [];
  for (const pile of board.piles) {
    if (!pile.length) continue;
    const card = pile.at(-1)!;
    if (board.foundations[Math.floor(card / 13)] === card % 13)
      moves.push({ card, destination: -1 });
    if (card % 13 < 12 && exposed.has(card + 1))
      moves.push({ card, destination: card + 1 });
  }
  return moves;
}

export function applyMove(board: Board, move: Move): Board {
  if (
    !legalMoves(board).some(
      (candidate) =>
        candidate.card === move.card &&
        candidate.destination === move.destination,
    )
  )
    throw new Error("Illegal move");
  const next = cloneBoard(board);
  const source = next.piles.find((pile) => pile.at(-1) === move.card)!;
  source.pop();
  if (move.destination === -1) next.foundations[Math.floor(move.card / 13)]++;
  else
    next.piles
      .find((pile) => pile.at(-1) === move.destination)!
      .push(move.card);
  validateBoard(next);
  return next;
}

export function redeal(board: Board): Board {
  if (
    board.round === 3 ||
    score(board) === 52 ||
    score(solveRound(board)) > score(board)
  )
    throw new Error("Cannot redeal now");
  return deal(board.seed, board.gameIndex, board.round + 1, board.foundations);
}

// Independent browser port of the exact native visible-deal solver. The worker
// owns search, so manual input and animation never share its mutable state.
interface SearchState {
  beneath: Int8Array;
  tops: Int8Array;
  foundations: number[];
  pileCount: number;
}
function linkedState(board: Board): SearchState {
  const state = {
    beneath: new Int8Array(52).fill(-2),
    tops: new Int8Array(52).fill(-1),
    foundations: [...board.foundations],
    pileCount: board.piles.length,
  };
  board.piles.forEach((pile, index) => {
    let previous = -1;
    for (const card of pile) {
      state.beneath[card] = previous;
      previous = card;
    }
    state.tops[index] = previous;
  });
  return state;
}
const copyState = (state: SearchState): SearchState => ({
  ...state,
  beneath: state.beneath.slice(),
  tops: state.tops.slice(),
  foundations: [...state.foundations],
});
function searchMoves(state: SearchState): Move[] {
  const exposed = new Set(state.tops);
  const moves: Move[] = [];
  for (let pile = 0; pile < state.pileCount; pile++) {
    const card = state.tops[pile];
    if (
      card >= 0 &&
      state.beneath[card] >= 0 &&
      card % 13 < 12 &&
      exposed.has(card + 1)
    )
      moves.push({ card, destination: card + 1 });
  }
  return moves;
}
function moveLinked(state: SearchState, move: Move): void {
  const source = state.tops.indexOf(move.card);
  state.tops[source] = state.beneath[move.card];
  if (move.destination < 0) {
    state.beneath[move.card] = -2;
    state.foundations[Math.floor(move.card / 13)]++;
  } else {
    const destination = state.tops.indexOf(move.destination);
    state.beneath[move.card] = move.destination;
    state.tops[destination] = move.card;
  }
}
function settleFoundations(state: SearchState, path?: Move[]): void {
  let changed: boolean;
  do {
    changed = false;
    for (let pile = 0; pile < state.pileCount; pile++) {
      const card = state.tops[pile];
      if (card >= 0 && state.foundations[Math.floor(card / 13)] === card % 13) {
        const move = { card, destination: -1 };
        moveLinked(state, move);
        path?.push(move);
        changed = true;
      }
    }
  } while (changed);
}
function settleScore(state: SearchState): void {
  for (;;) {
    settleFoundations(state);
    const safe = searchMoves(state).find(
      (move) =>
        state.beneath[move.destination] === -1 ||
        (move.destination % 13 < 12 &&
          state.beneath[move.destination] === move.destination + 1),
    );
    if (!safe) return;
    moveLinked(state, safe);
  }
}
function optimisticFoundations(state: SearchState): number[] {
  const exposed = new Uint8Array(52),
    cleared = new Uint8Array(52),
    founded = new Uint8Array(52);
  const above = new Int8Array(52).fill(-1);
  for (let card = 0; card < 52; card++) {
    if (state.beneath[card] === -2) cleared[card] = founded[card] = 1;
    if (state.beneath[card] >= 0) above[state.beneath[card]] = card;
  }
  let changed: boolean;
  do {
    changed = false;
    for (let card = 0; card < 52; card++) {
      if (!exposed[card] && (above[card] < 0 || cleared[above[card]])) {
        exposed[card] = 1;
        changed = true;
      }
      if (
        !founded[card] &&
        exposed[card] &&
        (card % 13 === 0 || founded[card - 1])
      ) {
        founded[card] = 1;
        changed = true;
      }
      if (
        !cleared[card] &&
        exposed[card] &&
        (founded[card] || (card % 13 < 12 && exposed[card + 1]))
      ) {
        cleared[card] = 1;
        changed = true;
      }
    }
  } while (changed);
  return Array.from({ length: 4 }, (_, suit) => {
    let rank = 0;
    while (rank < 13 && founded[suit * 13 + rank]) rank++;
    return rank;
  });
}
const optimisticScore = (state: SearchState): number =>
  optimisticFoundations(state).reduce((sum, rank) => sum + rank, 0);
const stateKey = (state: SearchState): string =>
  String.fromCharCode(...state.beneath.map((value) => value + 2));

// Every card counted here must relocate before a required card beneath it can
// reach a foundation. Ignoring other dependencies keeps this bound admissible.
function requiredTableauMoves(state: SearchState, target: number[]): number {
  let required = 0;
  for (let card = 0; card < 52; card++) {
    const suit = Math.floor(card / 13),
      rank = card % 13;
    const cardRequired = rank < target[suit];
    for (
      let below = state.beneath[card];
      below >= 0;
      below = state.beneath[below]
    ) {
      const belowSuit = Math.floor(below / 13),
        belowRank = below % 13;
      if (
        belowRank < target[belowSuit] &&
        (!cardRequired || (belowSuit === suit && belowRank < rank))
      ) {
        required++;
        break;
      }
    }
  }
  return required;
}

// A* minimizes tableau moves after the maximum score is proved. Foundation
// closure is free in this pass: every maximum-score solution needs the same
// number of foundation moves. Safe tableau reductions would break this proof.
function shortestMaximumPath(
  initial: SearchState,
  targetScore: number,
): Solution {
  const targets: number[][] = [];
  const target = [...initial.foundations];
  const upper = optimisticFoundations(initial);
  const enumerate = (suit: number, remaining: number): void => {
    if (suit === 4) {
      if (remaining === 0) targets.push([...target]);
      return;
    }
    for (
      let rank = initial.foundations[suit];
      rank <= upper[suit] && rank <= remaining;
      rank++
    ) {
      target[suit] = rank;
      enumerate(suit + 1, remaining - rank);
    }
  };
  enumerate(0, targetScore);
  interface Node {
    state: SearchState;
    parent: number;
    move: Move;
    depth: number;
    estimate: number;
  }
  const nodes: Node[] = [];
  const distance = new Map<string, number>();
  const pending: number[] = [];
  const precedes = (left: number, right: number): boolean =>
    nodes[left].estimate < nodes[right].estimate ||
    (nodes[left].estimate === nodes[right].estimate &&
      (nodes[left].depth > nodes[right].depth ||
        (nodes[left].depth === nodes[right].depth && left < right)));
  const enqueue = (
    state: SearchState,
    parent: number,
    move: Move,
    depth: number,
  ): void => {
    settleFoundations(state);
    const key = stateKey(state);
    if ((distance.get(key) ?? Infinity) <= depth) return;
    const possible = optimisticFoundations(state);
    let lowerBound = Infinity;
    for (const candidate of targets) {
      if (
        candidate.some(
          (rank, suit) =>
            rank < state.foundations[suit] || rank > possible[suit],
        )
      )
        continue;
      lowerBound = Math.min(lowerBound, requiredTableauMoves(state, candidate));
    }
    if (!Number.isFinite(lowerBound)) return;
    distance.set(key, depth);
    const index = nodes.length;
    nodes.push({ state, parent, move, depth, estimate: depth + lowerBound });
    pending.push(index);
    let child = pending.length - 1;
    while (child > 0) {
      const parentIndex = Math.floor((child - 1) / 2);
      if (!precedes(pending[child], pending[parentIndex])) break;
      [pending[child], pending[parentIndex]] = [
        pending[parentIndex],
        pending[child],
      ];
      child = parentIndex;
    }
  };
  const pop = (): number => {
    const first = pending[0],
      last = pending.pop()!;
    if (pending.length) {
      pending[0] = last;
      let parent = 0;
      for (;;) {
        let child = parent * 2 + 1;
        if (child >= pending.length) break;
        if (
          child + 1 < pending.length &&
          precedes(pending[child + 1], pending[child])
        )
          child++;
        if (!precedes(pending[child], pending[parent])) break;
        [pending[child], pending[parent]] = [pending[parent], pending[child]];
        parent = child;
      }
    }
    return first;
  };
  enqueue(copyState(initial), 0, { card: -1, destination: -1 }, 0);
  let expanded = 0;
  while (pending.length) {
    const index = pop(),
      node = nodes[index];
    if (distance.get(stateKey(node.state)) !== node.depth) continue;
    expanded++;
    if (score(node.state) === targetScore) {
      const relocations: Move[] = [];
      for (
        let ancestor = index;
        nodes[ancestor].depth;
        ancestor = nodes[ancestor].parent
      )
        relocations.push(nodes[ancestor].move);
      const replay = copyState(initial),
        moves: Move[] = [];
      settleFoundations(replay, moves);
      for (const move of relocations.reverse()) {
        moveLinked(replay, move);
        moves.push(move);
        settleFoundations(replay, moves);
      }
      return {
        moves,
        foundations: [...replay.foundations],
        nodes: expanded,
        exact: true,
      };
    }
    const moves = searchMoves(node.state).sort(
      (left, right) =>
        (node.state.beneath[left.card] % 13) -
        (node.state.beneath[right.card] % 13),
    );
    for (const move of moves) {
      const next = copyState(node.state);
      moveLinked(next, move);
      enqueue(next, index, move, node.depth + 1);
    }
  }
  throw new Error("Proven round maximum has no solution path");
}

export function solveRound(board: Board): Solution {
  validateBoard(board);
  const initial = linkedState(board);
  const upperBound = optimisticScore(initial);
  const visited = new Set<string>();
  let maximum = score(board);
  let finished = false;
  const visit = (state: SearchState): void => {
    if (finished) return;
    settleScore(state);
    const key = stateKey(state);
    if (visited.has(key)) return;
    visited.add(key);
    const moves = searchMoves(state);
    if (!moves.length) {
      maximum = Math.max(maximum, score(state));
      if (maximum === upperBound) finished = true;
      return;
    }
    if (optimisticScore(state) < maximum) return;
    moves.sort(
      (left, right) =>
        (state.beneath[left.card] % 13) - (state.beneath[right.card] % 13),
    );
    for (const move of moves) {
      const next = copyState(state);
      moveLinked(next, move);
      visit(next);
      if (finished) break;
    }
  };
  visit(copyState(initial));
  const best = shortestMaximumPath(initial, maximum);
  best.nodes += visited.size;
  return best;
}

export const suitNames = ["clubs", "diamonds", "hearts", "spades"];
export const suitSymbols = ["♣", "♦", "♥", "♠"];
export function rankLabel(rank: number): string {
  return ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
    rank
  ];
}
export function cardName(card: number): string {
  return `${rankLabel(card % 13)}${suitSymbols[Math.floor(card / 13)]}`;
}
export function describeMove(board: Board, move: Move): string {
  const source = board.piles.findIndex((pile) => pile.at(-1) === move.card) + 1;
  if (move.destination < 0)
    return `Move ${cardName(move.card)} from pile ${source} to the foundation.`;
  const target =
    board.piles.findIndex((pile) => pile.at(-1) === move.destination) + 1;
  return `Move ${cardName(move.card)} from pile ${source} onto ${cardName(move.destination)} in pile ${target}.`;
}
