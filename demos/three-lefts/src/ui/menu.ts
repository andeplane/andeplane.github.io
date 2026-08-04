import { LEVELS } from '../levels'
import type { LevelSpec } from '../world/types'

const STORE_KEY = 'three-lefts.completed'

export function completedLevels(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function markCompleted(id: string) {
  const set = completedLevels()
  set.add(id)
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]))
  } catch {
    /* private browsing; progress just will not persist */
  }
}

export function buildMenu(onPick: (level: LevelSpec) => void): HTMLElement {
  const done = completedLevels()
  const root = document.createElement('div')
  root.className = 'menu'

  const title = document.createElement('h1')
  title.className = 'menu__title'
  title.textContent = 'Three Lefts'

  const sub = document.createElement('p')
  sub.className = 'menu__sub'
  sub.textContent = 'Three houses that are honest about being impossible.'

  const cards = document.createElement('div')
  cards.className = 'cards'

  LEVELS.forEach((level, i) => {
    const card = document.createElement('button')
    card.className = 'card'
    card.type = 'button'

    const no = document.createElement('div')
    no.className = 'card__no'
    no.textContent = `Level ${i + 1}`

    const name = document.createElement('div')
    name.className = 'card__title'
    name.textContent = level.title

    const tagline = document.createElement('div')
    tagline.className = 'card__tagline'
    tagline.textContent = level.tagline

    const blurb = document.createElement('div')
    blurb.className = 'card__blurb'
    blurb.textContent = level.blurb

    card.append(no, name, tagline, blurb)

    if (done.has(level.id)) {
      const badge = document.createElement('div')
      badge.className = 'card__done'
      badge.textContent = 'Solved'
      card.append(badge)
    }

    card.addEventListener('click', () => onPick(level))
    cards.append(card)
  })

  const foot = document.createElement('p')
  foot.className = 'menu__foot'
  foot.innerHTML =
    '<kbd>W A S D</kbd> walk &nbsp; <kbd>Shift</kbd> run &nbsp; <kbd>Mouse</kbd> look &nbsp; ' +
    '<kbd>E</kbd> chalk &nbsp; <kbd>M</kbd> notebook &nbsp; <kbd>V</kbd> sound &nbsp; ' +
    '<kbd>F3</kbd> instruments &nbsp; <kbd>Esc</kbd> pause<br>' +
    'Headphones are worth it: sound travels these houses the same crooked way you do.<br>' +
    'Nothing in these houses changes when you are not looking. ' +
    'Every strange thing is fixed, repeatable, and yours to work out.'

  root.append(title, sub, cards, foot)
  return root
}

export function buildOverlay(
  heading: string,
  body: string,
  /** A handler may return a new label, for buttons that cycle through settings. */
  buttons: { label: string; onClick: () => string | void }[],
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'overlay'

  const h = document.createElement('h2')
  h.textContent = heading

  const p = document.createElement('p')
  p.textContent = body

  const row = document.createElement('div')
  row.className = 'btn-row'
  for (const b of buttons) {
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.type = 'button'
    btn.textContent = b.label
    btn.addEventListener('click', () => {
      const relabel = b.onClick()
      if (typeof relabel === 'string') btn.textContent = relabel
    })
    row.append(btn)
  }

  root.append(h, p, row)
  return root
}
