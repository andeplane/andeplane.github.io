// Menu system: title screen over the living fluid, level select, How to Play,
// in-game pause. Level start/restart = navigation with ?level=N (fresh GPU
// state, zero teardown bugs).

import { CONFIG } from '../config'

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
.fd-btn { text-align: center; }
.fd-menu-row { display: flex; gap: 12px; justify-content: center; }
.fd-howto { text-align: left; max-height: 62vh; overflow-y: auto; padding-right: 8px; }
.fd-howto h2 { font-size: 13px; letter-spacing: 0.2em; color: #8fd0ff; text-transform: uppercase; margin: 18px 0 6px; }
.fd-howto p { margin: 6px 0; opacity: 0.9; }
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
  const { towers, match, build } = CONFIG
  return /* html */ `
  <div class="fd-howto">
    <h2>The idea</h2>
    <p>The map is a real fluid. The attacker owns the inlets on the left and releases
    <b style="color:#fb7185">biomass</b> — the glowing pink tide — into the current. Anything that
    reaches your outlet on the right drains your <b>leak budget</b>. You lose at zero.</p>
    <p>The soft blue-white streaks are just water — dye showing you where the current runs.
    <b>Only the pink glow is the enemy.</b></p>
    <p>The attacker's <b>reservoir</b> is finite. Outlast it — when it's spent and the water runs
    clear, you win. Every match is two integrals racing.</p>

    <h2>Your tools</h2>
    <p><span class="k">1</span><b>Wall</b> (${build.wallCostPerCell}g/cell) — drag to draw. Walls redirect the
    current itself: narrow channels flow fast, dead ends silt. Walls are physical — fast water
    scours them and pressure pipes through dams. They glow through their cracks before failing,
    and quietly self-heal when the flow leaves them alone.</p>
    <p><span class="k">2</span><b>Neutralizer</b> (${towers.neutralizer.cost}g) — click to place. Kills biomass
    passing through its ring, and pays <b>bounty</b> (${match.bountyPerBiomass}g per unit killed) —
    your main income. Put it where the flow concentrates.</p>
    <p><span class="k">3</span><b>Impeller</b> (${towers.impeller.cost}g) — click and drag to aim. A pump that
    pushes the water itself: steer biomass into kill zones, slow a channel, starve a route.</p>

    <h2>Reading the water</h2>
    <p><b style="color:#fb923c">Warm orange glow</b> = pressure above ambient. The attacker banks a
    pressure tank (orange bar, top right) and dumps it as a <b>surge</b> — when the inlet glows and
    the tank empties, brace. Surges also erode your walls faster.</p>
    <p>You can dam the entire flow. It will hold, pressurize the whole upstream — and then fail
    like a real dam, by piping. Sometimes buying those seconds is worth the flood.</p>

    <h2>Economy</h2>
    <p>Income: starting gold + a small trickle (${match.goldTrickle}g/s) + bounty for kills. Killing
    the flow funds the next wall. If your gold flashes red, you can't afford what you just tried.</p>
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
    const levels = CONFIG.levels
      .map(
        (lv, i) => `
      <button class="fd-level" data-level="${i + 1}">
        <b>Level ${i + 1} — ${lv.name}</b>
        <small>${lv.description}</small>
      </button>`,
      )
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
