import { useEffect, useRef, useState } from "react";
import { score, type Board, type Solution } from "./engine";

const keyOf = (board: Board) =>
  JSON.stringify([board.round, board.piles, board.foundations]);

// Analysis has its own worker so a stale result can never become a played move.
// Cache keys describe visible positions, not request timing or future shuffles.
export function useRoundAnalysis(
  board: Board,
  roundStart: Board,
  previous: Board | undefined,
  enabled: boolean,
) {
  const cache = useRef(new Map<string, Solution>());
  const pending = useRef(new Map<number, string>());
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const [, rerender] = useState(0);
  const [error, setError] = useState("");
  const currentKey = keyOf(board),
    idealKey = keyOf(roundStart),
    previousKey = previous ? keyOf(previous) : "";

  useEffect(() => {
    const instance = new Worker(
      new URL("./solver.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{ id: number; solution?: Solution; error?: string }>,
    ) => {
      const key = pending.current.get(event.data.id);
      if (!key) return;
      pending.current.delete(event.data.id);
      if (event.data.solution) cache.current.set(key, event.data.solution);
      else setError(event.data.error ?? "Evaluation unavailable.");
      rerender((value) => value + 1);
    };
    instance.onerror = () =>
      setError("Evaluation unavailable. You can still play manually.");
    return () => {
      instance.terminate();
      pending.current.clear();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !worker.current) return;
    setError("");
    for (const position of [roundStart, board, previous]) {
      if (!position) continue;
      const key = keyOf(position);
      if (cache.current.has(key) || [...pending.current.values()].includes(key))
        continue;
      const id = ++nextId.current;
      pending.current.set(id, key);
      worker.current.postMessage({ id, board: position });
    }
  }, [enabled, currentKey, idealKey, previousKey]);

  const solution = cache.current.get(currentKey),
    ideal = cache.current.get(idealKey);
  const prior = previous ? cache.current.get(previousKey) : undefined;
  const currentBest = solution ? score(solution) : null;
  const idealBest = ideal ? score(ideal) : null;
  const previousBest = prior ? score(prior) : null;
  return {
    ready:
      !enabled || !!error || (!!solution && !!ideal && (!previous || !!prior)),
    error,
    solution,
    idealBest,
    currentBest,
    loss:
      idealBest !== null && currentBest !== null
        ? idealBest - currentBest
        : null,
    moveLoss:
      previousBest !== null && currentBest !== null
        ? previousBest - currentBest
        : null,
  };
}
