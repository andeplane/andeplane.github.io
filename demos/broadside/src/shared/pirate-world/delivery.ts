import { CargoQueue } from "./game/cargoQueue";
import type { Cargo, PirateAdapter, TreasureState } from "./types";

/** Transaction cursor: cancellation never commits; a stale completion never advances. */
export class Delivery {
  readonly queue = new CargoQueue<Cargo>();
  private generation = 0;
  constructor(private adapter: PirateAdapter) {}
  start(): number {
    this.cancel();
    const state = this.adapter.snapshot();
    const ids = new Set<number>();
    for (const c of state.pending) {
      if (ids.has(c.id) || !Number.isSafeInteger(c.id) || !Number.isSafeInteger(c.gold) || c.gold <= 0 || c.gold > 1000 ||
          !Number.isSafeInteger(c.area) || c.area < 0 || c.area >= state.bankGold.length)
        throw new Error("Invalid treasure cargo");
      ids.add(c.id);
    }
    this.queue.reset(state.pending.map(c=>({...c})));
    return this.generation;
  }
  cancel(): void { this.generation++; this.queue.reset([]); }
  get token(): number { return this.generation; }
  get current(): Cargo | null { return this.queue.current; }
  preview(): TreasureState {
    const state = this.adapter.snapshot(), current = this.current;
    if (!current) return state;
    const bankGold = [...state.bankGold];
    bankGold[current.area] = bankGold[current.area]! + current.gold;
    return { ...state, bankGold };
  }
  complete(token: number, id: number): boolean {
    const current = this.current;
    if (token !== this.generation || !current || current.id !== id) return false;
    // The adapter owns idempotency and persistence. Refusal leaves this cargo retryable.
    if (!this.adapter.deliver(id)) throw new Error("The chest could not be saved. Return and try again.");
    this.queue.complete(current);
    return true;
  }
}
