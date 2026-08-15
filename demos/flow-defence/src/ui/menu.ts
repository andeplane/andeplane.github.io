// Menu system: title screen over the living fluid, level select, How to Play,
// in-game pause. Level start/restart = navigation with ?level=N (fresh GPU
// state, zero teardown bugs).

import { CONFIG } from '../config'
import { SPORES_BY_INDEX } from '../engine/sporeDefs'
import { TOWER_IDS, TOWER_DEFS } from '../engine/towerDefs'
import { isUnlocked, loadProgress, starGlyphs } from './progress'

const MENU_CSS = /* css */ `
.fd-menu {
  position: absolute; inset: 0; z-index: 20; display: grid; place-items: center;
  background: radial-gradient(ellipse at center, rgba(4, 8, 16, 0.35), rgba(3, 6, 12, 0.88));
  font: 13px/1.6 "SF Mono", ui-monospace, Menlo, monospace;
  color: #b8d4e8;
}
.fd-menu.hidden { display: none; }
.fd-menu-inner { max-width: 40rem; width: 90%; text-align: center; }
.fd-menu h1 {
  font-size: 40px; font-weight: 200; letter-spacing: 0.42em; margin: 0 0 4px;
  color: #eaf6ff; text-shadow: 0 0 28px rgba(120, 210, 255, 0.9);
  text-transform: uppercase;
}
.fd-menu .fd-sub { opacity: 0.65; letter-spacing: 0.2em; margin-bottom: 34px; font-size: 11px; }
.fd-levels { display: grid; gap: 12px; margin-bottom: 22px; }
.fd-level, .fd-btn {
  cursor: pointer; border: 1px solid rgba(130, 200, 255, 0.25); border-radius: 6px;
  padding: 12px 18px; background: rgba(10, 22, 40, 0.5); text-align: left;
  color: inherit; font: inherit; transition: border-color 0.15s, box-shadow 0.15s;
}
.fd-level:hover, .fd-btn:hover {
  border-color: rgba(130, 210, 255, 0.7); box-shadow: 0 0 18px rgba(80, 180, 255, 0.25);
}
.fd-level b { color: #eaf6ff; letter-spacing: 0.08em; }
.fd-level small { display: block; opacity: 0.65; }
.fd-level { position: relative; }
.fd-level .fd-stars {
  position: absolute; right: 14px; top: 12px; color: #fcd34d; letter-spacing: 0.2em;
  text-shadow: 0 0 10px rgba(252, 211, 77, 0.7); font-size: 13px;
}
.fd-level.locked { opacity: 0.45; cursor: not-allowed; }
.fd-level.locked:hover { border-color: rgba(130, 200, 255, 0.25); box-shadow: none; }
.fd-level .fd-lock { position: absolute; right: 14px; top: 12px; opacity: 0.8; }
.fd-levels { max-height: 52vh; overflow-y: auto; padding-right: 6px; }
.fd-btn { text-align: center; }
.fd-menu-row { display: flex; gap: 12px; justify-content: center; }
.fd-howto { text-align: left; max-height: 62vh; overflow-y: auto; padding-right: 8px; }
.fd-howto h2 { font-size: 13px; letter-spacing: 0.2em; color: #8fd0ff; text-transform: uppercase; margin: 18px 0 6px; }
.fd-howto p { margin: 6px 0; opacity: 0.9; }
.fd-howto img { mix-blend-mode: screen; border-radius: 4px; }
.fd-howto .k {
  display: inline-block; border: 1px solid rgba(130,200,255,0.4); border-radius: 3px;
  padding: 0 6px; margin-right: 6px; color: #eaf6ff;
}
.fd-menubtn {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 6;
  pointer-events: auto; cursor: pointer; opacity: 0.6; letter-spacing: 0.18em;
  font: 11px "SF Mono", ui-monospace, Menlo, monospace; color: #b8d4e8;
  text-transform: uppercase; background: none; border: none;
}
.fd-menubtn:hover { opacity: 1; text-shadow: 0 0 8px rgba(120, 210, 255, 0.9); }
`

function howToPlayHtml(): string {
  const { match, build } = CONFIG
  const towerList = TOWER_IDS.map((id) => {
    const d = TOWER_DEFS[id]
    return `<p><img src="${import.meta.env.BASE_URL}sprites/${d.sprite}.png" alt="" style="width:22px;height:22px;vertical-align:-6px;margin-right:6px"><b>${d.name}</b> (${d.cost}g${d.unlockLevel > 1 ? ` · unlocks at level ${d.unlockLevel}` : ''}) — ${d.desc}</p>`
  }).join('')
  const sporeList = SPORES_BY_INDEX.map(
    (d) =>
      `<p><img src="${import.meta.env.BASE_URL}sprites/spore-${d.id}.png" alt="" style="width:22px;height:22px;vertical-align:-6px;margin-right:6px"><b>${d.name}</b> (${d.bounty}g bounty${d.unlockLevel > 1 ? ` · appears at level ${d.unlockLevel}` : ''}) — ${d.desc}</p>`,
  ).join('')
  return /* html */ `
  <div class="fd-howto">
    <h2>The idea</h2>
    <p>The map is a real fluid, and the enemies — <b style="color:#fb7185">spores</b>, the glowing
    pink motes — <b>ride the current</b>. They come in announced <b>waves</b> from the inlets on
    the left. Every spore that reaches your outlet on the right costs a <b>life</b>. Survive all
    the waves with a life left and the flow is tamed.</p>
    <p>The soft blue-white streaks are just water — dye showing you where the current runs.
    <b>Only the pink glow is the enemy.</b></p>
    <p>Because spores ride the water, <b>every wall you draw re-routes the attack itself</b>.
    That's the whole game: sculpt the river, then kill what it carries.</p>
    <p>One law you cannot break: <b>the base drinks from this river</b>. The water-intake bar
    (top right) must keep flowing — dam the whole map and the base <b style="color:#f87171">thirsts</b>
    and bleeds lives, while the river <b>escalates its pressure until the blockade bursts</b>.
    Narrow canals are fine (they just erode under the fast water); total blockage is death.
    Reroute the river as violently as you like; never stop it.</p>

    <h2>Your tools</h2>
    <p>The build palette (bottom) holds everything; number keys select, hover a card for
    details. New towers unlock as you clear levels.</p>
    <p><span class="k">1</span><b>Wall</b> (${build.wallCostPerCell}g/cell) — drag to draw. Walls redirect the
    current: narrow channels flow fast, dead ends silt. Walls are physical — fast water scours
    them and pressure pipes through dams. They glow through their cracks before failing, and
    repainting a damaged wall repairs it. The <b>Erase</b> tool (last palette slot) removes your
    walls for a half refund.</p>
    ${towerList}
    <p>Towers need breathing room — they refuse to stand within ${CONFIG.build.towerSpacing} cells
    of another tower. Claim territory, don't stack.</p>
    <p><b>Water intake</b> (bar, top right) is the rate of water reaching your base — a rolling
    average, so it responds over ~30 s. Keep it above the red mark; below it the base thirsts.</p>
    <p><span class="k">R-hold</span><b>Jet</b> — hold the RIGHT mouse button to blast water outward
    from your cursor. Shove spores off their line, into rings, away from the outlet. It drains a
    charge (the arc at your cursor) and recharges when released. This is your hands in the water —
    use it every wave.</p>

    <h2>The bestiary</h2>
    ${sporeList}

    <h2>Waves</h2>
    <p>Between waves you build in calm water; press <span class="k">SPACE</span> to call the next
    wave early. <b style="color:#ffb168">SURGE</b> waves slam the water hammer: the current runs
    hard, spores ride faster, and your walls strain. Brace before them, repair after.</p>

    <h2>Strategy</h2>
    <p>Don't fight the whole front. <b>Seal inlet arms close to the source</b> — walls in calm
    water between the jets last far longer than walls dropped mid-current — and force every spore
    into one channel. Park neutralizers on that channel and let the bounty fund the next layer.
    A wall parallel to a fast jet dies; a wall that makes the jet turn survives.</p>
    <p>Spores need current to breathe: anything trapped in <b>still water</b> — behind a seal, in
    a dead pocket — <b>suffocates</b>. Drowned spores pay <b>no bounty</b>: sealing is defense,
    not income; only tower kills fund you. The <b style="color:#fb923c">orange glow</b> is
    pressure: water banking up behind a blockage. Dams hold for a while, then fail by piping —
    and a wall glowing <b style="color:#fb7185">hot pink</b> is rotten: spores pass through it.</p>

    <h2>Economy</h2>
    <p>Income: starting gold + <b>water royalties</b> (up to ${match.goldTrickle}g/s, scaled by how
    much water actually reaches your base — an open river pays, a strangled one doesn't) + a
    per-type bounty for every <b>tower</b> kill (see the bestiary) + a wave-clear bonus. Drowned
    spores pay nothing. If your gold flashes, you can't afford what you just tried.</p>
  </div>`
}

export class Menu {
  private readonly root: HTMLElement
  private readonly inner: HTMLElement
  private inGame: boolean

  constructor(container: HTMLElement, currentLevel: number | null) {
    const style = document.createElement('style')
    style.textContent = MENU_CSS
    document.head.appendChild(style)

    this.inGame = currentLevel !== null
    this.root = document.createElement('div')
    this.root.className = 'fd-menu' + (this.inGame ? ' hidden' : '')
    this.root.innerHTML = `<div class="fd-menu-inner"></div>`
    container.appendChild(this.root)
    this.inner = this.root.querySelector('.fd-menu-inner')!
    this.showMain()

    if (this.inGame) {
      const btn = document.createElement('button')
      btn.className = 'fd-menubtn'
      btn.textContent = 'Menu'
      container.appendChild(btn)
      btn.addEventListener('click', () => this.open())
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.toggle()
      })
    }
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden')
  }

  open(): void {
    this.showMain()
    this.root.classList.remove('hidden')
  }

  close(): void {
    if (this.inGame) this.root.classList.add('hidden')
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  private showMain(): void {
    // Progression: a level opens once the previous holds at least one star.
    const progress = loadProgress()
    const levels = CONFIG.levels
      .map((lv, i) => {
        const num = i + 1
        const unlocked = isUnlocked(num, progress)
        const stars = progress.stars[num] ?? 0
        const badge = unlocked
          ? stars > 0
            ? `<span class="fd-stars">${starGlyphs(stars)}</span>`
            : ''
          : `<span class="fd-lock">🔒</span>`
        return `
      <button class="fd-level ${unlocked ? '' : 'locked'}" data-level="${num}" ${unlocked ? '' : 'disabled'}>
        <b>Level ${num} — ${lv.name}</b>${badge}
        <small>${unlocked ? lv.description : `Clear Level ${num - 1} to unlock.`}</small>
      </button>`
      })
      .join('')
    this.inner.innerHTML = `
      <h1>Flow Defence</h1>
      <div class="fd-sub">the map is a fluid</div>
      <div class="fd-levels">${levels}</div>
      <div class="fd-menu-row">
        ${this.inGame ? '<button class="fd-btn" data-action="resume">Resume</button>' : ''}
        <button class="fd-btn" data-action="howto">How to play</button>
      </div>
    `
    this.inner.querySelectorAll<HTMLElement>('.fd-level').forEach((el) =>
      el.addEventListener('click', () => {
        location.href = `${location.pathname}?level=${el.dataset.level}`
      }),
    )
    this.inner.querySelector('[data-action="howto"]')?.addEventListener('click', () => this.showHowTo())
    this.inner.querySelector('[data-action="resume"]')?.addEventListener('click', () => this.close())
  }

  private showHowTo(): void {
    this.inner.innerHTML = `
      <h1 style="font-size:22px">How to play</h1>
      ${howToPlayHtml()}
      <div class="fd-menu-row" style="margin-top:16px">
        <button class="fd-btn" data-action="back">Back</button>
      </div>
    `
    this.inner.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain())
  }
}
