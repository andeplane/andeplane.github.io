// Pick-1-of-3 upgrade modal. The sim is frozen while state.currentOffer is
// non-empty; choosing emits a PickUpgrade event.
//
// The pick callback is stored on the instance and refreshed on every sync —
// cards must never capture a stale closure, because a queued second offer
// re-renders the modal from inside the previous pick's handler.

import { UPGRADE_INFO } from '../sim/upgrades'

export class Picker {
  private parent: HTMLElement
  private el: HTMLDivElement | null = null
  private shownOffer = ''
  private onPick: (choice: number) => void = () => undefined

  constructor(parent: HTMLElement) {
    this.parent = parent
  }

  // Keeps the modal in sync with the current offer; always refreshes the
  // callback, rebuilds the DOM only when the offer itself changes.
  sync(offer: number[], onPick: (choice: number) => void): void {
    this.onPick = onPick
    const key = offer.join(',')
    if (key === this.shownOffer) return
    this.shownOffer = key
    if (this.el) {
      this.el.remove()
      this.el = null
    }
    if (offer.length === 0) return
    this.el = document.createElement('div')
    this.el.className = 'overlay'
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `<h2>Territory secured</h2><div class="sub">choose one upgrade</div>`
    const cards = document.createElement('div')
    cards.className = 'picker-cards'
    offer.forEach((u, i) => {
      const info = UPGRADE_INFO[u]
      const card = document.createElement('button')
      card.className = 'card'
      card.innerHTML = `<div class="card-name">${info.name}</div><div class="card-desc">${info.desc}</div>`
      card.addEventListener('click', () => this.onPick(i))
      cards.appendChild(card)
    })
    panel.appendChild(cards)
    this.el.appendChild(panel)
    this.parent.appendChild(this.el)
  }
}
