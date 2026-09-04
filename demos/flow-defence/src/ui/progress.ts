// Level progression: stars earned per level, persisted in localStorage.
// A level is playable once the previous one holds at least one star.

export interface Progress {
  /** 1-based level number -> best stars earned (1..3). */
  stars: Record<number, number>
}

const KEY = 'flow-defence-progress-v1'

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Progress
      if (parsed && typeof parsed.stars === 'object') return { stars: { ...parsed.stars } }
    }
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return { stars: {} }
}

/** Record a result; keeps the best stars ever earned for the level. */
export function saveStars(levelNum: number, stars: number): Progress {
  const p = loadProgress()
  p.stars[levelNum] = Math.max(p.stars[levelNum] ?? 0, stars)
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage full/blocked — progression just won't persist.
  }
  return p
}

/** Star rating for a win: keep 90% of lives = 3, half = 2, any win = 1. */
export function starsForWin(livesLeft: number, livesStart: number): number {
  if (livesLeft >= livesStart * 0.9) return 3
  if (livesLeft >= livesStart * 0.5) return 2
  return 1
}

export function isUnlocked(levelNum: number, progress: Progress): boolean {
  return levelNum <= 1 || (progress.stars[levelNum - 1] ?? 0) >= 1
}

export function starGlyphs(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}
