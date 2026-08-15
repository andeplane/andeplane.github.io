// Fixed-timestep accumulator: the sim always advances in exact TICK_MS steps
// regardless of display refresh rate (CFL-constrained LBM cannot take variable
// dt). Catch-up is clamped so a background tab doesn't spiral.

export const TICK_MS = 1000 / 60

export class FixedStep {
  private accumulator = 0
  private readonly maxTicksPerFrame: number

  constructor(maxTicksPerFrame = 5) {
    this.maxTicksPerFrame = maxTicksPerFrame
  }

  /** Feed a frame's delta; calls tick() 0..maxTicksPerFrame times. */
  advance(deltaMs: number, tick: () => void): void {
    this.accumulator += Math.min(deltaMs, 250)
    let ticks = 0
    while (this.accumulator >= TICK_MS && ticks < this.maxTicksPerFrame) {
      tick()
      this.accumulator -= TICK_MS
      ticks++
    }
    if (ticks === this.maxTicksPerFrame && this.accumulator >= TICK_MS) {
      // Too far behind — drop the debt rather than death-spiral.
      this.accumulator = 0
    }
  }
}
