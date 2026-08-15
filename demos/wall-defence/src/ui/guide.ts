// "How to play" + feature reference. Numbers are pulled from sim/constants
// so the guide cannot drift from the game.

import {
  BALL_HP,
  BallType,
  CUT_COOLDOWN,
  DRAIN_TICKS,
  MAX_CHASERS,
  QUOTA_PCT,
  SLOW_COST,
  SLOW_RANGE,
  TICK_HZ,
  TURRET_COST,
  TURRET_DMG,
  TURRET_RANGE,
  Q,
  WAVE_COUNT,
} from '../sim/constants'
import { UPGRADE_INFO } from '../sim/upgrades'

const secs = (ticks: number) => `${ticks / TICK_HZ} s`
const cells = (q8: number) => `${q8 / Q}`

function enemiesHtml(): string {
  const rows: [string, string, number, string][] = [
    [
      'glyph-bouncer',
      'Bouncer',
      BALL_HP[BallType.Bouncer],
      'Classic 45° ball. Touching a growing wall shatters that half.',
    ],
    [
      'glyph-breaker',
      'Breaker',
      BALL_HP[BallType.Breaker],
      'Hunts your walls and chews through them, breaching regions. Gnaws faster every wave — only killing them relieves the pressure.',
    ],
    [
      'glyph-chaser',
      'Chaser',
      BALL_HP[BallType.Chaser],
      `Homes in on your growing wall head (shatters cost half cooldown). Up to ${MAX_CHASERS} alive — they pile up if you never kill them.`,
    ],
    [
      'glyph-splitter',
      'Splitter',
      BALL_HP[BallType.Splitter],
      'On death, splits into two fast 1-HP fragments.',
    ],
  ]
  return rows
    .map(
      ([g, name, hp, desc]) => `
      <div class="ref-row">
        <span class="glyph ${g}"></span>
        <div><b>${name}</b> <span class="dim">· ${hp} HP</span><br><span class="dim">${desc}</span></div>
      </div>`,
    )
    .join('')
}

function towersHtml(): string {
  const turretTiers = TURRET_COST.map(
    (c, i) =>
      `T${i + 1}: ${c}¢ · ${TURRET_DMG[i]} dmg · range ${cells(TURRET_RANGE[i])}`,
  ).join('<br>')
  const slowTiers = SLOW_COST.map(
    (c, i) => `T${i + 1}: ${c}¢ · range ${cells(SLOW_RANGE[i])}`,
  ).join('<br>')
  return `
    <div class="ref-row">
      <span class="glyph glyph-turret"></span>
      <div><b>Turret</b><br><span class="dim">${turretTiers}</span></div>
    </div>
    <div class="ref-row">
      <span class="glyph glyph-slow"></span>
      <div><b>Slow field</b> <span class="dim">· aura slows balls to 60 % (45 % upgraded)</span><br><span class="dim">${slowTiers}</span></div>
    </div>
    <div class="dim guide-note">
      Tap a claimed cell to build; tap a tower to upgrade or sell (⅔ refund).
      Each tower you own makes the <b>next one pricier</b>. Towers fire only
      while their region is sealed — a breached region powers them down until
      you reclaim it.
    </div>`
}

function upgradesHtml(): string {
  return UPGRADE_INFO.map(
    (u) => `
    <div class="ref-row">
      <span class="glyph glyph-upgrade"></span>
      <div><b>${u.name}</b><br><span class="dim">${u.desc}</span></div>
    </div>`,
  ).join('')
}

export class Guide {
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

  open(): void {
    this.close()
    const el = document.createElement('div')
    el.className = 'overlay'
    el.innerHTML = `
      <div class="panel guide">
        <h2>How to play</h2>
        <div class="guide-cols">
          <section>
            <h3>The loop</h3>
            <ol class="guide-steps">
              <li><b>Cut</b> open space to grow a wall both ways. A ball hitting a growing half shatters it (${secs(CUT_COOLDOWN)} cooldown — halved if a chaser got you). Sealed ball-free regions become <b>your territory</b>.</li>
              <li><b>Build</b> towers on territory — it's the only ground they can stand on.</li>
              <li><b>Survive ${WAVE_COUNT} waves.</b> When a wave lands, your claimed % must be past the ◆ mark on the bar, or the run ends. Quotas climb from ${QUOTA_PCT[0]} % to ${QUOTA_PCT[WAVE_COUNT - 1]} %.</li>
              <li>Crossing each quota lets you <b>pick 1 of 3 upgrades</b>.</li>
            </ol>
            <h3>Breaches</h3>
            <p class="dim">When a breaker opens a hole, the region <b>drains for ${secs(DRAIN_TICKS)}</b> (red pulse). Plug the hole with a quick cut to save it — but if a ball slips inside, it's gone at once. Powered-down towers survive and wake when you reseal.</p>
            <h3>Economy</h3>
            <p class="dim">Income scales with claimed %. Captures pay a burst — <b>first-time cells only</b>, ×2 for claims over 5 % of the board, ×3 over 10 %. Portals glow amber ${'5 s'} before each wave; sealing the border just moves spawns inland. Later waves are faster and tougher.</p>
            <h3>Controls</h3>
            <p class="dim"><b>Desktop:</b> hover to aim, click to cut, <b>Space</b> or right-click flips direction.<br>
            <b>Touch:</b> tap to place a ghost, drag to adjust, ↕ flips, ✓ commits.</p>
          </section>
          <section>
            <h3>Enemies</h3>
            ${enemiesHtml()}
            <h3>Towers</h3>
            ${towersHtml()}
          </section>
          <section>
            <h3>Upgrades <span class="dim">(pick-1-of-3 at each quota)</span></h3>
            ${upgradesHtml()}
          </section>
        </div>
        <div class="menu-buttons"><button class="btn primary" data-act="close">Got it</button></div>
      </div>`
    el.querySelector('[data-act="close"]')!.addEventListener('click', () => this.close())
    el.addEventListener('click', (e) => {
      if (e.target === el) this.close()
    })
    this.parent.appendChild(el)
    this.el = el
  }
}
