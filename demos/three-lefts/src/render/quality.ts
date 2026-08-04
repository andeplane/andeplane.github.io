/**
 * Adaptive quality.
 *
 * This game is fragment-bound in a way an ordinary scene is not. A frame draws
 * the same rooms several times over — fourteen cell draws on The House,
 * seventeen in The Orangery, each a full forward pass — onto a half-float
 * target with 4× MSAA. On a high-DPI display that target is four times the
 * pixels again, and 4× MSAA on top of a 2× device pixel ratio is largely paying
 * twice for the same edges.
 *
 * Rather than pick a number that is wrong on every machine except the one it
 * was measured on, the renderer measures itself and climbs down a ladder until
 * frames fit in the budget. Resolution goes first because it is the cheapest
 * thing to give up and the hardest to notice; portal recursion depth goes last,
 * because rooms flattening to darkness two doorways away is a visible change to
 * what the house *is*, and P4 says anything that reads as a glitch costs more
 * than it saves.
 */

import { clamp } from '../core/util'

export interface Rung {
  /** Multiplier on the render target resolution. */
  scale: number
  /**
   * MSAA sample count on the scene target.
   *
   * This matters more than it looks. The target is half-float, so at 4× it
   * costs 32 bytes per pixel, and a frame is bandwidth-bound long before it is
   * geometry-bound — 115 draw calls and 23k triangles is nothing, but 14 cell
   * draws across a 200 MB framebuffer is not.
   */
  samples: number
  /** Portal recursion depth. */
  depth: number
  /** Solid-angle threshold below which a portal is filled flat, not recursed. */
  cull: number
  label: string
}

const LADDER: Rung[] = [
  { scale: 1.0, samples: 4, depth: 3, cull: 0.0025, label: 'full' },
  { scale: 0.85, samples: 4, depth: 3, cull: 0.0035, label: 'high' },
  { scale: 0.72, samples: 2, depth: 3, cull: 0.005, label: 'medium' },
  { scale: 0.72, samples: 2, depth: 2, cull: 0.008, label: 'low' },
  { scale: 0.6, samples: 2, depth: 2, cull: 0.012, label: 'lower' },
  { scale: 0.5, samples: 2, depth: 2, cull: 0.018, label: 'minimum' },
]

/**
 * Thresholds are multiples of the *display's own* refresh period, not of 1/60.
 *
 * This matters more than it sounds, and the first version of this file got it
 * wrong. Under vsync a perfectly healthy frame delta is exactly the refresh
 * interval — 16.7 ms on a 60 Hz panel — so a fixed "faster than 13.7 ms means
 * we have headroom" test can never pass, and the controller becomes a one-way
 * ratchet that walks the quality down and never brings it back.
 *
 * The refresh period is learned as the fastest frame we have seen, which the
 * menu establishes for free before any level is loaded.
 */
const TOO_SLOW = 1.35
const FAST_ENOUGH = 1.12

const STORE_KEY = 'three-lefts.quality'

export class Quality {
  /** −1 means automatic; otherwise a pinned rung index. */
  private pinned: number
  private index = 0
  private ema = 1 / 60
  private refresh = 1 / 60
  private cooldown = 1.5
  /** Seconds since the last upward step, for the backoff below. */
  private sinceUp = Infinity
  /** Grows each time a step up immediately had to be undone. */
  private upDelay = 6

  constructor(devicePixelRatio: number) {
    this.pinned = loadPinned()
    if (this.pinned >= 0) {
      this.index = this.pinned
    } else if (devicePixelRatio > 1.5) {
      // Start well down the ladder on a high-DPI display. 4× MSAA on top of a
      // 2× device pixel ratio pays twice for the same edges, and this is a
      // fill-bound renderer — better to open smooth and climb up within a few
      // seconds than to open stuttering and claw back.
      this.index = 2
    }
  }

  get rung(): Rung {
    return LADDER[this.index]
  }

  get auto(): boolean {
    return this.pinned < 0
  }

  get label(): string {
    return this.auto ? `auto — ${this.rung.label}` : `${this.rung.label} (pinned)`
  }

  /** Smoothed frame rate, for the instruments panel. */
  get fps(): number {
    return 1 / Math.max(1e-4, this.ema)
  }

  /** The display period we believe we are working against, in Hz. */
  get refreshHz(): number {
    return 1 / Math.max(1e-4, this.refresh)
  }

  /**
   * Feed it the frame delta. Returns true when the rung changed and the caller
   * must resize its render targets.
   */
  update(dt: number, active: boolean): boolean {
    // A tab switch or a shader compile is not evidence about steady-state cost.
    const sample = Math.min(dt, 0.1)
    this.ema += (sample - this.ema) * 0.06

    // Learn the display period: any faster frame pulls it down at once, and it
    // drifts up very slowly so a changed refresh rate is eventually picked up.
    this.refresh = clamp(Math.min(sample, this.refresh * 1.0002), 1 / 240, 1 / 30)

    this.sinceUp += dt
    // Samples are always taken — the menu is what teaches us the refresh rate —
    // but the rung only moves while a level is actually being drawn.
    if (!this.auto || !active) return false
    this.cooldown -= dt
    if (this.cooldown > 0) return false

    if (this.ema > this.refresh * TOO_SLOW && this.index < LADDER.length - 1) {
      // If we only just stepped up, that step is what broke it: wait longer
      // before trying again, and keep doubling if it keeps failing.
      if (this.sinceUp < 6) this.upDelay = Math.min(this.upDelay * 2, 120)
      this.index++
      this.cooldown = 1.2
      this.sinceUp = Infinity
      return true
    }
    if (this.ema < this.refresh * FAST_ENOUGH && this.index > 0 && this.sinceUp > this.upDelay) {
      this.index--
      this.cooldown = 1.5
      this.sinceUp = 0
      return true
    }
    return false
  }

  /** Cycles auto → full → … → minimum → auto. Returns the new label. */
  cycle(): string {
    this.pinned = this.pinned < 0 ? 0 : this.pinned + 1
    if (this.pinned >= LADDER.length) this.pinned = -1
    if (this.pinned >= 0) this.index = this.pinned
    this.cooldown = 1.5
    this.sinceUp = Infinity
    try {
      localStorage.setItem(STORE_KEY, String(this.pinned))
    } catch {
      /* private browsing; the setting just will not persist */
    }
    return this.label
  }
}

function loadPinned(): number {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw === null) return -1
    const n = Number(raw)
    return Number.isInteger(n) && n >= -1 && n < LADDER.length ? n : -1
  } catch {
    return -1
  }
}
