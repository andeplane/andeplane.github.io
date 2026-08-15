// State-triggered one-shot onboarding hints (docs/DESIGN.md §5).

export class Hints {
  private parent: HTMLElement
  private fired = new Set<string>()
  private el: HTMLDivElement | null = null
  private hideAt = 0

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

  update(now: number): void {
    if (this.el && now > this.hideAt) {
      this.el.remove()
      this.el = null
    }
  }

  reset(): void {
    this.fired.clear()
    if (this.el) {
      this.el.remove()
      this.el = null
    }
  }
}
