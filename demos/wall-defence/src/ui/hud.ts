// One top bar: claimed% fill + quota tick ◆ + wave countdown. Money below.
// The cut cooldown lives on the canvas ghost, not here.

import { CELLS, QUOTA_PCT, TICK_HZ, WAVE_COUNT } from '../sim/constants'
import { type GameState } from '../sim/state'
import { waveSpawnTick, winTick } from '../sim/waves'

export class Hud {
  private root: HTMLDivElement
  private fill: HTMLDivElement
  private quota: HTMLDivElement
  private labelL: HTMLSpanElement
  private labelR: HTMLSpanElement
  private money: HTMLSpanElement
  private waveInfo: HTMLSpanElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="hud-bar">
        <div class="hud-fill"></div>
        <div class="hud-quota"></div>
        <div class="hud-label"><span class="l"></span><span class="r"></span></div>
      </div>
      <div class="hud-sub">
        <span class="hud-money"></span>
        <span class="hud-waveinfo"></span>
      </div>`
    parent.appendChild(this.root)
    this.fill = this.root.querySelector('.hud-fill')!
    this.quota = this.root.querySelector('.hud-quota')!
    this.labelL = this.root.querySelector('.hud-label .l')!
    this.labelR = this.root.querySelector('.hud-label .r')!
    this.money = this.root.querySelector('.hud-money')!
    this.waveInfo = this.root.querySelector('.hud-waveinfo')!
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none'
  }

  update(s: GameState): void {
    const pct = (s.claimedCells * 100) / CELLS
    this.fill.style.width = `${pct.toFixed(1)}%`
    // The quota that will be checked next.
    const nextQuotaIdx = Math.min(s.wave >= 1 ? s.wave - 1 : 0, WAVE_COUNT - 1)
    const quotaPct = QUOTA_PCT[nextQuotaIdx]
    this.quota.style.left = `${quotaPct}%`
    const danger = s.wave >= 1 && s.claimedCells * 100 < quotaPct * CELLS
    this.fill.classList.toggle('danger', danger)
    this.labelL.textContent = `${Math.floor(pct)}%`

    let right = ''
    let warning = false
    if (s.wave < WAVE_COUNT) {
      const next = waveSpawnTick(s.wave)
      const secs = Math.max(0, Math.ceil((next - s.tick) / TICK_HZ))
      right = `wave ${s.wave + 1} in 0:${String(secs).padStart(2, '0')}`
      warning = danger && secs <= 10
    } else {
      const secs = Math.max(0, Math.ceil((winTick() - s.tick) / TICK_HZ))
      right = `hold 0:${String(secs).padStart(2, '0')}`
      warning = s.claimedCells * 100 < QUOTA_PCT[WAVE_COUNT - 1] * CELLS
    }
    this.labelR.textContent = right
    this.labelR.className = warning ? 'r hud-wave-warning' : 'r'

    this.money.textContent = `${s.money}¢`
    this.waveInfo.textContent = `wave ${Math.min(s.wave + (s.wave < WAVE_COUNT ? 1 : 0), WAVE_COUNT)} / ${WAVE_COUNT} · quota ${quotaPct}%`
  }
}
