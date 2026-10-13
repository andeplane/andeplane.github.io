/**
 * A 2D camera over the machine hall with smooth, very deep zoom: from ~30 000 valves
 * across the screen down to a single valve filling it (a 10⁷ zoom range).
 * `scale` is world units (valves) per CSS pixel. Flights use the van Wijk–Nuij
 * "smooth and efficient zooming and panning" path, which zooms out just enough to keep
 * the journey legible.
 */
export interface View {
  cx: number
  cy: number
  scale: number
}

export class Camera {
  cx = 0
  cy = 0
  scale = 1
  minScale = 1 / 800
  maxScale = 64
  private target: View | null = null
  private flight: { from: View; to: View; t0: number; dur: number; path: (s: number) => View } | null = null
  private vx = 0
  private vy = 0
  private anchor: { wx: number; wy: number; sx: number; sy: number } | null = null

  get view(): View {
    return { cx: this.cx, cy: this.cy, scale: this.scale }
  }

  set(v: View): void {
    this.cx = v.cx
    this.cy = v.cy
    this.scale = this.clampScale(v.scale)
    this.target = null
    this.flight = null
    this.anchor = null
  }

  private clampScale(s: number): number {
    return Math.min(this.maxScale, Math.max(this.minScale, s))
  }

  /** Zoom by factor around a screen point (CSS px from the canvas centre). */
  zoomAt(factor: number, sx: number, sy: number, smooth = true): void {
    const base = this.target ?? this.view
    const ns = this.clampScale(base.scale * factor)
    const wx = base.cx + sx * base.scale
    const wy = base.cy + sy * base.scale
    const next = { cx: wx - sx * ns, cy: wy - sy * ns, scale: ns }
    this.flight = null
    this.anchor = { wx, wy, sx, sy }
    if (smooth) this.target = next
    else this.set(next)
  }

  panBy(dx: number, dy: number): void {
    this.flight = null
    if (this.target && this.anchor) {
      // keep easing the zoom, but let the drag move the anchor with the hand
      this.anchor.sx += dx
      this.anchor.sy += dy
      this.target.cx -= dx * this.target.scale
      this.target.cy -= dy * this.target.scale
      return
    }
    this.target = null
    this.cx -= dx * this.scale
    this.cy -= dy * this.scale
  }

  fling(vx: number, vy: number): void {
    this.vx = vx
    this.vy = vy
  }

  stopFling(): void {
    this.vx = 0
    this.vy = 0
  }

  flying(): boolean {
    return !!this.flight
  }

  /** Fly along the van Wijk–Nuij optimal path; `width` is the viewport width in px. */
  flyTo(to: View, width: number, durationScale = 1): void {
    const from = this.view
    to = { ...to, scale: this.clampScale(to.scale) }
    const rho = 1.4
    const w0 = from.scale * width
    const w1 = to.scale * width
    const dx = to.cx - from.cx
    const dy = to.cy - from.cy
    const u1 = Math.hypot(dx, dy)
    let S: number
    let path: (s: number) => View
    if (u1 < 1e-9 * Math.max(w0, w1)) {
      const k = Math.log(w1 / w0) / rho
      S = Math.abs(k)
      path = (s) => {
        const t = S === 0 ? 1 : s / S
        return { cx: from.cx + dx * t, cy: from.cy + dy * t, scale: (w0 * Math.exp(rho * k * t)) / width }
      }
    } else {
      const b = (i: number) => {
        const wi = i === 0 ? w0 : w1
        const sign = i === 0 ? 1 : -1
        return (w1 * w1 - w0 * w0 + sign * rho ** 4 * u1 * u1) / (2 * wi * rho * rho * u1)
      }
      const r = (i: number) => Math.log(-b(i) + Math.sqrt(b(i) * b(i) + 1))
      const r0 = r(0)
      const r1 = r(1)
      S = (r1 - r0) / rho
      path = (s) => {
        const u = (w0 / (rho * rho)) * Math.cosh(r0) * Math.tanh(rho * s + r0) - (w0 / (rho * rho)) * Math.sinh(r0)
        const w = (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0)
        const t = u / u1
        return { cx: from.cx + dx * t, cy: from.cy + dy * t, scale: w / width }
      }
    }
    const dur = Math.min(9000, Math.max(700, 900 * S * durationScale))
    this.target = null
    this.flight = { from, to, t0: performance.now(), dur, path: (s) => path(s * S) }
  }

  /** Advance animations; returns true while moving. */
  update(dtMs: number): boolean {
    const now = performance.now()
    if (this.flight) {
      const f = this.flight
      let t = (now - f.t0) / f.dur
      if (t >= 1) {
        this.set(f.to)
        return true
      }
      t = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const v = f.path(t)
      this.cx = v.cx
      this.cy = v.cy
      this.scale = v.scale
      return true
    }
    let moving = false
    if (this.target) {
      const k = 1 - Math.exp(-dtMs / 90)
      const ls = Math.log(this.scale)
      const lt = Math.log(this.target.scale)
      const nls = ls + (lt - ls) * k
      this.scale = Math.exp(nls)
      if (this.anchor) {
        // keep the world point under the cursor fixed while the scale eases
        this.cx = this.anchor.wx - this.anchor.sx * this.scale
        this.cy = this.anchor.wy - this.anchor.sy * this.scale
      } else {
        this.cx += (this.target.cx - this.cx) * k
        this.cy += (this.target.cy - this.cy) * k
      }
      if (Math.abs(nls - lt) < 1e-4 && Math.abs(this.target.cx - this.cx) < this.scale * 0.1) {
        this.set(this.target)
      }
      moving = true
    }
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.01) {
      this.cx -= this.vx * this.scale * (dtMs / 16)
      this.cy -= this.vy * this.scale * (dtMs / 16)
      const damp = Math.exp(-dtMs / 160)
      this.vx *= damp
      this.vy *= damp
      moving = true
    }
    return moving
  }
}
