// Intro toasts: "NEW TOWER" / "NEW SPORE" cards that slide in when a level
// introduces something, with the generated sprite, a name, and one line of
// what it does. Queued — cards show one at a time so they actually get read.

const TOAST_CSS = /* css */ `
.fd-toast {
  position: absolute; left: 50%; top: 64px; transform: translate(-50%, -16px);
  z-index: 14; display: flex; gap: 14px; align-items: center;
  min-width: 320px; max-width: 460px; padding: 12px 18px 12px 12px;
  background: rgba(6, 14, 26, 0.92); border: 1px solid rgba(130, 200, 255, 0.35);
  border-radius: 8px; box-shadow: 0 6px 30px rgba(0, 0, 0, 0.5), 0 0 22px var(--fd-toast-glow, rgba(80, 180, 255, 0.25));
  font: 12px/1.5 "SF Mono", ui-monospace, Menlo, monospace; color: #b8d4e8;
  opacity: 0; pointer-events: auto; cursor: pointer;
  transition: opacity 0.3s, transform 0.3s;
}
.fd-toast.show { opacity: 1; transform: translate(-50%, 0); }
.fd-toast img {
  width: 56px; height: 56px; object-fit: contain; mix-blend-mode: screen; border-radius: 6px;
}
.fd-toast .fd-toast-kicker {
  font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--fd-toast-accent, #8fd0ff);
}
.fd-toast .fd-toast-name { font-size: 14px; color: #eaf6ff; letter-spacing: 0.06em; margin: 1px 0 2px; }
.fd-toast .fd-toast-desc { opacity: 0.85; }
`

export interface ToastCard {
  kicker: string
  name: string
  desc: string
  /** Sprite URL (already BASE_URL-resolved) or null for no image. */
  icon: string | null
  accent: string
}

export class Toasts {
  private readonly host: HTMLElement
  private readonly queue: ToastCard[] = []
  private showing = false

  constructor(container: HTMLElement) {
    const style = document.createElement('style')
    style.textContent = TOAST_CSS
    document.head.appendChild(style)
    this.host = container
  }

  push(card: ToastCard): void {
    this.queue.push(card)
    if (!this.showing) this.next()
  }

  private next(): void {
    const card = this.queue.shift()
    if (!card) {
      this.showing = false
      return
    }
    this.showing = true
    const el = document.createElement('div')
    el.className = 'fd-toast'
    el.style.setProperty('--fd-toast-accent', card.accent)
    el.style.setProperty('--fd-toast-glow', card.accent + '55')
    el.innerHTML = `
      ${card.icon ? `<img src="${card.icon}" alt="">` : ''}
      <div>
        <div class="fd-toast-kicker">${card.kicker}</div>
        <div class="fd-toast-name">${card.name}</div>
        <div class="fd-toast-desc">${card.desc}</div>
      </div>`
    this.host.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    const dismiss = () => {
      el.classList.remove('show')
      setTimeout(() => {
        el.remove()
        this.next()
      }, 320)
    }
    const timer = setTimeout(dismiss, 6500)
    el.addEventListener('click', () => {
      clearTimeout(timer)
      dismiss()
    })
  }
}
