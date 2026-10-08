/** Maps the 16 × 10 world (x ∈ [−8, 8], y ∈ [0, 10]) onto the stage, letterboxed. */
export class View {
  w = 1;
  h = 1;
  dpr = 1;
  /** CSS pixels per world unit. */
  s = 1;
  /** CSS pixel position of the world origin. */
  ox = 0;
  oy = 0;

  fit(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.s = Math.min(w / 16.4, h / 10.3);
    this.ox = w / 2;
    this.oy = h / 2 + 5 * this.s;
  }

  px(x: number): number {
    return this.ox + x * this.s;
  }
  py(y: number): number {
    return this.oy - y * this.s;
  }
  /** World extents covered by the whole stage. */
  get left(): number {
    return -this.ox / this.s;
  }
  get right(): number {
    return (this.w - this.ox) / this.s;
  }
  get top(): number {
    return this.oy / this.s;
  }
  get bottom(): number {
    return (this.oy - this.h) / this.s;
  }

  /** Put a 2D context into world coordinates (y up) at device resolution. */
  world(ctx: CanvasRenderingContext2D): void {
    const k = this.dpr * this.s;
    ctx.setTransform(k, 0, 0, -k, this.dpr * this.ox, this.dpr * this.oy);
  }
  /** Device-pixel transform (for text). */
  device(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
