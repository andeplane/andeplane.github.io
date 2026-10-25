import type { Person } from './story'
import { ageAxis, personAppearance, smooth, starPosition, storyAge, trailPath } from './story'

// Seeded points avoid a different sky on every render and need no image assets.
const stars = Array.from({ length: 240 }, (_, i) => ({
  x: ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1 * 800,
  y: ((Math.sin(i * 269.5 + 183.3) * 43758.5453) % 1 + 1) % 1 * 800,
  r: i % 13 === 0 ? 1.3 : i % 4 === 0 ? 0.8 : 0.5,
}))

export default function Sky({ people, progress, width = 800, viewHeight = 800, sceneScale = 1, id = 'sky', title = 'Family lifelines becoming a constellation' }: { people: Person[], progress: number, width?: number, viewHeight?: number, sceneScale?: number, id?: string, title?: string }) {
  const verticalScale = viewHeight * sceneScale / 800
  const fontSize = Math.min(28, 18 * 800 / width)
  const axis = ageAxis(progress)
  const age = storyAge(progress)
  const constellation = smooth((progress - 0.9) / 0.1)
  const positions = people.map((p, i) => { const point = starPosition(p, i, people.length, progress, people); return { ...point, y: point.y * verticalScale } })
  const appearances = people.map(p => personAppearance(p, progress))
  const living = people.filter(p => p.end === null)
  const paths = people.map((p, i) => trailPath(p, i, people.length, progress, people, verticalScale))
  const remembered = positions.filter((_, i) => people[i].exit !== 'fade' && people[i].end !== null)
  const constellationPath = remembered.length === 6
    ? [0, 2, 4, 5, 3, 1, 0].map((n, i) => `${i ? 'L' : 'M'}${remembered[n].x} ${remembered[n].y}`).join(' ')
    : remembered.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
  const labelBoxes: { left: number, right: number, top: number, bottom: number }[] = []
  const labels = people.map((person, i) => {
    const spaces = [...person.name.matchAll(/ /g)].map(match => match.index)
    const split = spaces.sort((a, b) => Math.abs(a - person.name.length / 2) - Math.abs(b - person.name.length / 2))[0] ?? 12
    const lines = person.name.length <= 14 ? [person.name] : [person.name.slice(0, split), person.name.slice(split + (spaces.length ? 1 : 0))]
    const passed = person.end === null && positions[i].y < 65
    if (passed) lines[0] = '↑ ' + lines[0]
    const width = Math.max(...lines.map(line => line.length)) * fontSize * .6
    const x = Math.max(width / 2 + 90, Math.min(790 - width / 2, positions[i].x))
    const lineHeight = fontSize * .95
    const height = fontSize + (lines.length - 1) * lineHeight + 6
    const fits = (cx: number, cy: number) => {
      const box = { left: cx - width / 2, right: cx + width / 2, top: cy - fontSize, bottom: cy + height - fontSize }
      return box.top >= 25 && box.bottom <= viewHeight * sceneScale - 25 && !labelBoxes.some(b => box.left < b.right + 12 && box.right > b.left - 12 && box.top < b.bottom + 10 && box.bottom > b.top - 10)
    }
    const preferredY = passed ? 35 + (Math.max(0, living.findIndex(p => p.id === person.id)) % 4) * (fontSize + 18) : positions[i].y - (fontSize + 6)
    const spacing = fontSize * 2 + 16
    // Try both sides of the actual star before moving farther away. Stacking
    // every collision upward made friends appear to belong to grandparents.
    const candidates = Array.from({ length: 12 }, (_, n) => ({ x, y: preferredY + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * spacing }))
    const grid = Array.from({ length: Math.max(70, Math.floor(viewHeight / 65) * 7) }, (_, n) => ({ x: Math.max(width / 2 + 90, Math.min(790 - width / 2, 90 + n % 7 * 110)), y: 65 + Math.floor(n / 7) * 65 }))
      .sort((a, b) => Math.hypot(a.x - x, a.y - preferredY) - Math.hypot(b.x - x, b.y - preferredY))
    const chosen = [...candidates, ...grid].find(candidate => fits(candidate.x, candidate.y)) ?? { x, y: 65 }
    const y = chosen.y
    if (positions[i].visible) labelBoxes.push({ left: chosen.x - width / 2, right: chosen.x + width / 2, top: y - fontSize, bottom: y + height - fontSize })
    return { x: chosen.x, y, lines, leader: Math.abs(y - preferredY) > spacing * 1.5 }
  })
  return <svg className="cl-sky-svg" viewBox={`0 0 800 ${viewHeight}`} role="img" aria-labelledby={`${id}-title`} xmlns="http://www.w3.org/2000/svg">
    <title id={`${id}-title`}>{title}</title>
    <defs>
      <radialGradient id={`${id}-nebula`}><stop stopColor="#1c2939" stopOpacity=".58" /><stop offset="1" stopColor="#080e1b" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-fade`} x2="0" y2="1"><stop stopColor="white" /><stop offset=".73" stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient>
      <mask id={`${id}-mask`}><rect width="800" height={viewHeight} fill={`url(#${id}-fade)`} /></mask>
      <clipPath id={`${id}-bounds`}><rect x="0" y="15" width="800" height={viewHeight - 30} /></clipPath>
      {people.map((p, i) => <radialGradient key={p.id} id={`${id}-glow-${p.id}`}><stop stopColor={appearances[i].color} stopOpacity={appearances[i].glowOpacity} /><stop offset=".35" stopColor={appearances[i].color} stopOpacity={appearances[i].glowOpacity * .3} /><stop offset="1" stopColor={appearances[i].color} stopOpacity="0" /></radialGradient>)}
    </defs>
    <ellipse cx="410" cy={viewHeight * .32} rx="480" ry={viewHeight * .55} fill={`url(#${id}-nebula)`} />
    <g fill="#d4deed">{stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y * verticalScale} r={s.r} opacity={i % 3 === 0 ? 0.6 : 0.26} />)}</g>
    <g className="cl-age-axis" opacity={axis.opacity} fontFamily="system-ui, sans-serif" fontSize={Math.min(30, 13 * 800 / width)} fill="#a4afbd">
      <path d={`M80 25V${viewHeight * .96}`} stroke="#8391a3" strokeOpacity=".25" strokeWidth=".8" />
      {axis.ticks.map(tick => <g key={tick.age} opacity={tick.age === Math.floor(axis.age) || Math.abs(tick.y - axis.y) < 24 ? 0 : 1}>
        <path d={`M71 ${tick.y * verticalScale}h9`} stroke="#a4afbd" strokeOpacity=".55" />
        <text x="64" y={tick.y * verticalScale} dy=".35em" textAnchor="end">{tick.age}</text>
      </g>)}
      <circle cx="80" cy={Math.max(25, axis.y * verticalScale)} r="3" fill="#d4c5a4" />
      <text className="cl-current-age" x="64" y={Math.max(25, axis.y * verticalScale)} dy=".35em" textAnchor="end" fill="#e1d2af">{Math.floor(axis.age)}</text>
    </g>
    <g mask={`url(#${id}-mask)`} fill="none">
      {people.map((p, i) => <g key={p.id} stroke={appearances[i].color} opacity={positions[i].opacity * (p.end === null ? 1 : (1 - constellation) * (p.exit === 'fade' ? 1 : 1 - smooth((age - p.end) / 8)))}>
        <path d={paths[i]} strokeWidth="8" opacity=".04" />
        <path d={paths[i]} strokeWidth="3.5" opacity=".2" />
        <path d={paths[i]} strokeWidth="1.5" opacity=".9" />
        {p.end === null && <path d={`M${positions[i].x} ${positions[i].y - 18}l-5 8m5-8 5 8`} strokeWidth="1.3" opacity={constellation * .8} />}
      </g>)}
    </g>
    <path d={constellationPath} fill="none" stroke="#a7b2c1" strokeWidth=".8" opacity={constellation * .38} />
    {people.map((p, i) => { const pos = positions[i]; if (!pos.visible) return null; const ended = p.end !== null && age >= p.end; const appearance = appearances[i]; return <g key={p.id} data-person={p.id} opacity={pos.opacity} aria-hidden={!pos.visible}>
      <g clipPath={`url(#${id}-bounds)`}><circle cx={pos.x} cy={pos.y} r={appearance.glowRadius} fill={`url(#${id}-glow-${p.id})`} />
      <circle cx={pos.x} cy={pos.y} r={appearance.radius} fill={appearance.core} />
      <path d={`M${pos.x - 9} ${pos.y}h18 M${pos.x} ${pos.y - 9}v18`} stroke={appearance.color} strokeWidth=".6" opacity={ended && p.exit !== 'fade' ? .65 : 0} /></g>
      {labels[i].leader && <path d={`M${pos.x} ${pos.y}L${labels[i].x} ${labels[i].y + 5}`} fill="none" stroke={appearance.label} strokeWidth=".6" opacity=".3" />}
      <text className="cl-star-label" x={labels[i].x} y={labels[i].y} fill={appearance.label} textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize={fontSize}><title>{p.name}</title>{labels[i].lines.map((line, n) => <tspan key={n} x={labels[i].x} dy={n ? fontSize * .95 : 0}>{line}</tspan>)}</text>
    </g> })}
  </svg>
}
