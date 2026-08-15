// Browser entry: engine init → sim → renderer → fixed-step loop.
import { Scene, WebGPUEngine } from '@babylonjs/core'
import { CONFIG } from './config'
import { FixedStep } from './core/fixedstep'
import { buildMap } from './engine/map'
import { Renderer } from './render/Renderer'
import { GpuSim } from './sim/gpu/GpuSim'
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

  const scene = new Scene(engine)
  scene.clearColor.set(0.008, 0.012, 0.024, 1)

  const map = buildMap(CONFIG.sim.width, CONFIG.sim.height)
  const sim = new GpuSim(engine, scene, map)
  const renderer = new Renderer(engine, scene, sim, canvas)

  // M1: all inlet segments fully open (the attacker seat takes over later).
  sim.setInletOpenness([1, 1, 1])
  new BuildInput(canvas, sim)

  const fixed = new FixedStep()
  let frames = 0
  // Pre-roll the carrier flow so the match doesn't open on dead water
  // (also makes headless screenshots meaningful regardless of timer source).
  // ?warmup=N overrides for headless verification of the developed state.
  const query = new URLSearchParams(location.search)
  let warmupTicks = Number(query.get('warmup') ?? 1200)
  const probeEnabled = query.has('probe')
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime()
    if (warmupTicks > 0 && sim.isReady()) {
      const burst = Math.min(30, warmupTicks)
      for (let i = 0; i < burst; i++) sim.tick()
      warmupTicks -= burst
    } else {
      fixed.advance(dt, () => sim.tick())
    }
    renderer.frame(Math.max(dt, 1000 / 120))
    scene.render()
    frames++
    if (probeEnabled && frames % 600 === 0) {
      void sim.debugProbe().then((p) => console.warn(`probe(${sim.readiness()}): ${p}`))
    }
  })

  window.addEventListener('resize', () => {
    engine.resize()
    renderer.fitOrtho()
  })
}

void start()
