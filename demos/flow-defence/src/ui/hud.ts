// Match HUD: thin luminous DOM overlay — nothing opaque over the fluid.
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
.fd-bar {
  height: 3px; border-radius: 2px; margin: 4px 0 10px;
  background: rgba(130, 200, 255, 0.15);
  overflow: hidden;
}
.fd-bar > i {
  display: block; height: 100%; border-radius: 2px;
  transition: width 0.3s ease;
}
.fd-bar.leak > i { background: linear-gradient(90deg, #2dd4bf, #38bdf8); box-shadow: 0 0 8px #38bdf8; }
.fd-bar.reservoir > i { background: linear-gradient(90deg, #f472b6, #fb7185); box-shadow: 0 0 8px #fb7185; }
.fd-bar.tank > i { background: linear-gradient(90deg, #fbbf24, #fb923c); box-shadow: 0 0 8px #fb923c; }
.fd-gold.flash { animation: fd-flash 0.4s; }
@keyframes fd-flash { 50% { color: #ff8f6b; } }
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
  private readonly leakBar: HTMLElement
  private readonly leakVal: HTMLElement
  private readonly resBar: HTMLElement
  private readonly resVal: HTMLElement
  private tankBar!: HTMLElement
  private readonly overEl: HTMLElement
  private readonly overTitle: HTMLElement

  constructor(container: HTMLElement, private readonly levelNum: number) {
    const style = document.createElement('style')
    style.textContent = HUD_CSS
    document.head.appendChild(style)

    const root = document.createElement('div')
    root.className = 'fd-hud'
    root.innerHTML = `
      <div class="fd-panel left">
        <div class="fd-label">Defender · Gold</div>
        <div class="fd-value fd-gold">0</div>
        <div class="fd-label">Leak budget</div>
        <div class="fd-bar leak"><i></i></div>
        <div class="fd-value fd-leak" style="font-size:11px"></div>
        <div class="fd-label">Kills</div>
        <div class="fd-value fd-kills" style="font-size:13px">0</div>
      </div>
      <div class="fd-panel right">
        <div class="fd-label">Attacker · Reservoir</div>
        <div class="fd-bar reservoir"><i></i></div>
        <div class="fd-value fd-res" style="font-size:11px"></div>
        <div class="fd-label">Pressure tank</div>
        <div class="fd-bar tank"><i></i></div>
      </div>
      <div class="fd-tools">
        <span class="fd-tool" data-tool="wall"><b>1</b>Wall</span>
        <span class="fd-tool" data-tool="neutralizer"><b>2</b>Neutralizer ${CONFIG.towers.neutralizer.cost}g</span>
        <span class="fd-tool" data-tool="impeller"><b>3</b>Impeller ${CONFIG.towers.impeller.cost}g</span>
      </div>
      <div class="fd-hint"></div>
      <div class="fd-warn">Surge incoming</div>
      <div class="fd-over"><div>
        <h1></h1>
        <div class="fd-overbtns">
          <button data-over="again">Play again</button>
          <button data-over="menu">Menu</button>
        </div>
      </div></div>
    `
    container.appendChild(root)
    this.goldEl = root.querySelector('.fd-gold')!
    this.leakBar = root.querySelector('.fd-bar.leak > i')!
    this.leakVal = root.querySelector('.fd-leak')!
    this.resBar = root.querySelector('.fd-bar.reservoir > i')!
    this.resVal = root.querySelector('.fd-res')!
    this.tankBar = root.querySelector('.fd-bar.tank > i')!
    this.killsEl = root.querySelector('.fd-kills')!
    this.hintEl = root.querySelector('.fd-hint')!
    this.warnEl = root.querySelector('.fd-warn')!
    this.overEl = root.querySelector('.fd-over')!
    this.overTitle = root.querySelector('.fd-over h1')!
    this.toolEls = [...root.querySelectorAll<HTMLElement>('.fd-tool')]
    root.querySelector('[data-over="again"]')?.addEventListener('click', () => {
      location.href = `${location.pathname}?level=${this.levelNum}`
    })
    root.querySelector('[data-over="menu"]')?.addEventListener('click', () => {
      location.href = location.pathname
    })
  }

  private readonly toolEls: HTMLElement[]
  private killsEl!: HTMLElement
  private hintEl!: HTMLElement
  private warnEl!: HTMLElement

  setTool(tool: string): void {
    for (const el of this.toolEls) el.classList.toggle('active', el.dataset.tool === tool)
  }

  update(engine: Engine): void {
    this.goldEl.textContent = Math.floor(engine.gold).toString()
    const leakFrac = engine.leakBudget / engine.level.leakBudget
    this.leakBar.style.width = `${Math.max(0, leakFrac * 100)}%`
    this.leakVal.textContent = `${Math.max(0, Math.round(engine.leakBudget))}`
    const resFrac = engine.reservoir / engine.level.reservoir
    this.resBar.style.width = `${Math.max(0, resFrac * 100)}%`
    this.resVal.textContent = `${Math.max(0, Math.round(engine.reservoir))}`
    this.tankBar.style.width = `${Math.max(0, (engine.tank / engine.level.tankCap) * 100)}%`
    this.killsEl.textContent = Math.round(engine.killsTotal).toString()
    const surging = engine.inletStates.some((s) => s.surge > 0)
    const imminent = engine.tank / engine.level.tankCap > 0.85
    this.warnEl.textContent = surging ? 'SURGE!' : 'Surge incoming'
    this.warnEl.classList.toggle('show', engine.phase === 'running' && (surging || imminent))
  }

  setHint(text: string | null): void {
    this.hintEl.textContent = text ?? ''
  }

  flashGold(): void {
    this.goldEl.classList.remove('flash')
    void (this.goldEl as HTMLElement).offsetWidth
    this.goldEl.classList.add('flash')
  }

  showGameOver(winner: 'attacker' | 'defender'): void {
    this.overTitle.textContent = winner === 'defender' ? 'The flow is tamed' : 'The base is drowned'
    this.overEl.classList.add('show')
  }
}
