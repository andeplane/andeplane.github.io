import { clamp } from '../core/util'

/**
 * Everything the game makes a sound with is generated here, from noise and
 * arithmetic. No audio files: the house has eight room styles and three levels,
 * and a table of numbers keeps them all tellable apart by ear without shipping
 * a sample library.
 */

/** Deterministic RNG, so a given room's reverb is the same room every time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A few seconds of stereo noise, reused by every voice in the game. */
export function makeNoise(ctx: BaseAudioContext, seconds = 4): AudioBuffer {
  const rate = ctx.sampleRate
  const buf = ctx.createBuffer(2, Math.floor(rate * seconds), rate)
  const rand = mulberry32(0x51ee7)
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch)
    // A gentle tilt towards low frequencies. White noise reads as hiss; real
    // rooms, flames, and footsteps do not.
    let lp = 0
    for (let i = 0; i < out.length; i++) {
      const white = rand() * 2 - 1
      lp += (white - lp) * 0.28
      out[i] = white * 0.55 + lp * 1.4
    }
  }
  return buf
}

export interface RoomAcoustics {
  /** Sabine reverberation time, seconds. */
  rt60: number
  /** One-pole coefficient on the tail: low is dark and woody, high is stony. */
  damping: number
  /** How much of every voice in the room is sent to the tail. */
  send: number
  /** Interior dimensions, used to place the early reflections. */
  size: [number, number, number]
  /** Cheap identity for caching, since many cells are acoustically identical. */
  key: string
}

/**
 * Room acoustics from room geometry, via Sabine's equation:
 *
 *     RT60 = 0.161 · V / A
 *
 * with `A` the total absorption in square metres. It is the same reason the
 * cathedral in The Long Gallery rings for three seconds and the ring rooms in
 * Three Lefts are almost dead: nobody authored either number, the rooms are
 * just those sizes. A room that measures small and *sounds* large would be a
 * lie, and the whole game rests on the house not telling any (PRD P1).
 */
export function acousticsOf(size: [number, number, number], floorMat: 'wood' | 'stone'): RoomAcoustics {
  const [w, h, d] = size
  const volume = w * h * d
  const floorArea = w * d
  const wallArea = 2 * (w + d) * h

  // Mid-band absorption coefficients for a furnished, plastered interior.
  const aFloor = floorMat === 'stone' ? 0.07 : 0.15
  const absorption = floorArea * aFloor + floorArea * 0.12 + wallArea * 0.14
  const rt60 = clamp((0.161 * volume) / absorption, 0.25, 3.2)

  return {
    rt60,
    damping: floorMat === 'stone' ? 0.42 : 0.24,
    send: clamp(0.1 + rt60 * 0.16, 0.1, 0.55),
    size,
    key: `${floorMat}:${rt60.toFixed(2)}:${w.toFixed(1)}x${h.toFixed(1)}x${d.toFixed(1)}`,
  }
}

const SPEED_OF_SOUND = 343

/** A stereo impulse response: a handful of early reflections, then a tail. */
export function makeImpulse(ctx: BaseAudioContext, room: RoomAcoustics): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.max(64, Math.floor(rate * room.rt60))
  const buf = ctx.createBuffer(2, length, rate)
  const rand = mulberry32(hash(room.key))

  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      // Decay to silence at rt60, with a 6 ms build-up so the tail sounds like
      // a room filling rather than a shotgun.
      const env = Math.pow(1 - t, 2.4) * Math.min(1, i / (rate * 0.006))
      const white = rand() * 2 - 1
      lp += (white - lp) * (1 - room.damping)
      out[i] = lp * env
    }

    // Early reflections off the six surfaces. These are what make a corridor
    // sound like a corridor before the diffuse tail has said anything.
    for (const dim of room.size) {
      for (let order = 1; order <= 3; order++) {
        const delay = Math.floor(((dim * order) / SPEED_OF_SOUND) * rate)
        if (delay >= length) break
        const sign = rand() < 0.5 ? -1 : 1
        out[delay] += sign * 0.42 * Math.pow(0.55, order - 1)
      }
    }
  }

  normalize(buf, 0.06)
  return buf
}

/** Match every room's tail to the same energy, so rooms differ in character
 * rather than in volume. */
function normalize(buf: AudioBuffer, targetRms: number) {
  let sum = 0
  let count = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    count += data.length
  }
  const rms = Math.sqrt(sum / Math.max(1, count))
  if (rms < 1e-9) return
  const g = targetRms / rms
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i] *= g
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Per-style footstep tuning.
 *
 * PRD §4.4 asks every room to be individually memorable, and cartography needs
 * room identification that survives not looking at the room. Two floor
 * materials would give two footsteps; eight styles give eight, and a player can
 * hear which wing they are in from the first pace.
 */
export interface FootTuning {
  /** Frequency of the body thump, Hz. Heavy joists are low. */
  body: number
  /** Centre of the surface noise, Hz. Stone is bright, carpet-over-board dull. */
  tone: number
  q: number
  decay: number
  level: number
}

export const FOOT_TUNING: Record<string, FootTuning> = {
  hall: { body: 88, tone: 380, q: 1.1, decay: 0.12, level: 1.0 },
  green: { body: 96, tone: 300, q: 1.5, decay: 0.1, level: 0.86 },
  oxblood: { body: 78, tone: 250, q: 1.6, decay: 0.13, level: 0.9 },
  gallery: { body: 70, tone: 1250, q: 0.8, decay: 0.18, level: 1.05 },
  stone: { body: 64, tone: 1650, q: 0.7, decay: 0.21, level: 1.1 },
  cellar: { body: 58, tone: 900, q: 0.9, decay: 0.16, level: 0.95 },
  attic: { body: 108, tone: 440, q: 1.7, decay: 0.09, level: 0.82 },
  chapel: { body: 72, tone: 1450, q: 0.85, decay: 0.24, level: 1.0 },
}
