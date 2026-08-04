import * as THREE from 'three'
import type { World } from '../world/world'
import type { BuiltCell } from '../world/buildCell'
import type { Player } from '../player/controller'
import { STYLES } from '../world/types'
import { clamp } from '../core/util'
import { propagate } from './propagation'
import { acousticsOf, makeImpulse, makeNoise, FOOT_TUNING, type RoomAcoustics } from './synth'

const STORE_KEY = 'three-lefts.volume'
const PROPAGATION_HZ = 20
const REVERB_CROSSFADE = 0.35

export const VOLUME_STEPS = [
  { gain: 0.9, label: 'full' },
  { gain: 0.38, label: 'quiet' },
  { gain: 0, label: 'off' },
]

interface EmitterDef {
  cellId: string
  pos: THREE.Vector3
}

interface Voice {
  def: EmitterDef
  occlusion: BiquadFilterNode
  panner: PannerNode
  level: GainNode
  send: GainNode
  sources: AudioScheduledSourceNode[]
}

/**
 * The game's audio.
 *
 * Two decisions carry the whole file.
 *
 * **The listener never moves.** It sits at the origin looking down −Z, for
 * good, and every sound is placed in *head coordinates* instead. This is the
 * audio restatement of "there is no world space" (SPEC §2): a cell-local
 * position is meaningless the moment you cross a portal, and so is a listener
 * position expressed in one. Where a sound is relative to your head, on the
 * other hand, is continuous across a doorway — the portal transform rotates the
 * source and the head by the same amount, and the difference is untouched. It
 * is the only frame in which smoothing a panner does not glitch on traversal.
 *
 * **Sound travels the portal graph.** Distance is path length through doorways,
 * direction is the acoustic image (see `propagation.ts`), and both come out of
 * the same transforms that draw and walk the house.
 *
 * Everything is synthesised — see `synth.ts` — so there are no assets and the
 * reverb of a room is computed from the room's own measurements rather than
 * chosen. A room that measures small cannot sound large by accident.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverbBus: GainNode | null = null
  private convolvers: ConvolverNode[] = []
  private convGains: GainNode[] = []
  private activeConv = 0
  private noise: AudioBuffer | null = null
  private readonly irCache = new Map<string, AudioBuffer>()

  private world: World | null = null
  private emitters: EmitterDef[] = []
  private voices: Voice[] = []

  private roomKey = ''
  private currentCell = ''
  private propTimer = 0
  private ducked = false

  step = loadStep()

  /**
   * `?mute` — no audio context is ever created, so the page is guaranteed
   * silent no matter what else happens. For automated testing, where a tab left
   * open behind other windows is otherwise an untraceable noise on someone's
   * machine.
   */
  private readonly forcedMute = new URLSearchParams(location.search).has('mute')

  /** What the ears currently believe, for the F3 instruments panel. */
  readonly report = {
    running: false,
    voices: 0,
    rt60: 0,
    nearest: '',
  }

  private readonly tmp = {
    eye: new THREE.Vector3(),
    at: new THREE.Vector3(),
    head: new THREE.Vector3(),
    headInv: new THREE.Matrix4(),
  }

  get label(): string {
    return this.forcedMute ? 'off (?mute)' : VOLUME_STEPS[this.step].label
  }

  get enabled(): boolean {
    return !this.forcedMute && VOLUME_STEPS[this.step].gain > 0
  }

  /** Cycles full → quiet → off. Returns the new label, for the caller's toast. */
  cycleVolume(): string {
    this.step = (this.step + 1) % VOLUME_STEPS.length
    try {
      localStorage.setItem(STORE_KEY, String(this.step))
    } catch {
      /* private browsing; the setting just will not persist */
    }
    this.applyMasterGain(0.08)
    return this.label
  }

  /**
   * Must be called from a user gesture. The context is built here rather than
   * in the constructor so the browser never has to suspend one.
   */
  resume() {
    if (this.forcedMute) return
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' })
      } catch {
        return
      }
      this.build()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.world && this.voices.length === 0) this.spawnVoices()
  }

  private build() {
    const ctx = this.ctx!
    this.noise = makeNoise(ctx)

    // The listener is nailed to the origin facing −Z and is never touched
    // again; see the class comment for why moving it would be meaningless.
    const listener = ctx.listener
    if (listener.positionX) {
      listener.positionX.value = 0
      listener.positionY.value = 0
      listener.positionZ.value = 0
      listener.forwardX.value = 0
      listener.forwardY.value = 0
      listener.forwardZ.value = -1
      listener.upX.value = 0
      listener.upY.value = 1
      listener.upZ.value = 0
    } else {
      const legacy = listener as unknown as {
        setPosition(x: number, y: number, z: number): void
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void
      }
      legacy.setPosition(0, 0, 0)
      legacy.setOrientation(0, 0, -1, 0, 1, 0)
    }

    // A safety net for the cathedral tail under a run of footsteps — not an
    // effect. The first pass sat on everything and pumped.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -2
    limiter.knee.value = 4
    limiter.ratio.value = 4
    limiter.attack.value = 0.004
    limiter.release.value = 0.25
    limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(limiter)

    this.reverbBus = ctx.createGain()
    this.reverbBus.gain.value = 1

    // Two convolvers so a cell change crossfades rather than cuts. Cutting a
    // reverb tail is audible, and an audible seam at a doorway is exactly what
    // this game cannot afford (PRD P4).
    for (let i = 0; i < 2; i++) {
      const conv = ctx.createConvolver()
      conv.normalize = false
      const gain = ctx.createGain()
      gain.gain.value = i === 0 ? 1 : 0
      this.reverbBus.connect(conv)
      conv.connect(gain)
      gain.connect(this.master)
      this.convolvers.push(conv)
      this.convGains.push(gain)
    }

    // There is deliberately no room tone. An always-on noise bed is the single
    // easiest way to make a quiet game sound broken, and the reverb tail
    // already tells the player how big the room is whenever they make a sound.

    this.applyMasterGain(0.5)
  }

  private applyMasterGain(tau: number) {
    if (!this.ctx || !this.master) return
    const target = VOLUME_STEPS[this.step].gain * (this.ducked ? 0.16 : 1)
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, tau)
  }

  /** Fades the whole mix down without stopping it — for pause and menus. */
  setDucked(ducked: boolean) {
    this.ducked = ducked
    this.applyMasterGain(0.12)
  }

  /**
   * Silence the context outright when the page is not visible.
   *
   * Ducking is not enough: a tab left open in the background keeps eleven
   * looping voices running forever, and the owner of the machine has no idea
   * which of forty tabs is making the noise. Suspending stops the clock.
   */
  setPageVisible(visible: boolean) {
    const ctx = this.ctx
    if (!ctx || ctx.state === 'closed') return
    if (visible) {
      if (ctx.state === 'suspended') void ctx.resume()
    } else if (ctx.state === 'running') {
      void ctx.suspend()
    }
  }

  // ------------------------------------------------------------- levels ----

  attach(world: World) {
    this.detachVoices()
    this.world = world
    this.emitters = collectEmitters(world)
    this.roomKey = ''
    this.currentCell = ''
    this.propTimer = 1
    if (this.ctx) this.spawnVoices()
  }

  detach() {
    this.detachVoices()
    this.world = null
    this.emitters = []
  }

  private detachVoices() {
    for (const voice of this.voices) {
      for (const source of voice.sources) {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
      }
      voice.level.disconnect()
      voice.send.disconnect()
      voice.panner.disconnect()
      voice.occlusion.disconnect()
    }
    this.voices = []
  }

  private spawnVoices() {
    for (const def of this.emitters) this.voices.push(this.makeVoice(def))
  }

  private makeVoice(def: EmitterDef): Voice {
    const ctx = this.ctx!

    // Occlusion: everything a room away is heard through a wall, and a wall is
    // a lowpass filter. Set per frame from the hop count.
    const occlusion = ctx.createBiquadFilter()
    occlusion.type = 'lowpass'
    occlusion.frequency.value = 18000
    occlusion.Q.value = 0.4

    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 2
    panner.rolloffFactor = 1
    panner.maxDistance = 60

    const level = ctx.createGain()
    level.gain.value = 0
    const send = ctx.createGain()
    send.gain.value = 0.2

    occlusion.connect(panner)
    panner.connect(level)
    level.connect(this.master!)
    occlusion.connect(send)
    send.connect(this.reverbBus!)

    const sources: AudioScheduledSourceNode[] = []

    // The lantern sings rather than hisses.
    //
    // Filtered noise was the wrong instinct twice over: it sounds like a fault,
    // and noise localises badly, which matters because this is the one sound
    // that has to be *findable* — it is the objective, and the proof that the
    // three grilles in Three Lefts look into one room. Three quiet sine
    // partials in a 2:3:4 ratio sit where the ear places direction well, and a
    // pair of slow, mutually prime tremolos keeps it breathing without ever
    // settling into an obvious loop.
    const body = ctx.createGain()
    body.gain.value = 1
    body.connect(occlusion)

    for (const [freq, gain] of [
      [330, 0.075],
      [495, 0.042],
      [660, 0.02],
    ]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      // A few cents flat on the upper partials: exact ratios ring like a test
      // tone, a little detuning reads as something physical and warm.
      osc.detune.value = freq === 330 ? 0 : -6
      const g = ctx.createGain()
      g.gain.value = gain
      osc.connect(g)
      g.connect(body)
      osc.start()
      sources.push(osc)
    }

    for (const [rate, depth] of [
      [0.17, 0.3],
      [0.29, 0.16],
    ]) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = rate
      const depthGain = ctx.createGain()
      depthGain.gain.value = depth
      lfo.connect(depthGain)
      depthGain.connect(body.gain)
      lfo.start()
      sources.push(lfo)
    }

    return { def, occlusion, panner, level, send, sources }
  }

  // -------------------------------------------------------------- frame ----

  update(dt: number, player: Player, world: World) {
    const ctx = this.ctx
    if (!ctx || !this.master || this.world !== world) return

    if (player.cellId !== this.currentCell) {
      this.currentCell = player.cellId
      this.setRoom(world.cell(player.cellId))
    }

    this.propTimer += dt
    if (this.propTimer < 1 / PROPAGATION_HZ) return
    this.propTimer = 0

    // The head frame. `headInv` takes a point in the player's cell chart to
    // where it is relative to the player's eyes and facing — which is the only
    // thing a pair of ears can actually be told.
    this.tmp.eye.setFromMatrixPosition(player.cameraMatrix)
    this.tmp.headInv.copy(player.cameraMatrix).invert()

    const images = propagate(world, player.cellId, this.tmp.eye)

    this.report.running = ctx.state === 'running'
    this.report.voices = this.voices.length
    let nearestDistance = Infinity
    this.report.nearest = 'nothing in earshot'

    for (const voice of this.voices) {
      const image = images.get(voice.def.cellId)
      if (!image) {
        voice.level.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
        continue
      }

      // Where the source is, in the listener's chart, then in head coordinates.
      this.tmp.at.copy(voice.def.pos).applyMatrix4(image.toListener)
      const distance = image.pathLength + this.tmp.at.distanceTo(image.gate)
      this.tmp.head.copy(this.tmp.at).applyMatrix4(this.tmp.headInv)

      // Direction is the image's, not the doorway's. That is deliberate: the
      // house's claim is that the room really is over there, and the ear should
      // make the same claim the eye does through a grille.
      const length = this.tmp.head.length()
      if (length > 1e-4) this.tmp.head.multiplyScalar(Math.max(distance, 0.3) / length)
      else this.tmp.head.set(0, 0, -0.3)

      if (distance < nearestDistance) {
        nearestDistance = distance
        // Bearing is clockwise from straight ahead, which is how a person would
        // say it: "the lantern is 40° to my right, four metres through a wall."
        const bearing = (Math.atan2(this.tmp.head.x, -this.tmp.head.z) * 180) / Math.PI
        this.report.nearest =
          `lantern in ${voice.def.cellId} — ${distance.toFixed(1)} m, ` +
          `${bearing >= 0 ? '+' : ''}${bearing.toFixed(0)}°, ` +
          `${image.hops} ${image.hops === 1 ? 'doorway' : 'doorways'}${image.openPath ? '' : ' (barred)'}`
      }

      setPannerPosition(voice.panner, this.tmp.head, ctx, 0.06)

      const muffle = image.openPath ? 1 : 0.45
      const cutoff = clamp(18000 * Math.pow(0.3, image.hops) * muffle, 260, 18000)
      voice.occlusion.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.08)

      voice.level.gain.setTargetAtTime(0.85, ctx.currentTime, 0.12)
      // The further round the graph a sound comes, the more of it arrives as
      // reflection rather than as a straight line.
      voice.send.gain.setTargetAtTime(clamp(0.18 + image.hops * 0.22, 0.18, 0.8), ctx.currentTime, 0.15)
    }
  }

  private setRoom(cell: BuiltCell) {
    const ctx = this.ctx
    if (!ctx) return
    const room = acousticsOf(cell.spec.size, STYLES[cell.spec.style].floorMat)
    this.report.rt60 = room.rt60
    if (room.key === this.roomKey) return
    this.roomKey = room.key

    const next = (this.activeConv + 1) % 2
    this.convolvers[next].buffer = this.impulse(room)
    const now = ctx.currentTime
    this.convGains[next].gain.setTargetAtTime(1, now, REVERB_CROSSFADE / 3)
    this.convGains[this.activeConv].gain.setTargetAtTime(0, now, REVERB_CROSSFADE / 3)
    this.activeConv = next
  }

  private impulse(room: RoomAcoustics): AudioBuffer {
    const cached = this.irCache.get(room.key)
    if (cached) return cached
    const made = makeImpulse(this.ctx!, room)
    this.irCache.set(room.key, made)
    return made
  }

  // ------------------------------------------------------------ one-shots --

  /** A pace, coloured by the floor it lands on (PRD §4.4). */
  footstep(cell: BuiltCell, intensity: number) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const tune = FOOT_TUNING[cell.spec.style] ?? FOOT_TUNING.hall
    const room = acousticsOf(cell.spec.size, STYLES[cell.spec.style].floorMat)
    const now = ctx.currentTime + 0.001
    const gain = 0.24 * tune.level * (0.55 + 0.45 * intensity) * (0.88 + Math.random() * 0.24)

    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(this.master)
    const send = ctx.createGain()
    send.gain.value = room.send
    out.connect(send)
    send.connect(this.reverbBus!)

    // Surface: a noise burst through a resonance at the floor's own pitch.
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = tune.tone * (0.92 + Math.random() * 0.16)
    band.Q.value = tune.q
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, now + tune.decay)
    src.connect(band)
    band.connect(env)
    env.connect(out)
    src.start(now, Math.random() * 3, tune.decay + 0.05)

    // Body: the weight of a person arriving on a floor.
    const thump = ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(tune.body * 1.5, now)
    thump.frequency.exponentialRampToValueAtTime(tune.body * 0.7, now + 0.09)
    const thumpEnv = ctx.createGain()
    thumpEnv.gain.setValueAtTime(0.0001, now)
    thumpEnv.gain.exponentialRampToValueAtTime(gain * 0.7, now + 0.006)
    thumpEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    thump.connect(thumpEnv)
    thumpEnv.connect(out)
    thump.start(now)
    thump.stop(now + 0.12)

    const tail = now + Math.max(tune.decay, 0.12) + 0.1
    setTimeout(() => {
      out.disconnect()
      send.disconnect()
    }, (tail - ctx.currentTime + 0.2) * 1000)
  }

  /** Chalk on plaster. */
  chalk() {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const now = ctx.currentTime + 0.001
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.setValueAtTime(1500, now)
    band.frequency.linearRampToValueAtTime(3400, now + 0.22)
    band.Q.value = 2.2
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    src.connect(band)
    band.connect(env)
    env.connect(this.master)
    const send = ctx.createGain()
    send.gain.value = 0.25
    env.connect(send)
    send.connect(this.reverbBus!)
    src.start(now, Math.random() * 3, 0.34)
    setTimeout(() => {
      env.disconnect()
      send.disconnect()
    }, 700)
  }

  /** The lantern, reached. */
  bell() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const now = ctx.currentTime + 0.02
    const partials: [number, number, number][] = [
      [196, 0.18, 3.4],
      [196 * 2.76, 0.09, 1.9],
      [196 * 5.4, 0.04, 1.1],
    ]
    for (const [freq, peak, decay] of partials) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, now)
      env.gain.exponentialRampToValueAtTime(peak, now + 0.01)
      env.gain.exponentialRampToValueAtTime(0.0001, now + decay)
      osc.connect(env)
      env.connect(this.master)
      const send = ctx.createGain()
      send.gain.value = 0.4
      env.connect(send)
      send.connect(this.reverbBus!)
      osc.start(now)
      osc.stop(now + decay + 0.05)
      setTimeout(
        () => {
          env.disconnect()
          send.disconnect()
        },
        (decay + 0.4) * 1000,
      )
    }
  }
}

// ---------------------------------------------------------------- helpers --

/**
 * Only lanterns make a sound.
 *
 * The first pass also gave every wall lamp a hiss and every room an air tone,
 * which came to eleven continuous noise sources and sounded like a broken
 * radiator. PRD §8 asks for near-silence and means it. A lamp is a light; it
 * has no business being audible, and removing it costs nothing and gives back
 * the one sound that carries information.
 */
function collectEmitters(world: World): EmitterDef[] {
  const out: EmitterDef[] = []
  for (const spec of world.spec.cells) {
    const cell = world.cell(spec.id)
    for (const prop of spec.props ?? []) {
      if (prop.kind === 'pedestal' && (prop.item ?? 'lantern') === 'lantern') {
        out.push({ cellId: spec.id, pos: new THREE.Vector3(prop.x, cell.floorY(prop.x, prop.z) + 1.15, prop.z) })
      }
    }
  }
  return out
}

function setPannerPosition(panner: PannerNode, p: THREE.Vector3, ctx: BaseAudioContext, tau: number) {
  if (panner.positionX) {
    panner.positionX.setTargetAtTime(p.x, ctx.currentTime, tau)
    panner.positionY.setTargetAtTime(p.y, ctx.currentTime, tau)
    panner.positionZ.setTargetAtTime(p.z, ctx.currentTime, tau)
  } else {
    ;(panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z)
  }
}

function loadStep(): number {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const n = raw === null ? 0 : Number(raw)
    return Number.isInteger(n) && n >= 0 && n < VOLUME_STEPS.length ? n : 0
  } catch {
    return 0
  }
}
