import { loadGoldLayout, saveGoldLayout } from "./game/goldLayout";
import { readGoldReserve, saveGoldReserve } from "./game/goldReserve";
import type { PosePersistence } from "./types";

/** Keeps existing IndexedDB/cache keys byte compatible; currency never lives here. */
export function coinPosePersistence(namespace: string, persistent = true): PosePersistence {
  if (!namespace) throw new Error("A game coin-pose namespace is required");
  return {
    namespace,
    load: (area, count, balance) => loadGoldLayout(area, count, persistent, namespace, balance),
    save: (area, poses, balance) => saveGoldLayout(area, poses, persistent, namespace, balance),
    readReserve: (area, balance) => readGoldReserve(area, balance, persistent, namespace),
    saveReserve: (area, balance, reserve) => saveGoldReserve(area, balance, reserve, persistent, namespace),
  };
}
