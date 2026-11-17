import { solveRound, type Board } from "./engine";
self.onmessage = (event: MessageEvent<{ id: number; board: Board }>) => {
  try {
    self.postMessage({
      id: event.data.id,
      solution: solveRound(event.data.board),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
