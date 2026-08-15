// Onboarding hints. Two kinds:
// - fire(): one-shot toasts, shown once for a few seconds. Their timer stops
//   while an overlay covers them (a hint that expires behind a modal never
//   taught anyone anything).
// - sticky(): condition-driven nudges that stay up until the condition
//   clears — used for "you have money and land but no towers".

export class Hints {
  private parent: HTMLElement
  private fired = new Set<string>()
  private el: HTMLDivElement | null = null
  private hideAt = 0
  private lastNow = 0
  private stickyEl: HTMLDivElement | null = null
  private stickyKey = ''

  constructor(parent: HTMLElement) {
    this.parent = parent
  }

  fire(key: string, text: string, now: number): void {
    if (this.fired.has(key)) return
    this.fired.add(key)
    if (this.el) this.el.remove()
    this.el = document.createElement('div')
    this.el.className = 'hint'
    this.el.textContent = text
    this.parent.appendChild(this.el)
    this.hideAt = now + 5000
  }

  // Shown while `active`; removed the moment it isn't. One-shot toasts win
  // the slot when both want it.
  sticky(key: string, text: string, active: boolean): void {
    if (!active || this.el) {
      if (this.stickyEl && (this.stickyKey === key || !active)) {
        this.stickyEl.remove()
        this.stickyEl = null
        this.stickyKey = ''
      }
      return
    }
    if (this.stickyKey === key) return
    if (this.stickyEl) this.stickyEl.remove()
    this.stickyEl = document.createElement('div')
    this.stickyEl.className = 'hint hint-sticky'
    this.stickyEl.textContent = text
    this.parent.appendChild(this.stickyEl)
    this.stickyKey = key
  }

  update(now: number, covered: boolean): void {
    if (this.el) {
      // Freeze the countdown while an overlay covers the hint.
      if (covered) this.hideAt += now - this.lastNow
      if (now > this.hideAt) {
        this.el.remove()
        this.el = null
      }
    }
    if (this.stickyEl) {
      this.stickyEl.style.visibility = covered ? 'hidden' : 'visible'
    }
    this.lastNow = now
  }

  reset(): void {
    this.fired.clear()
    if (this.el) {
      this.el.remove()
      this.el = null
    }
    if (this.stickyEl) {
      this.stickyEl.remove()
      this.stickyEl = null
      this.stickyKey = ''
    }
  }
}
