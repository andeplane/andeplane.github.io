import './style.css'
import * as THREE from 'three'

import { World } from './world/world'
import { Player } from './player/controller'
import { Chalk } from './player/chalk'
import { PortalRenderer } from './render/portalRenderer'
import { Pipeline } from './render/post'
import { buildEnvironment } from './render/env'
import { Quality } from './render/quality'
import { clearExtraMaterials } from './render/materials'
import { AudioEngine } from './audio/engine'
import { Input } from './core/input'
import { Hud } from './ui/hud'
import { buildMenu, buildOverlay, markCompleted } from './ui/menu'
import { LEVELS } from './levels'
import type { LevelSpec } from './world/types'
import { clamp } from './core/util'

const FIXED_DT = 1 / 120
const MAX_STEPS = 8

type Mode = 'menu' | 'playing' | 'paused' | 'complete'

class Game {
  private readonly canvas = document.getElementById('view') as HTMLCanvasElement
  private readonly ui = document.getElementById('ui') as HTMLDivElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly pipeline: Pipeline
  private readonly portals: PortalRenderer
  private readonly input: Input
  private readonly hud = new Hud()
  private readonly chalk = new Chalk()
  private readonly audio = new AudioEngine()
  private readonly quality = new Quality(window.devicePixelRatio)
  private readonly envMap: THREE.Texture

  private mode: Mode = 'menu'
  private overlay: HTMLElement | null = null

  private level: LevelSpec | null = null
  private world: World | null = null
  private player: Player | null = null
  private assertionsOk = true

  /** Cells whose lantern the player has recorded this attempt. */
  private readonly recorded = new Set<string>()

  private accumulator = 0
  private lastTime = performance.now() / 1000
  private elapsed = 0
  private fadeTarget = 1
  private goalCooldown = 0
  /** ?nopost draws the portal pass straight to the canvas, bypassing the grade. */
  private noPost = new URLSearchParams(location.search).has('nopost')

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // MSAA lives on the scene render target instead
      stencil: true,
      depth: true,
      powerPreference: 'high-performance',
    })
    this.renderer.autoClear = false
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = false

    // Prefiltered environment for soft indirect light. Generated before the
    // portal renderer installs its clipping plane, so nothing interferes.
    this.envMap = buildEnvironment(this.renderer)

    this.pipeline = new Pipeline(this.renderer)
    this.portals = new PortalRenderer(this.renderer)
    this.input = new Input(this.canvas)

    window.addEventListener('resize', () => this.resize())
    this.canvas.addEventListener('click', () => {
      // A click is the gesture the browser wants before it will let us make a
      // sound, so every one of them is offered to the audio engine.
      this.audio.resume()
      if (this.mode === 'playing') this.input.requestLock()
    })
    document.addEventListener('pointerlockchange', () => {
      if (this.mode === 'playing' && !this.input.locked) this.pause()
    })
    // A tab in the background must not keep making noise; see AudioEngine.
    document.addEventListener('visibilitychange', () => {
      this.audio.setPageVisible(document.visibilityState === 'visible')
    })
    window.addEventListener('pagehide', () => this.audio.setPageVisible(false))

    this.resize()
    this.showMenu()
    requestAnimationFrame(this.frame)
    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = this
  }

  /** Dev-only: average luminance of the scene target, to tell "nothing drew"
   * apart from "drew and the grade ate it". */
  probeScene(): { r: number; g: number; b: number } {
    const t = this.pipeline.sceneTarget
    const buf = new Uint8Array(4 * 64 * 64)
    this.renderer.readRenderTargetPixels(t, t.width / 2 - 32, t.height / 2 - 32, 64, 64, buf)
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < buf.length; i += 4) {
      r += buf[i]
      g += buf[i + 1]
      b += buf[i + 2]
    }
    const n = buf.length / 4
    return { r: r / n, g: g / n, b: b / n }
  }

  // ---------------------------------------------------------------- state --

  private clearUi() {
    this.ui.replaceChildren()
    this.overlay = null
  }

  private showMenu() {
    this.mode = 'menu'
    this.input.releaseLock()
    this.clearUi()
    this.world?.dispose()
    this.audio.detach()
    clearExtraMaterials()
    this.world = null
    this.player = null
    this.level = null
    this.ui.append(buildMenu((level) => this.start(level)))
  }

  private start(level: LevelSpec) {
    this.clearUi()
    this.level = level

    clearExtraMaterials()
    this.chalk.reset()
    const world = new World(level)
    world.scene.environment = this.envMap
    world.scene.environmentIntensity = 0.85
    this.world = world

    const check = world.checkAssertions()
    this.assertionsOk = check.ok
    // The house is only worth reasoning about if it is telling the truth, so
    // say so out loud on every load (SPEC §3.4).
    console.groupCollapsed(
      `%c${level.title} — holonomy ${check.ok ? 'verified' : 'FAILED'}`,
      `color:${check.ok ? '#8fc98f' : '#e08080'}`,
    )
    for (const line of check.report) console.log(line)
    console.groupEnd()

    this.player = new Player(world, level.spawn)
    this.player.onFootstep = (intensity) => this.audio.footstep(this.world!.cell(this.player!.cellId), intensity)
    this.audio.resume()
    this.audio.attach(world)
    this.audio.setDucked(false)
    this.recorded.clear()
    this.hud.reset()
    this.updateObjective()
    this.ui.append(this.hud.root)

    this.mode = 'playing'
    this.pipeline.fade = 0
    this.fadeTarget = 1
    this.goalCooldown = 1.5
    this.input.requestLock()
    this.hud.say(level.hint, 6)
  }

  private updateObjective() {
    const level = this.level
    if (!level) return
    const total = level.goals?.length ?? 0
    const suffix = total > 1 ? `   ·   ${this.recorded.size} / ${total} recorded` : ''
    this.hud.setObjective(level.objective + suffix)
  }

  private pause() {
    if (this.mode !== 'playing') return
    this.mode = 'paused'
    this.input.releaseLock()
    this.audio.setDucked(true)
    this.overlay = buildOverlay('Paused', this.level?.tagline ?? '', [
      { label: 'Resume', onClick: () => this.resume() },
      { label: 'Restart', onClick: () => this.start(this.level!) },
      { label: `Sound: ${this.audio.label}`, onClick: () => `Sound: ${this.audio.cycleVolume()}` },
      {
        label: `Quality: ${this.quality.label}`,
        onClick: () => {
          const label = this.quality.cycle()
          this.resize()
          return `Quality: ${label}`
        },
      },
      { label: 'Menu', onClick: () => this.showMenu() },
    ])
    this.ui.append(this.overlay)
  }

  private resume() {
    if (this.mode !== 'paused') return
    if (this.overlay) this.overlay.remove()
    this.overlay = null
    this.mode = 'playing'
    this.audio.setDucked(false)
    this.input.requestLock()
  }

  private complete() {
    if (this.mode !== 'playing' || !this.level) return
    this.mode = 'complete'
    this.input.releaseLock()
    this.audio.bell()
    markCompleted(this.level.id)

    const index = LEVELS.findIndex((l) => l.id === this.level!.id)
    const next = LEVELS[index + 1]
    const buttons = [{ label: 'Menu', onClick: () => this.showMenu() }]
    if (next) buttons.unshift({ label: `Next: ${next.title}`, onClick: () => this.start(next) })

    this.overlay = buildOverlay(this.level.title, this.level.outro ?? '', buttons)
    this.ui.append(this.overlay)
  }

  // ---------------------------------------------------------------- loop ---

  private resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    // The canvas stays at native resolution; only the scene target shrinks, and
    // the composite pass upscales it. That keeps the HUD and the final grade
    // crisp while the expensive part — fourteen cell draws of shaded geometry —
    // gets cheaper.
    const rung = this.quality.rung
    this.pipeline.resize(w, h, Math.min(window.devicePixelRatio, 2) * rung.scale, rung.samples)
    this.portals.setViewport(w, h, 72)
    this.portals.stats.msaa = this.pipeline.msaa
    this.portals.maxDepth = rung.depth
    this.portals.distantCull = rung.cull
  }

  private readonly frame = () => {
    requestAnimationFrame(this.frame)

    const now = performance.now() / 1000
    let dt = now - this.lastTime
    this.lastTime = now
    // A long stall (tab switch, shader compile) must not be simulated away in
    // one enormous burst — it would teleport the player through walls.
    dt = clamp(dt, 0, 0.25)
    this.elapsed += dt

    // Measure ourselves and climb down until the frames fit (render/quality.ts).
    if (this.quality.update(dt, this.mode === 'playing')) this.resize()

    this.pipeline.fade += (this.fadeTarget - this.pipeline.fade) * Math.min(1, dt * 3.4)

    if (this.mode === 'playing') this.simulate(dt)
    else this.input.endFrame()

    this.draw(dt)
  }

  private simulate(dt: number) {
    const player = this.player!
    const world = this.world!
    const level = this.level!

    if (this.input.consume('Escape')) {
      this.pause()
      return
    }
    if (this.input.consume('F3')) this.hud.setDebugVisible(!this.hud.showDebug)
    if (this.input.consume('KeyM')) this.hud.setMapVisible(!this.hud.showMap)
    if (this.input.consume('KeyE')) {
      const msg = this.chalk.mark(world, player)
      if (msg) this.audio.chalk()
      this.hud.say(msg ?? 'Nothing within reach to mark.', 2.5)
    }
    if (this.input.consume('KeyV')) this.hud.say(`Sound: ${this.audio.cycleVolume()}`, 1.8)

    if (this.input.locked) {
      player.look(this.input.mouseDX, this.input.mouseDY, this.input.sensitivity, this.input.invertY)
    }

    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      player.step(FIXED_DT, this.input)
      this.accumulator -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS) this.accumulator = 0

    player.updateCamera(dt)
    this.audio.update(dt, player, world)
    this.input.endFrame()

    // Lanterns.
    this.goalCooldown = Math.max(0, this.goalCooldown - dt)
    const goals = level.goals ?? []
    if (goals.length > 0 && this.goalCooldown === 0) {
      for (const goal of goals) {
        const key = `${goal.cell}|${goal.label ?? ''}`
        if (this.recorded.has(key) || player.cellId !== goal.cell) continue
        const cell = world.cell(player.cellId)
        const near = cell.goals.some(
          (g) =>
            (goal.label === undefined || g.label === goal.label) &&
            Math.hypot(g.x - player.pos.x, g.z - player.pos.z) < 1.35,
        )
        if (!near) continue

        this.recorded.add(key)
        this.audio.bell()
        this.hud.say(goal.message, 4)
        this.updateObjective()
        if (this.recorded.size === goals.length) {
          this.complete()
          return
        }
      }
    }
  }

  private draw(dt: number) {
    const r = this.renderer

    if (this.world && this.player) {
      this.portals.beginFrame()
      r.setRenderTarget(this.noPost ? null : this.pipeline.sceneTarget)
      r.setClearColor(0x05060a, 1)
      r.clear(true, true, true)
      this.portals.render(this.world, this.player.cellId, this.player.cameraMatrix)
      if (!this.noPost) this.pipeline.present(this.elapsed)

      if (this.mode === 'playing') {
        this.hud.update(dt, this.player, this.world, this.portals.stats, this.assertionsOk, this.audio, this.quality)
      }
    } else {
      r.setRenderTarget(null)
      r.setClearColor(0x0a0908, 1)
      r.clear(true, true, true)
    }
  }
}

new Game()
