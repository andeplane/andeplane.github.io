// Menu and end screens, including the share card.

import { CELLS, WAVE_COUNT } from '../sim/constants'
import { WON, type GameState } from '../sim/state'
import {
  boardNumber,
  emojiGrid,
  loadDaily,
  loadStreak,
  msUntilNextBoard,
  shareText,
  utcDateString,
} from '../daily'

export type StartChoice = { mode: 'daily' } | { mode: 'free' }

export class Screens {
  private parent: HTMLElement
  private el: HTMLDivElement | null = null

  constructor(parent: HTMLElement) {
    this.parent = parent
  }

  get isOpen(): boolean {
    return this.el !== null
  }

  close(): void {
    if (this.el) {
      this.el.remove()
      this.el = null
    }
  }

  showMenu(onStart: (c: StartChoice) => void, onHowTo: () => void): void {
    this.close()
    const date = utcDateString()
    const rec = loadDaily(date)
    const streak = loadStreak()
    const el = document.createElement('div')
    el.className = 'overlay'
    const played = rec.attempts > 0
    el.innerHTML = `
      <div class="panel">
        <h1>Wall <span class="accent">Defence</span></h1>
        <div class="sub">JezzBall × tower defence · a fresh board every day</div>
        <div class="howto">
          <b>Cut</b> walls to seal ball-free space — sealed land is yours.<br>
          <b>Build</b> turrets on your land; they only fire while it holds.<br>
          <b>Survive</b>: keep the bar past ◆ when each wave lands.
        </div>
        <div class="menu-buttons">
          <button class="btn primary" data-mode="daily">Daily board #${boardNumber()}${played ? ` · try ${rec.attempts + 1}` : ''}</button>
          <button class="btn" data-mode="free">Free play</button>
          <button class="btn" data-act="howto">How to play</button>
        </div>
        <div class="daily-meta">
          ${played ? `today's best: wave ${rec.bestWave}/${WAVE_COUNT} · ${rec.bestPct}%` : 'first try today'}
          ${streak.count > 1 ? ` · <span class="streak">${streak.count} day streak</span>` : ''}
        </div>
      </div>`
    el.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        this.close()
        onStart({ mode: b.dataset.mode as 'daily' | 'free' })
      })
    })
    el.querySelector('[data-act="howto"]')!.addEventListener('click', () => onHowTo())
    this.parent.appendChild(el)
    this.el = el
  }

  showEnd(
    s: GameState,
    isDaily: boolean,
    attempt: number,
    onRestart: () => void,
    onMenu: () => void,
  ): void {
    this.close()
    const won = s.status === WON
    const pct = Math.floor((s.claimedCells * 100) / CELLS)
    const wave = won ? WAVE_COUNT : s.wave
    const streak = loadStreak()
    const el = document.createElement('div')
    el.className = 'overlay'
    el.innerHTML = `
      <div class="panel ${won ? 'won' : 'lost'}">
        <h2>${won ? 'Board held' : 'Board overrun'}</h2>
        <div class="stats-row">
          <div class="stat"><div class="stat-v">${wave}/${WAVE_COUNT}</div><div class="stat-k">waves</div></div>
          <div class="stat"><div class="stat-v">${pct}%</div><div class="stat-k">claimed</div></div>
          ${isDaily ? `<div class="stat"><div class="stat-v">${attempt}</div><div class="stat-k">try</div></div>` : ''}
        </div>
        <pre class="share-grid">${emojiGrid(s)}</pre>
        <div class="menu-buttons">
          <button class="btn primary" data-act="share">Copy share card</button>
          <button class="btn" data-act="restart">${isDaily ? 'Retry today' : 'New run'}</button>
          <button class="btn" data-act="menu">Menu</button>
        </div>
        <div class="daily-meta">
          ${isDaily ? `next board in <span class="next-board"></span>` : 'free play — no streak'}
          ${isDaily && streak.count > 1 ? ` · <span class="streak">${streak.count} day streak</span>` : ''}
        </div>
      </div>`
    const shareBtn = el.querySelector<HTMLButtonElement>('[data-act="share"]')!
    shareBtn.addEventListener('click', async () => {
      const text = shareText(s, isDaily, attempt)
      try {
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
          await navigator.share({ text })
        } else {
          await navigator.clipboard.writeText(text)
          shareBtn.textContent = 'Copied!'
          setTimeout(() => (shareBtn.textContent = 'Copy share card'), 1500)
        }
      } catch {
        // user cancelled or clipboard unavailable
      }
    })
    el.querySelector('[data-act="restart"]')!.addEventListener('click', () => {
      this.close()
      onRestart()
    })
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => {
      this.close()
      onMenu()
    })
    const nextEl = el.querySelector<HTMLSpanElement>('.next-board')
    if (nextEl) {
      const tickClock = () => {
        if (!nextEl.isConnected) return
        const ms = msUntilNextBoard()
        const h = Math.floor(ms / 3600000)
        const m = Math.floor((ms % 3600000) / 60000)
        nextEl.textContent = `${h}:${String(m).padStart(2, '0')}`
        setTimeout(tickClock, 30000)
      }
      tickClock()
    }
    this.parent.appendChild(el)
    this.el = el
  }
}
