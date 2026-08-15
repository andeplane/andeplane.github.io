// Browser entry: engine init → sim → renderer → fixed-step loop.
import { Scene, WebGPUEngine } from '@babylonjs/core'
import { CONFIG } from './config'
import { FixedStep } from './core/fixedstep'
import { buildMap } from './engine/map'
import { SeededRng } from './core/rng'
import { Engine } from './engine/Engine'
import { SPORES_BY_INDEX, sporesUnlockedAt } from './engine/sporeDefs'
import { TOWER_DEFS, towersForLevel, towersUnlockedAt } from './engine/towerDefs'
import { splatTowerFields } from './engine/towers'
import { stampZaps, ZapController } from './engine/zap'
import { Overlay } from './render/overlay'
import { Renderer } from './render/Renderer'
import { CELL } from './sim/core/constants'
import { GpuSim } from './sim/gpu/GpuSim'
import { Hints } from './ui/hints'
import { Hud } from './ui/hud'
import { BuildInput } from './ui/input'
import { Menu } from './ui/menu'
import { Palette, type PaletteItem } from './ui/palette'
import { saveStars, starsForWin } from './ui/progress'
import { Toasts } from './ui/toast'

// Surface console errors in the DOM so headless screenshots show them too.
function hookErrorOverlay(): void {
  const errlog = document.getElementById('errlog')!
  const append = (msg: string) => {
    if (errlog.textContent!.length < 4000) errlog.textContent += msg.slice(0, 1200) + '\n'
  }
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      append(`[${level}] ` + args.map((a) => String(a)).join(' '))
      orig(...args)
    }
  }
  window.addEventListener('error', (e) => append(`[uncaught] ${e.message}`))
  window.addEventListener('unhandledrejection', (e) => append(`[promise] ${String(e.reason)}`))
}

async function start(): Promise<void> {
  hookErrorOverlay()
  const canvas = document.getElementById('gpu') as HTMLCanvasElement
  if (!(await WebGPUEngine.IsSupportedAsync)) {
    document.getElementById('stage')!.style.display = 'none'
    document.getElementById('nogpu')!.style.display = 'block'
    return
  }

  const engine = new WebGPUEngine(canvas, { antialias: true })
  await engine.initAsync()

  const query = new URLSearchParams(location.search)
  const scene = new Scene(engine)
  scene.clearColor.set(0.008, 0.012, 0.024, 1)

  // ?level=N starts a match; no level = title screen over the living water.
  const levelParam = query.get('level')
  const levelNum = levelParam
    ? Math.min(Math.max(1, Number(levelParam)), CONFIG.levels.length)
    : null
  const level = levelNum !== null ? CONFIG.levels[levelNum - 1] : null

  const map = buildMap(CONFIG.sim.width, CONFIG.sim.height, level?.terrain)
  const sim = new GpuSim(engine, scene, map)
  const renderer = new Renderer(engine, scene, sim, canvas)

  const stage = document.getElementById('stage')!
  const menu = new Menu(stage, levelNum)

  const hud = level ? new Hud(stage, levelNum!) : null
  let surgeSeen = false
  const rng = new SeededRng(Number(query.get('seed') ?? 1))
  const match = new Engine(
    map,
    {
      onGameOver: (winner) => {
        if (winner === 'defender' && levelNum !== null && level) {
          const stars = starsForWin(match.lives, level.lives)
          saveStars(levelNum, stars)
          hud?.showGameOver(winner, match, stars, levelNum < CONFIG.levels.length)
        } else {
          hud?.showGameOver(winner, match)
        }
      },
      onBreach: () => {},
      onBuildRejected: () => hud?.flashGold(),
      onWaveStart: (wave, surge) => {
        if (surge && !surgeSeen) {
          surgeSeen = true
          hud?.announce(`Wave ${wave} — SURGE: faster current, walls strain`)
        } else {
          hud?.announce(surge ? `Wave ${wave} — surge` : `Wave ${wave}`)
        }
      },
      onWaveCleared: (wave, bonus, escaped) =>
        hud?.announce(`Wave ${wave} cleared  +${bonus}g${escaped > 0 ? `  ·  ${escaped} slipped through` : ''}`),
    },
    rng.stream('spawn'),
    level ?? undefined,
  )
  sim.setInletStates(match.inletStates)
  const availableTowers = levelNum !== null ? towersForLevel(levelNum) : []
  const input = new BuildInput(canvas, sim, match, availableTowers.map((d) => d.id))
  const overlay = new Overlay(document.getElementById('overlay') as HTMLCanvasElement, map)
  const hints = level ? new Hints(levelNum!) : null
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') match.start()
  })
  let towersVersion = -1

  // --- Build palette (Warcraft-style icon bar; hotkeys mirror input.ts) ----
  const spriteUrl = (name: string) => `${import.meta.env.BASE_URL}sprites/${name}.png`
  let palette: Palette | null = null
  if (level) {
    const items: PaletteItem[] = [
      {
        key: 'wall',
        hotkey: '1',
        label: 'Wall',
        desc: `Drag to draw. Re-routes the river itself; repaint to repair. ${CONFIG.build.wallCostPerCell}g/cell.`,
        color: '#9fb8cc',
        icon: spriteUrl('wall'),
        cost: CONFIG.build.wallCostPerCell,
        costSuffix: '/cell',
      },
      ...availableTowers.map((d, i) => ({
        key: d.id,
        hotkey: String(i + 2),
        label: d.name,
        desc: d.desc,
        color: d.color,
        icon: spriteUrl(d.sprite),
        cost: d.cost,
      })),
      {
        key: 'erase',
        hotkey: 'E',
        label: 'Erase',
        desc: 'Drag to remove your own walls (half refund). The undo verb.',
        color: '#f0abfc',
        icon: null,
        glyph: '⌫',
      },
    ]
    palette = new Palette(stage, items, (key) => input.select(key as never))
    input.onToolChange = (tool) => palette?.select(tool)
    palette.select('wall')
  }

  // --- Intro toasts: what this level just unlocked / first fields ----------
  if (level && levelNum !== null) {
    const toasts = new Toasts(stage)
    for (const d of towersUnlockedAt(levelNum)) {
      toasts.push({
        kicker: 'New tower unlocked',
        name: `${d.name} · ${d.cost}g`,
        desc: d.desc,
        icon: spriteUrl(d.sprite),
        accent: d.color,
      })
    }
    for (const d of sporesUnlockedAt(levelNum)) {
      toasts.push({
        kicker: 'New spore sighted',
        name: d.name,
        desc: d.desc,
        icon: spriteUrl(`spore-${d.id}`),
        accent: '#fb7185',
      })
    }
  }

  // --- Zap towers: CPU targeting from the enemy readback -------------------
  const zapper = new ZapController()
  const zapField = new Float32Array(map.width * map.height)
  let zapHot = false
  /** Phantoms are only targetable inside sonar coverage (mirror of the kernel). */
  const targetable = () =>
    sim.liveEnemies().filter((e) => {
      const def = SPORES_BY_INDEX[Math.round(e.type)]
      if (!def?.invisible) return true
      return match.towers.some((t) => {
        const td = TOWER_DEFS[t.type]
        return td.sonar && (t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= td.radius * td.radius
      })
    })
  const tickZaps = (): void => {
    if (zapHot) {
      // Cool the field the tick after it fired — one tick = one full hit.
      zapField.fill(0)
      sim.setZapField(zapField)
      zapHot = false
    }
    if (match.tickCount % 5 !== 0 || match.phase !== 'wave') return
    const events = zapper.tick(match.tickCount, match.towers, targetable())
    if (events.length === 0) return
    if (stampZaps(zapField, map.width, map.height, events, CONFIG.enemies.towerDamage)) {
      sim.setZapField(zapField)
      zapHot = true
      overlay.addZaps(events)
    }
  }

  // --- Death events (splitter bursts) --------------------------------------
  let deathReadInFlight = false
  const tickDeaths = (): void => {
    const count = sim.latest?.deathCount ?? 0
    if (deathReadInFlight || count <= match.deathsSeen) return
    deathReadInFlight = true
    const from = match.deathsSeen
    match.deathsSeen = count
    void sim
      .readDeathEvents(from, count)
      .then((events) => match.processDeaths(events))
      .finally(() => {
        deathReadInFlight = false
      })
  }

  const fixed = new FixedStep()
  let frames = 0
  let lastFrames = 0
  let lastProbe = 0
  // Pre-roll the carrier flow so the match doesn't open on dead water
  // (also makes headless screenshots meaningful regardless of timer source).
  // ?warmup=N overrides for headless verification of the developed state.
  let warmupTicks = Number(query.get('warmup') ?? 1200)
  const probeEnabled = query.has('probe')
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime()
    if (warmupTicks > 0 && sim.isReady()) {
      const burst = Math.min(30, warmupTicks)
      for (let i = 0; i < burst; i++) sim.tick(true)
      warmupTicks -= burst
    } else if (!level || menu.isOpen) {
      // Title screen / pause: the water keeps living, the match doesn't.
      fixed.advance(dt, () => sim.tick(true))
    } else {
      fixed.advance(dt, () => {
        const states = match.tick(sim.latest, input.jet.held)
        tickZaps()
        tickDeaths()
        const spawns = match.drainSpawns()
        if (spawns.length > 0) sim.spawnEnemies(spawns)
        if (match.tickCount % 10 === 0) sim.setInletStates(states)
        sim.tick()
      })
    }
    if (match.towersVersion !== towersVersion) {
      towersVersion = match.towersVersion
      sim.setTowerFields(splatTowerFields(map, match.towers))
    }
    palette?.update(match.gold)
    const jetOn = level !== null && input.jet.held && match.jetCharge > 0 && match.phase !== 'over'
    sim.setJet(input.jet.x, input.jet.y, jetOn ? CONFIG.jet.force : 0)
    renderer.frame(Math.max(dt, 1000 / 120))
    if (hud) {
      hud.update(match)
      hud.setTool(input.tool)
      hud.setHint(hints?.current({ match, input }) ?? null)
    }
    overlay.draw(
      match.towers,
      input.pending,
      level ? sim.liveEnemies() : [],
      level ? { x: input.jet.x, y: input.jet.y, held: input.jet.held, charge: match.jetCharge } : null,
    )
    scene.render()
    frames++
    if (probeEnabled && performance.now() - lastProbe > 5000) {
      lastProbe = performance.now()
      console.warn(
        `fps~${((frames - lastFrames) / 5).toFixed(1)} ticks=${sim.readiness()} ` +
          `wave=${match.waveIndex + 1}/${match.waveTotal} phase=${match.phase} lives=${match.lives} ` +
          `alive=${match.aliveEstimate} intake=${match.intakeFlux.toFixed(2)} obs: ${JSON.stringify(sim.latest)}`,
      )
      lastFrames = frames
    }
  })

  window.addEventListener('resize', () => {
    engine.resize()
    renderer.fitOrtho()
  })

  // --- Bot/debug API (?bot=1): programmatic play for self-play verification.
  if (query.has('bot')) {
    const cellsAlong = (fx0: number, fy0: number, fx1: number, fy1: number): number[] => {
      const x0 = fx0 * map.width
      const y0 = fy0 * map.height
      const x1 = fx1 * map.width
      const y1 = fy1 * map.height
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
      const out = new Set<number>()
      const r = CONFIG.build.brushRadius
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps
        const cy = y0 + ((y1 - y0) * s) / steps
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (x < 1 || x >= map.width - 1 || y < 1 || y >= map.height - 1) continue
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.add(y * map.width + x)
          }
        }
      }
      return [...out]
    }
    ;(window as unknown as Record<string, unknown>).fd = {
      engine: match,
      sim,
      buildTower: (type: string, fx: number, fy: number, angle = 0) =>
        match.tryBuildTower(
          type as never,
          Math.round(fx * map.width),
          Math.round(fy * map.height),
          angle,
        ) !== null,
      wallLine: (fx0: number, fy0: number, fx1: number, fy1: number) => {
        const cells = cellsAlong(fx0, fy0, fx1, fy1)
        const open = cells.filter((idx) => map.cellType[idx] === CELL.OPEN)
        const walls = cells.filter((idx) => map.cellType[idx] === CELL.WALL)
        sim.paintWall(match.tryBuildWalls(open))
        sim.paintWall(match.tryRepairWalls(walls))
      },
    }
  }
}

void start()
