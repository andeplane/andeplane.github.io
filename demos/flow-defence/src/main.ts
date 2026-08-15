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
import { Hud } from './ui/hud'
import { BuildInput } from './ui/input'

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

  const hud = new Hud(document.getElementById('stage')!)
  const match = new Engine(map, {
    onGameOver: (winner) => hud.showGameOver(winner),
    onBreach: () => {},
    onBuildRejected: () => hud.flashGold(),
  })
  // The attacker seat: AI profile from ?ai= (steady | burster | prober).
  const rng = new SeededRng(Number(query.get('seed') ?? 1))
  const profile = PROFILES[query.get('ai') ?? 'burster'] ?? PROFILES.burster
  const attacker = new AttackerAI(profile, map, rng.stream('attacker'))
  for (const s of match.inletStates) s.biomass = profile.dripLevel
  sim.setInletStates(match.inletStates)
  const input = new BuildInput(canvas, sim, match)
  const overlay = new Overlay(document.getElementById('overlay') as HTMLCanvasElement, map)
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
    } else {
      fixed.advance(dt, () => {
        const states = match.tick(sim.latest)
        attacker.tick(sim.latest, match)
        if (match.tickCount % 10 === 0) sim.setInletStates(states)
        sim.tick()
      })
    }
    if (match.towersVersion !== towersVersion) {
      towersVersion = match.towersVersion
      sim.setTowerFields(buildTowerField(map, match.towers), buildForceField(map, match.towers))
    }
    renderer.frame(Math.max(dt, 1000 / 120))
    hud.update(match)
    hud.setTool(input.tool)
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
