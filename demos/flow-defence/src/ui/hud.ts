// Match HUD: thin luminous DOM overlay — nothing opaque over the fluid.
// Left: gold / lives / kills. Right: wave counter + status. Center: hints,
// wave announcements, surge warning, game-over overlay.

import { CONFIG } from '../config'
import type { Engine } from '../engine/Engine'

const HUD_CSS = /* css */ `
.fd-hud {
  position: absolute; inset: 0; pointer-events: none; z-index: 5;
  font: 12px/1.5 "SF Mono", ui-monospace, Menlo, monospace;
  color: #b8d4e8; text-shadow: 0 0 6px rgba(80, 180, 255, 0.35);
}
.fd-panel { position: absolute; top: 14px; min-width: 200px; }
.fd-panel.left { left: 18px; }
.fd-panel.right { right: 18px; text-align: right; }
.fd-label { letter-spacing: 0.14em; font-size: 10px; opacity: 0.75; text-transform: uppercase; }
.fd-value { font-size: 15px; color: #eaf6ff; }
.fd-lives { font-size: 19px; color: #fda4af; text-shadow: 0 0 10px rgba(251, 113, 133, 0.7); }
.fd-wave { font-size: 19px; }
.fd-status { font-size: 11px; opacity: 0.9; margin-top: 2px; }
.fd-gold.flash { animation: fd-flash 0.4s; }
@keyframes fd-flash { 50% { color: #ff8f6b; } }
.fd-announce {
  position: absolute; left: 50%; top: 30%; transform: translateX(-50%);
  font-size: 22px; letter-spacing: 0.34em; text-transform: uppercase; color: #eaf6ff;
  text-shadow: 0 0 24px rgba(120, 210, 255, 0.9); opacity: 0; pointer-events: none;
}
.fd-announce.show { animation: fd-announce 2.4s ease-out; }
@keyframes fd-announce {
  0% { opacity: 0; transform: translateX(-50%) scale(1.15); }
  12% { opacity: 1; transform: translateX(-50%) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; }
}
.fd-over {
  position: absolute; inset: 0; display: none; place-items: center; text-align: center;
  background: radial-gradient(ellipse at center, rgba(4, 8, 16, 0.25), rgba(4, 8, 16, 0.78));
}
.fd-over.show { display: grid; pointer-events: auto; }
.fd-over .fd-overbtns { display: flex; gap: 14px; justify-content: center; margin-top: 22px; }
.fd-over button {
  cursor: pointer; border: 1px solid rgba(130, 200, 255, 0.3); border-radius: 6px;
  padding: 9px 22px; background: rgba(10, 22, 40, 0.6); color: #b8d4e8;
  font: 12px "SF Mono", ui-monospace, Menlo, monospace; letter-spacing: 0.12em;
}
.fd-over button:hover { border-color: rgba(130, 210, 255, 0.8); color: #eaf6ff; }
.fd-over h1 {
  font-size: 34px; font-weight: 300; letter-spacing: 0.3em; text-transform: uppercase;
  color: #eaf6ff; text-shadow: 0 0 24px rgba(120, 210, 255, 0.8);
}
.fd-over .fd-oversub { margin-top: 8px; opacity: 0.75; }
.fd-tools { position: absolute; left: 18px; bottom: 14px; display: flex; gap: 14px; }
.fd-hint {
  position: absolute; left: 50%; bottom: 48px; transform: translateX(-50%);
  max-width: 46rem; text-align: center; padding: 10px 22px; border-radius: 8px;
  background: rgba(8, 18, 34, 0.72); border: 1px solid rgba(130, 200, 255, 0.35);
  color: #dcefff; font-size: 13px; box-shadow: 0 0 22px rgba(60, 150, 255, 0.18);
}
.fd-hint:empty { display: none; }
.fd-warn {
  position: absolute; left: 50%; top: 64px; transform: translateX(-50%);
  letter-spacing: 0.3em; font-size: 15px; color: #ffb168; text-transform: uppercase;
  text-shadow: 0 0 18px rgba(255, 120, 40, 0.9); display: none;
  animation: fd-pulse 0.9s infinite;
}
.fd-warn.show { display: block; }
@keyframes fd-pulse { 50% { opacity: 0.45; } }
.fd-tool { opacity: 0.5; }
.fd-tool.active { opacity: 1; color: #eaf6ff; text-shadow: 0 0 10px rgba(120, 210, 255, 0.9); }
.fd-tool b { font-weight: 600; margin-right: 4px; opacity: 0.8; }
`

export class Hud {
  private readonly goldEl: HTMLElement
  private readonly livesEl: HTMLElement
  private readonly killsEl: HTMLElement
  private readonly waveEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly jetEl: HTMLElement
  private readonly announceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly warnEl: HTMLElement
  private readonly overEl: HTMLElement
  private readonly overTitle: HTMLElement
  private readonly overSub: HTMLElement
  private readonly toolEls: HTMLElement[]

  constructor(container: HTMLElement, private readonly levelNum: number) {
    const style = document.createElement('style')
    style.textContent = HUD_CSS
    document.head.appendChild(style)

    const root = document.createElement('div')
    root.className = 'fd-hud'
    root.innerHTML = `
      <div class="fd-panel left">
        <div class="fd-label">Gold</div>
        <div class="fd-value fd-gold">0</div>
        <div class="fd-label">Lives</div>
        <div class="fd-value fd-lives">0</div>
        <div class="fd-label">Kills</div>
        <div class="fd-value fd-kills" style="font-size:13px">0</div>
      </div>
      <div class="fd-panel right">
        <div class="fd-label">Wave</div>
        <div class="fd-value fd-wave">–</div>
        <div class="fd-status"></div>
      </div>
      <div class="fd-tools">
        <span class="fd-tool" data-tool="wall"><b>1</b>Wall</span>
        <span class="fd-tool" data-tool="neutralizer"><b>2</b>Neutralizer ${CONFIG.towers.neutralizer.cost}g</span>
        <span class="fd-tool" data-tool="impeller"><b>3</b>Impeller ${CONFIG.towers.impeller.cost}g</span>
        <span class="fd-tool fd-jet"><b>R-hold</b>Jet</span>
      </div>
      <div class="fd-hint"></div>
      <div class="fd-warn">Surge wave</div>
      <div class="fd-announce"></div>
      <div class="fd-over"><div>
        <h1></h1>
        <div class="fd-oversub"></div>
        <div class="fd-overbtns">
          <button data-over="again">Play again</button>
          <button data-over="menu">Menu</button>
        </div>
      </div></div>
    `
    container.appendChild(root)
    this.goldEl = root.querySelector('.fd-gold')!
    this.livesEl = root.querySelector('.fd-lives')!
    this.killsEl = root.querySelector('.fd-kills')!
    this.waveEl = root.querySelector('.fd-wave')!
    this.statusEl = root.querySelector('.fd-status')!
    this.jetEl = root.querySelector('.fd-jet')!
    this.announceEl = root.querySelector('.fd-announce')!
    this.hintEl = root.querySelector('.fd-hint')!
    this.warnEl = root.querySelector('.fd-warn')!
    this.overEl = root.querySelector('.fd-over')!
    this.overTitle = root.querySelector('.fd-over h1')!
    this.overSub = root.querySelector('.fd-oversub')!
    this.toolEls = [...root.querySelectorAll<HTMLElement>('.fd-tool[data-tool]')]
    root.querySelector('[data-over="again"]')?.addEventListener('click', () => {
      location.href = `${location.pathname}?level=${this.levelNum}`
    })
    root.querySelector('[data-over="menu"]')?.addEventListener('click', () => {
      location.href = location.pathname
    })
  }

  setTool(tool: string): void {
    for (const el of this.toolEls) el.classList.toggle('active', el.dataset.tool === tool)
  }

  update(engine: Engine): void {
    this.goldEl.textContent = Math.floor(engine.gold).toString()
    this.livesEl.textContent = engine.lives.toString()
    this.killsEl.textContent = engine.killsTotal.toString()
    const waveNum = Math.min(engine.waveIndex + 1, engine.waveTotal)
    this.waveEl.textContent = `${waveNum} / ${engine.waveTotal}`
    if (engine.phase === 'build') {
      const s = Math.ceil(engine.buildTicksLeft / 60)
      this.statusEl.textContent = `next wave in ${s}s — SPACE to call it`
    } else if (engine.phase === 'wave') {
      const parts: string[] = []
      if (engine.spawnRemaining > 0) parts.push(`${engine.spawnRemaining} to spawn`)
      parts.push(`${engine.aliveEstimate} in the water`)
      this.statusEl.textContent = parts.join(' · ')
    } else {
      this.statusEl.textContent = ''
    }
    this.jetEl.style.opacity = (0.35 + 0.65 * engine.jetCharge).toFixed(2)
    this.warnEl.classList.toggle('show', engine.phase === 'wave' && engine.surging)
  }

  setHint(text: string | null): void {
    this.hintEl.textContent = text ?? ''
  }

  /** Big transient center text (wave start / wave cleared). */
  announce(text: string): void {
    this.announceEl.textContent = text
    this.announceEl.classList.remove('show')
    void this.announceEl.offsetWidth
    this.announceEl.classList.add('show')
  }

  flashGold(): void {
    this.goldEl.classList.remove('flash')
    void this.goldEl.offsetWidth
    this.goldEl.classList.add('flash')
  }

  showGameOver(winner: 'attacker' | 'defender'): void {
    this.overTitle.textContent = winner === 'defender' ? 'The flow is tamed' : 'The base is drowned'
    this.overSub.textContent =
      winner === 'defender' ? 'Every wave broken against your walls.' : 'Too many spores slipped the current.'
    this.overEl.classList.add('show')
  }
}
