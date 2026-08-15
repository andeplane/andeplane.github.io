// Daily board rules (docs/DESIGN.md §3): day = UTC; unlimited retries; best
// result kept with attempt count; streak = finished at least one daily run
// that UTC day. All client-side (localStorage).

import { BALL_HALF, CELLS, GRID_H, GRID_W, WAVE_COUNT } from './sim/constants'
import { cellOf, clamp } from './sim/fixed'
import { fnv1a } from './sim/rng'
import { CLAIMED, DRAINING, WON, type GameState } from './sim/state'

export const EPOCH_UTC = Date.UTC(2026, 7, 15) // board #1 = 2026-08-15

export function utcDateString(now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function boardNumber(now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - EPOCH_UTC) / 86400000) + 1
}

export function dailySeed(now = new Date()): number {
  return fnv1a('wall-defence' + utcDateString(now))
}

export function msUntilNextBoard(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

export interface DailyRecord {
  attempts: number
  bestWave: number
  bestPct: number
  bestWon: boolean
  bestAttempt: number
}

const KEY_PREFIX = 'wd-daily-'
const KEY_STREAK = 'wd-streak'

export function loadDaily(date: string): DailyRecord {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + date)
    if (raw) return JSON.parse(raw) as DailyRecord
  } catch {
    // localStorage unavailable → ephemeral record
  }
  return { attempts: 0, bestWave: 0, bestPct: 0, bestWon: false, bestAttempt: 0 }
}

function saveDaily(date: string, rec: DailyRecord): void {
  try {
    localStorage.setItem(KEY_PREFIX + date, JSON.stringify(rec))
  } catch {
    // ignore
  }
}

export interface StreakInfo {
  count: number
  lastDate: string
}

export function loadStreak(): StreakInfo {
  try {
    const raw = localStorage.getItem(KEY_STREAK)
    if (raw) return JSON.parse(raw) as StreakInfo
  } catch {
    // ignore
  }
  return { count: 0, lastDate: '' }
}

function prevUtcDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d - 1))
  return utcDateString(t)
}

// Record a finished daily run. Returns the updated record + streak.
export function recordDailyRun(
  date: string,
  s: GameState,
): { rec: DailyRecord; streak: StreakInfo } {
  const rec = loadDaily(date)
  rec.attempts++
  const pct = Math.floor((s.claimedCells * 100) / CELLS)
  const won = s.status === WON
  const better =
    (won ? 1 : 0) > (rec.bestWon ? 1 : 0) ||
    (won === rec.bestWon && (s.wave > rec.bestWave || (s.wave === rec.bestWave && pct > rec.bestPct)))
  if (better || rec.bestAttempt === 0) {
    rec.bestWave = s.wave
    rec.bestPct = pct
    rec.bestWon = won
    rec.bestAttempt = rec.attempts
  }
  saveDaily(date, rec)

  const streak = loadStreak()
  if (streak.lastDate !== date) {
    streak.count = streak.lastDate === prevUtcDate(date) ? streak.count + 1 : 1
    streak.lastDate = date
    try {
      localStorage.setItem(KEY_STREAK, JSON.stringify(streak))
    } catch {
      // ignore
    }
  }
  return { rec, streak }
}

// 48×32 → 12×8 emoji blocks (exact 4×4). Precedence: ball 🟥, else claimed
// (≥9/16, DRAINING counts) 🟩, else ⬜.
export function emojiGrid(s: GameState): string {
  const ballBlocks = new Set<number>()
  for (const b of s.balls) {
    const x0 = clamp(cellOf(b.x - BALL_HALF), 0, GRID_W - 1)
    const x1 = clamp(cellOf(b.x + BALL_HALF - 1), 0, GRID_W - 1)
    const y0 = clamp(cellOf(b.y - BALL_HALF), 0, GRID_H - 1)
    const y1 = clamp(cellOf(b.y + BALL_HALF - 1), 0, GRID_H - 1)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        ballBlocks.add(Math.floor(cy / 4) * 12 + Math.floor(cx / 4))
      }
    }
  }
  const rows: string[] = []
  for (let by = 0; by < 8; by++) {
    let row = ''
    for (let bx = 0; bx < 12; bx++) {
      if (ballBlocks.has(by * 12 + bx)) {
        row += '🟥'
        continue
      }
      let claimed = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const v = s.grid[(by * 4 + dy) * GRID_W + bx * 4 + dx]
          if (v === CLAIMED || v === DRAINING) claimed++
        }
      }
      row += claimed >= 9 ? '🟩' : '⬜'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

export function shareText(s: GameState, isDaily: boolean, attempt: number): string {
  const pct = Math.floor((s.claimedCells * 100) / CELLS)
  const wave = s.status === WON ? WAVE_COUNT : s.wave
  const head = isDaily
    ? `Wall Defence #${boardNumber()} · wave ${wave}/${WAVE_COUNT} · ${pct}% · try ${attempt}`
    : `Wall Defence (free play) · wave ${wave}/${WAVE_COUNT} · ${pct}%`
  return `${head}\n${emojiGrid(s)}\nhttps://andeplane.github.io/demos/wall-defence/`
}
