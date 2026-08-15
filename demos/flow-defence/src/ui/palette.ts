// The build palette: a Warcraft-style icon bar replacing the old text tool
// row. Sprite icons with hotkeys, costs, affordability dimming, a selection
// highlight, and a hover card (name / cost / one-liner). Pure DOM — input.ts
// owns what selection means; this module only renders and reports clicks.

const PALETTE_CSS = /* css */ `
.fd-palette {
  position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%);
  z-index: 12; display: flex; gap: 6px; padding: 6px 8px;
  background: rgba(6, 14, 26, 0.85); border: 1px solid rgba(130, 200, 255, 0.22);
  border-radius: 8px; pointer-events: auto;
  font: 10px/1.3 "SF Mono", ui-monospace, Menlo, monospace; color: #b8d4e8;
}
.fd-pal-item {
  position: relative; width: 52px; padding: 4px 3px 3px; text-align: center;
  border: 1px solid rgba(130, 200, 255, 0.16); border-radius: 6px;
  background: rgba(10, 22, 40, 0.6); cursor: pointer; user-select: none;
  transition: border-color 0.12s, box-shadow 0.12s, opacity 0.12s;
}
.fd-pal-item:hover { border-color: rgba(130, 210, 255, 0.6); }
.fd-pal-item.sel {
  border-color: var(--fd-pal-accent, #7dd8ff);
  box-shadow: 0 0 12px var(--fd-pal-glow, rgba(125, 216, 255, 0.35)), inset 0 0 10px rgba(125, 216, 255, 0.12);
}
.fd-pal-item.poor { opacity: 0.45; }
.fd-pal-item.poor:hover { opacity: 0.7; }
.fd-pal-icon { width: 34px; height: 34px; object-fit: contain; display: block; margin: 0 auto;
  mix-blend-mode: screen; border-radius: 5px;
  filter: drop-shadow(0 0 4px var(--fd-pal-glow, rgba(125,216,255,0.4))); }
.fd-pal-glyph { width: 34px; height: 34px; display: grid; place-items: center; margin: 0 auto;
  font-size: 20px; color: var(--fd-pal-accent, #8fd0ff); }
.fd-pal-key {
  position: absolute; top: 1px; left: 4px; opacity: 0.75; font-size: 9px; color: #eaf6ff;
}
.fd-pal-cost { display: block; margin-top: 1px; color: #ffd479; }
.fd-pal-cost.free { color: #7fe0a8; }
.fd-pal-card {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  width: 190px; padding: 8px 10px; border-radius: 6px; text-align: left;
  background: rgba(6, 14, 26, 0.95); border: 1px solid rgba(130, 200, 255, 0.35);
  pointer-events: none; opacity: 0; transition: opacity 0.12s; z-index: 13;
  font-size: 10px; line-height: 1.45;
}
.fd-pal-item:hover .fd-pal-card { opacity: 1; }
.fd-pal-card b { display: block; color: #eaf6ff; font-size: 11px; letter-spacing: 0.06em; }
.fd-pal-card .c { color: #ffd479; }
`

export interface PaletteItem {
  /** Tool key reported to onSelect (matches input.ts tools). */
  key: string
  hotkey: string
  label: string
  desc: string
  color: string
  /** Sprite URL; null renders `glyph` text instead. */
  icon: string | null
  glyph?: string
  /** Gold cost (per placement); undefined = free / passive tool. */
  cost?: number
  costSuffix?: string
}

export class Palette {
  private readonly root: HTMLElement
  private readonly items: PaletteItem[]
  private readonly els = new Map<string, HTMLElement>()
  private selected: string | null = null

  constructor(container: HTMLElement, items: PaletteItem[], onSelect: (key: string) => void) {
    const style = document.createElement('style')
    style.textContent = PALETTE_CSS
    document.head.appendChild(style)

    this.items = items
    this.root = document.createElement('div')
    this.root.className = 'fd-palette'
    for (const item of items) {
      const el = document.createElement('div')
      el.className = 'fd-pal-item'
      el.style.setProperty('--fd-pal-accent', item.color)
      el.style.setProperty('--fd-pal-glow', item.color + '66')
      el.innerHTML = `
        <span class="fd-pal-key">${item.hotkey}</span>
        ${item.icon ? `<img class="fd-pal-icon" src="${item.icon}" alt="">` : `<div class="fd-pal-glyph">${item.glyph ?? '?'}</div>`}
        <span class="fd-pal-cost ${item.cost == null ? 'free' : ''}">${item.cost == null ? item.label : `${item.cost}g${item.costSuffix ?? ''}`}</span>
        <div class="fd-pal-card"><b>${item.label}</b><span class="c">${item.cost != null ? `${item.cost}g${item.costSuffix ?? ''} · ` : ''}key ${item.hotkey}</span><br>${item.desc}</div>`
      el.addEventListener('click', () => onSelect(item.key))
      this.root.appendChild(el)
      this.els.set(item.key, el)
    }
    container.appendChild(this.root)
  }

  select(key: string | null): void {
    if (this.selected) this.els.get(this.selected)?.classList.remove('sel')
    this.selected = key
    if (key) this.els.get(key)?.classList.add('sel')
  }

  /** Dim what the player can't afford right now. */
  update(gold: number): void {
    for (const item of this.items) {
      if (item.cost == null) continue
      this.els.get(item.key)?.classList.toggle('poor', gold < item.cost)
    }
  }
}
