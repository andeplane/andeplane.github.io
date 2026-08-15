// Browser entry: engine init → sim → renderer → fixed-step loop.
import { Scene, WebGPUEngine } from '@babylonjs/core'
import { CONFIG } from './config'
import { FixedStep } from './core/fixedstep'
import { buildMap } from './engine/map'
import { AttackerAI } from './ai/AttackerAI'
import { PROFILES } from './ai/profiles'
import { SeededRng } from './core/rng'
import { Engine } from './engine/Engine'
import { buildForceField, buildTowerField } from './engine/towers'
import { Overlay } from './render/overlay'
import { Renderer } from './render/Renderer'
import { GpuSim } from './sim/gpu/GpuSim'
import { Hints } from './ui/hints'
import { Hud } from './ui/hud'
import { BuildInput } from './ui/input'
import { Menu } from './ui/menu'

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

  const map = buildMap(CONFIG.sim.width, CONFIG.sim.height)
  const sim = new GpuSim(engine, scene, map)
  const renderer = new Renderer(engine, scene, sim, canvas)

  const stage = document.getElementById('stage')!
  // ?level=N starts a match; no level = title screen over the living water.
  const levelParam = query.get('level')
  const levelNum = levelParam
    ? Math.min(Math.max(1, Number(levelParam)), CONFIG.levels.length)
    : null
  const level = levelNum !== null ? CONFIG.levels[levelNum - 1] : null
  const menu = new Menu(stage, levelNum)

  const hud = level ? new Hud(stage, levelNum!) : null
  const match = new Engine(
    map,
    {
      onGameOver: (winner) => hud?.showGameOver(winner),
      onBreach: () => {},
      onBuildRejected: () => hud?.flashGold(),
    },
    level ?? undefined,
  )
  const rng = new SeededRng(Number(query.get('seed') ?? 1))
  const profile = PROFILES[query.get('ai') ?? level?.ai ?? 'steady'] ?? PROFILES.steady
  const attacker = new AttackerAI(profile, map, rng.stream('attacker'))
  if (level) {
    for (const s of match.inletStates) s.biomass = profile.dripLevel
  }
  sim.setInletStates(match.inletStates)
  const input = new BuildInput(canvas, sim, match)
  const overlay = new Overlay(document.getElementById('overlay') as HTMLCanvasElement, map)
  const hints = level ? new Hints(levelNum!) : null
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') match.start()
  })
  let towersVersion = -1

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
        const states = match.tick(sim.latest)
        if (match.phase === 'running') attacker.tick(sim.latest, match)
        if (match.tickCount % 10 === 0) sim.setInletStates(states)
        sim.tick()
      })
    }
    if (match.towersVersion !== towersVersion) {
      towersVersion = match.towersVersion
      sim.setTowerFields(buildTowerField(map, match.towers), buildForceField(map, match.towers))
    }
    renderer.frame(Math.max(dt, 1000 / 120))
    if (hud) {
      hud.update(match)
      hud.setTool(input.tool)
      hud.setHint(hints?.current({ match, input }) ?? null)
    }
    overlay.draw(match.towers, input.pending)
    scene.render()
    frames++
    if (probeEnabled && performance.now() - lastProbe > 5000) {
      lastProbe = performance.now()
      console.warn(`fps~${((frames - lastFrames) / 5).toFixed(1)} ticks=${sim.readiness()} obs: ${JSON.stringify(sim.latest)}`)
      lastFrames = frames
    }
  })

  window.addEventListener('resize', () => {
    engine.resize()
    renderer.fitOrtho()
  })
}

void start()
