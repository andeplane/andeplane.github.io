import { describe, expect, it } from "vitest";
import { CargoQueue } from "../shared/pirate-world/game/cargoQueue";

describe("shared ship-to-cave delivery sequence", () => {
  it("keeps the active chest until its deposit completes and rejects duplicate or out-of-order completion", () => {
    const queue = new CargoQueue<number>();
    queue.reset([3, -1, 7]);
    expect(queue.current).toBe(3);
    expect(queue.complete(-1)).toBe(false);
    expect(queue.pending).toEqual([3, -1, 7]);
    expect(queue.complete(3)).toBe(true);
    expect(queue.complete(3)).toBe(false);
    expect(queue.current).toBe(-1);
    expect(queue.completed).toBe(1);
    expect(queue.total).toBe(3);
    expect(queue.complete(-1)).toBe(true);
    expect(queue.complete(7)).toBe(true);
    expect(queue.current).toBeNull();
    expect(queue.pending).toEqual([]);
  });

  it("restarts from the ledger's remaining cargo after leaving or reloading", () => {
    const queue = new CargoQueue<{ id: number; gold: number }>();
    const cargo = [{ id: 1, gold: 100 }, { id: 2, gold: 100 }];
    queue.reset(cargo);
    expect(queue.complete(cargo[0]!)).toBe(true);
    queue.reset(cargo.slice(1));
    expect(queue.current).toBe(cargo[1]);
    expect(queue.total).toBe(1);
    expect(queue.completed).toBe(0);
  });
});
