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
.fd-lives.hit { animation: fd-hit 0.7s; }
@keyframes fd-hit {
  0% { color: #ff2d55; text-shadow: 0 0 24px rgba(255, 45, 85, 1); transform: scale(1.5); }
  100% { color: #fda4af; transform: scale(1); }
}
.fd-lives { display: inline-block; transform-origin: left center; }
.fd-dmg {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  box-shadow: inset 0 0 120px 30px rgba(255, 45, 85, 0.55);
}
.fd-dmg.hit { animation: fd-dmg 0.8s ease-out; }
@keyframes fd-dmg { 0% { opacity: 1; } 100% { opacity: 0; } }
.fd-escaped {
  position: absolute; left: 50%; top: 42%; transform: translateX(-50%);
  letter-spacing: 0.3em; font-size: 17px; color: #ff5c77; text-transform: uppercase;
  text-shadow: 0 0 20px rgba(255, 45, 85, 1); opacity: 0; pointer-events: none;
}
.fd-escaped.hit { animation: fd-dmg 1.1s ease-out; }
.fd-bar {
  height: 3px; border-radius: 2px; margin: 4px 0 2px;
  background: rgba(130, 200, 255, 0.15); overflow: hidden;
}
.fd-bar > i { display: block; height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.fd-bar.intake { position: relative; overflow: visible; }
.fd-bar.intake > i { background: linear-gradient(90deg, #38bdf8, #7dd3fc); box-shadow: 0 0 8px #38bdf8; }
.fd-bar.intake.dry > i { background: linear-gradient(90deg, #fb923c, #f87171); box-shadow: 0 0 8px #fb7185; }
.fd-bar.intake > s {
  position: absolute; top: -2px; bottom: -2px; width: 2px;
  background: #f87171; box-shadow: 0 0 6px rgba(248, 113, 113, 0.9);
}
.fd-intakecap { font-size: 9px; opacity: 0; letter-spacing: 0.06em; transition: opacity 0.4s; }
.fd-intakecap.low { opacity: 0.85; color: #fdba74; }
.fd-thirst {
  position: absolute; left: 50%; top: 92px; transform: translateX(-50%);
  letter-spacing: 0.24em; font-size: 13px; color: #f87171; text-transform: uppercase;
  text-shadow: 0 0 18px rgba(248, 113, 113, 0.9); display: none;
  animation: fd-pulse 0.7s infinite;
}
.fd-thirst.show { display: block; }
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
  position: absolute; left: 50%; bottom: 118px; transform: translateX(-50%);
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
  private readonly intakeBar: HTMLElement
  private readonly intakeWrap: HTMLElement
  private readonly intakeCap: HTMLElement
  private readonly thirstEl: HTMLElement
  private readonly dmgEl: HTMLElement
  private readonly escapedEl: HTMLElement
  private readonly jetEl: HTMLElement
  private readonly announceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly warnEl: HTMLElement
  private readonly overEl: HTMLElement
  private readonly overTitle: HTMLElement
  private readonly overSub: HTMLElement

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
        <div class="fd-label">Kills · bounty per type</div>
        <div class="fd-value fd-kills" style="font-size:13px">0</div>
      </div>
      <div class="fd-panel right">
        <div class="fd-label">Wave</div>
        <div class="fd-value fd-wave">–</div>
        <div class="fd-status"></div>
        <div class="fd-label" style="margin-top:8px">Water intake</div>
        <div class="fd-bar intake"><i></i><s></s></div>
        <div class="fd-intakecap">the base drinks from this river — keep it above the mark</div>
      </div>
      <div class="fd-tools">
        <span class="fd-tool fd-jet active"><b>R-hold</b>Jet</span>
      </div>
      <div class="fd-hint"></div>
      <div class="fd-dmg"></div>
      <div class="fd-escaped">Spore escaped</div>
      <div class="fd-warn">Surge wave</div>
      <div class="fd-thirst">The base thirsts — let the river flow</div>
      <div class="fd-announce"></div>
      <div class="fd-over"><div>
        <h1></h1>
        <div class="fd-oversub"></div>
        <div class="fd-overbtns">
          <button data-over="next" style="display:none">Next level</button>
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
    this.intakeBar = root.querySelector('.fd-bar.intake > i')!
    this.intakeWrap = root.querySelector('.fd-bar.intake')!
    this.intakeCap = root.querySelector('.fd-intakecap')!
    // Thirst-line marker (sqrt display scale expands the low end of the bar).
    const mark = root.querySelector<HTMLElement>('.fd-bar.intake > s')!
    mark.style.left = `${Math.round(Math.sqrt(CONFIG.match.thirstFraction) * 100)}%`
    this.thirstEl = root.querySelector('.fd-thirst')!
    this.dmgEl = root.querySelector('.fd-dmg')!
    this.escapedEl = root.querySelector('.fd-escaped')!
    this.jetEl = root.querySelector('.fd-jet')!
    this.announceEl = root.querySelector('.fd-announce')!
    this.hintEl = root.querySelector('.fd-hint')!
    this.warnEl = root.querySelector('.fd-warn')!
    this.overEl = root.querySelector('.fd-over')!
    this.overTitle = root.querySelector('.fd-over h1')!
    this.overSub = root.querySelector('.fd-oversub')!
    root.querySelector('[data-over="again"]')?.addEventListener('click', () => {
      location.href = `${location.pathname}?level=${this.levelNum}`
    })
    root.querySelector('[data-over="next"]')?.addEventListener('click', () => {
      location.href = `${location.pathname}?level=${this.levelNum + 1}`
    })
    root.querySelector('[data-over="menu"]')?.addEventListener('click', () => {
      location.href = location.pathname
    })
  }

  setTool(_tool: string): void {
    // Tool highlighting moved to the build palette (ui/palette.ts).
  }

  private lastLives = -1

  update(engine: Engine): void {
    this.goldEl.textContent = Math.floor(engine.gold).toString()
    this.livesEl.textContent = engine.lives.toString()
    // A lost life must be unmissable: counter punch, red screen-edge flash,
    // and (for escapes) a center callout naming the cause.
    if (this.lastLives >= 0 && engine.lives < this.lastLives) {
      for (const el of [this.livesEl, this.dmgEl]) {
        el.classList.remove('hit')
        void el.offsetWidth
        el.classList.add('hit')
      }
      if (!engine.thirsting) {
        this.escapedEl.classList.remove('hit')
        void this.escapedEl.offsetWidth
        this.escapedEl.classList.add('hit')
      }
    }
    this.lastLives = engine.lives
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
    const intake = engine.intakeFlux < 0 ? 1 : Math.min(1, engine.intakeFlux / engine.nominalFlux)
    this.intakeBar.style.width = `${Math.round(Math.sqrt(intake) * 100)}%`
    this.intakeWrap.classList.toggle('dry', engine.thirsting)
    this.intakeCap.classList.toggle(
      'low',
      engine.intakeFlux >= 0 && intake < CONFIG.match.thirstFraction * 3,
    )
    this.thirstEl.textContent =
      engine.floodPressure > 0.15
        ? 'The base thirsts — the flood rises'
        : 'The base thirsts — let the river flow'
    this.thirstEl.classList.toggle(
      'show',
      engine.phase !== 'over' && (engine.thirsting || engine.floodPressure > 0.15),
    )
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

  showGameOver(winner: 'attacker' | 'defender', engine: Engine, stars = 0, unlockNext = false): void {
    this.overTitle.textContent = winner === 'defender' ? 'The flow is tamed' : 'The base is drowned'
    if (winner === 'defender') {
      const starLine = `<div style="font-size:26px; letter-spacing:0.3em; color:#fcd34d; text-shadow:0 0 18px rgba(252,211,77,0.8); margin-bottom:6px">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`
      this.overSub.innerHTML =
        starLine +
        `All ${engine.waveTotal} enemy waves survived · ${engine.killsTotal} spores destroyed · ` +
        `${engine.lives} ${engine.lives === 1 ? 'life' : 'lives'} to spare.` +
        (unlockNext ? `<br><span style="color:#8fd0ff">Next level unlocked.</span>` : '')
      if (unlockNext) {
        const next = this.overEl.querySelector<HTMLElement>('[data-over="next"]')
        if (next) next.style.display = ''
      }
      this.overEl.classList.add('show')
      return
    }
    if (engine.thirstTicks > 0) {
      this.overSub.textContent = `The base died of thirst on wave ${Math.min(engine.waveIndex + 1, engine.waveTotal)} — the river was strangled.`
    } else {
      this.overSub.textContent =
        `Overrun on wave ${Math.min(engine.waveIndex + 1, engine.waveTotal)} of ${engine.waveTotal} · ` +
        `${engine.killsTotal} spores destroyed.`
    }
    this.overEl.classList.add('show')
  }
}
