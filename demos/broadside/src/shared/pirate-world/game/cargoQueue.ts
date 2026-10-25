/** Shared ship-to-cave sequence. The game ledger persists each completed deposit. */
export class CargoQueue<T> {
  private items: T[] = [];
  private cursor = 0;

  reset(items: readonly T[]): void {
    this.items = [...items];
    this.cursor = 0;
  }

  get current(): T | null { return this.items[this.cursor] ?? null; }
  get pending(): readonly T[] { return this.items.slice(this.cursor); }
  get completed(): number { return this.cursor; }
  get total(): number { return this.items.length; }

  complete(current: T): boolean {
    if (this.current === null || this.current !== current) return false;
    this.cursor++;
    return true;
  }
}
