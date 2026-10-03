type Point = { x: number; y: number; startX: number; startY: number };
export type CaveGestureAction =
  | { type: "look"; dx: number; dy: number }
  | { type: "pinch"; ratio: number }
  | { type: "tap"; x: number; y: number };

/** Keeps two-finger gestures from becoming accidental treasure taps. */
export class CaveGesture {
  private pointers = new Map<number, Point>();
  private moved = false;
  private multiple = false;
  private separation = 0;
  down(id: number, x: number, y: number): void {
    if (!this.pointers.size) this.clear();
    this.pointers.set(id, { x, y, startX: x, startY: y });
    if (this.pointers.size > 1) this.multiple = true;
    this.separation = this.span();
  }
  move(id: number, x: number, y: number): CaveGestureAction | null {
    const p = this.pointers.get(id);
    if (!p) return null;
    const dx = x - p.x,
      dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.startX, y - p.startY) > 6) this.moved = true;
    if (this.pointers.size === 2) {
      const next = this.span(),
        previous = this.separation;
      this.separation = next;
      return previous > 10 && next > 10
        ? { type: "pinch", ratio: next / previous }
        : null;
    }
    if (this.multiple || !this.moved) return null;
    return { type: "look", dx, dy };
  }
  up(id: number, x: number, y: number): CaveGestureAction | null {
    const p = this.pointers.get(id);
    if (!p) return null;
    const tap =
      !this.multiple &&
      !this.moved &&
      Math.hypot(x - p.startX, y - p.startY) <= 6;
    this.pointers.delete(id);
    this.separation = this.span();
    return tap ? { type: "tap", x, y } : null;
  }
  cancel(id: number): void {
    this.pointers.delete(id);
    this.multiple = true;
    this.separation = this.span();
  }
  clear(): void {
    this.pointers.clear();
    this.moved = this.multiple = false;
    this.separation = 0;
  }
  private span(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
