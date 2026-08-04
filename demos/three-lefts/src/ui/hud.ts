import * as THREE from 'three'
import type { Player } from '../player/controller'
import type { World } from '../world/world'
import type { RenderStats } from '../render/portalRenderer'
import type { AudioEngine } from '../audio/engine'
import type { Quality } from '../render/quality'

const MAP_SIZE = 220

/**
 * The notebook (PRD §4.3).
 *
 * The map is drawn by dead reckoning in the *developing map* — the player's
 * position unrolled into a single flat chart by composing portal transforms as
 * they walk. It is exactly what a careful person with a pencil would produce,
 * and because the house has non-trivial holonomy it cannot be right: around a
 * deficit loop the trail spirals into itself, and around an excess loop it
 * opens out and leaves a wedge of blank paper that is real, walkable space.
 *
 * Same function as the assertion checker in World, pointed at the player.
 */
export class Hud {
  readonly root = document.createElement('div')

  private readonly objective = document.createElement('div')
  private readonly room = document.createElement('div')
  private readonly debug = document.createElement('div')
  private readonly toast = document.createElement('div')
  private readonly mapLabel = document.createElement('div')
  private readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D

  private toastTimer = 0
  private frameTimes: number[] = []
  showDebug = false
  showMap = true

  private readonly scratch = new THREE.Vector3()

  constructor() {
    this.root.className = 'hud'

    this.objective.className = 'hud__objective'
    this.room.className = 'hud__room'
    this.debug.className = 'hud__debug'
    this.toast.className = 'hud__toast'
    this.mapLabel.className = 'hud__maplabel'
    this.mapLabel.textContent = 'Dead reckoning'

    const reticle = document.createElement('div')
    reticle.className = 'hud__reticle'

    this.canvas.className = 'hud__map'
    this.canvas.width = MAP_SIZE * 2
    this.canvas.height = MAP_SIZE * 2
    this.canvas.style.width = `${MAP_SIZE}px`
    this.canvas.style.height = `${MAP_SIZE}px`
    this.ctx = this.canvas.getContext('2d')!
    this.ctx.scale(2, 2)

    this.root.append(this.objective, this.room, this.debug, this.toast, reticle, this.mapLabel, this.canvas)
    this.setDebugVisible(false)
    this.setMapVisible(true)
  }

  setObjective(text: string) {
    this.objective.textContent = text
  }

  say(text: string, seconds = 4) {
    this.toast.textContent = text
    this.toast.classList.add('hud__toast--on')
    this.toastTimer = seconds
  }

  setDebugVisible(on: boolean) {
    this.showDebug = on
    this.debug.style.display = on ? '' : 'none'
  }

  setMapVisible(on: boolean) {
    this.showMap = on
    this.canvas.style.display = on ? '' : 'none'
    this.mapLabel.style.display = on ? '' : 'none'
  }

  update(
    dt: number,
    player: Player,
    world: World,
    stats: RenderStats,
    assertionsOk: boolean,
    audio: AudioEngine,
    quality: Quality,
  ) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast.classList.remove('hud__toast--on')
    }

    const cell = world.cell(player.cellId)
    this.room.textContent = cell.spec.label ?? cell.spec.id

    this.frameTimes.push(dt)
    if (this.frameTimes.length > 60) this.frameTimes.shift()

    if (this.showDebug) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      // Negated so the readout counts left turns positive, matching the way a
      // player narrates the loop to themselves.
      const turns = -player.turnAccumulator / (Math.PI / 2)
      const dev = player.developedPosition(this.scratch)
      this.debug.textContent =
        `${(1 / avg).toFixed(0)} fps   ${(avg * 1000).toFixed(1)} ms\n` +
        `cell        ${player.cellId}\n` +
        `local       ${player.pos.x.toFixed(2)}, ${player.pos.y.toFixed(2)}, ${player.pos.z.toFixed(2)}\n` +
        `developed   ${dev.x.toFixed(2)}, ${dev.z.toFixed(2)}\n` +
        `left turns  ${turns.toFixed(2)}\n` +
        `cell draws  ${stats.cellDraws}   portals ${stats.portalDraws}   depth ${stats.depth}\n` +
        `msaa        ${stats.msaa ? `${quality.rung.samples}x` : 'off — supersampling'}\n` +
        `quality     ${quality.label}   scale ${quality.rung.scale.toFixed(2)}   ` +
        `depth ${quality.rung.depth}   ${quality.fps.toFixed(0)}/${quality.refreshHz.toFixed(0)} fps\n` +
        `holonomy    ${assertionsOk ? 'all loops as declared' : 'ASSERTION FAILED'}\n` +
        `sound       ${audio.label}${audio.report.running ? '' : ' (idle)'}   ` +
        `rt60 ${audio.report.rt60.toFixed(2)} s   ${audio.report.voices} voices\n` +
        `nearest     ${audio.report.nearest}`
    }

    if (this.showMap) this.drawMap(player)
  }

  private drawMap(player: Player) {
    const ctx = this.ctx
    const S = MAP_SIZE
    ctx.clearRect(0, 0, S, S)

    const trail = player.trail
    if (trail.length < 2) return

    const here = player.developedPosition(this.scratch)

    // Frame the recent past around where the player currently thinks they are.
    let minX = here.x
    let maxX = here.x
    let minZ = here.z
    let maxZ = here.z
    for (const p of trail) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const pad = 2.5
    const span = Math.max(maxX - minX, maxZ - minZ, 8) + pad * 2
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const scale = (S - 16) / span
    const px = (x: number) => S / 2 + (x - cx) * scale
    const pz = (z: number) => S / 2 + (z - cz) * scale

    // Trail, fading with age so the overlap is legible rather than a scribble.
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < trail.length; i++) {
      const age = i / trail.length
      ctx.strokeStyle = `rgba(200, 165, 95, ${0.1 + 0.62 * age})`
      ctx.lineWidth = 1 + age * 1.1
      ctx.beginPath()
      ctx.moveTo(px(trail[i - 1].x), pz(trail[i - 1].z))
      ctx.lineTo(px(trail[i].x), pz(trail[i].z))
      ctx.stroke()
    }

    // Where the trail began.
    ctx.fillStyle = 'rgba(150, 190, 220, 0.85)'
    ctx.beginPath()
    ctx.arc(px(trail[0].x), pz(trail[0].z), 3, 0, Math.PI * 2)
    ctx.fill()

    // The player, pointing the way flat geometry says they are pointing.
    const yaw = player.developedYaw()
    const hx = px(here.x)
    const hz = pz(here.z)
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    ctx.fillStyle = '#efe7d8'
    ctx.beginPath()
    ctx.moveTo(hx + fx * 7, hz + fz * 7)
    ctx.lineTo(hx - fx * 4 - fz * 4, hz - fz * 4 + fx * 4)
    ctx.lineTo(hx - fx * 4 + fz * 4, hz - fz * 4 - fx * 4)
    ctx.closePath()
    ctx.fill()
  }

  reset() {
    this.frameTimes = []
    this.ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
  }
}
