// Pick-1-of-3 upgrade modal. The sim is frozen while state.currentOffer is
// non-empty; choosing emits a PickUpgrade event.

import { UPGRADE_INFO } from '../sim/upgrades'

export class Picker {
  private parent: HTMLElement
  private el: HTMLDivElement | null = null
  private shownOffer = ''

  constructor(parent: HTMLElement) {
    this.parent = parent
  }

  // Keeps the modal in sync with the current offer. onPick emits the event.
  sync(offer: number[], onPick: (choice: number) => void): void {
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
      card.addEventListener('click', () => onPick(i))
      cards.appendChild(card)
    })
    panel.appendChild(cards)
    this.el.appendChild(panel)
    this.parent.appendChild(this.el)
  }
}
