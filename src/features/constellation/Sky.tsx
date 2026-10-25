import type { Person } from './story'
import { smooth, starPosition, storyAge, trailPath } from './story'

// Seeded points avoid a different sky on every render and need no image assets.
const stars = Array.from({ length: 240 }, (_, i) => ({
  x: ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1 * 800,
  y: ((Math.sin(i * 269.5 + 183.3) * 43758.5453) % 1 + 1) % 1 * 800,
  r: i % 13 === 0 ? 1.3 : i % 4 === 0 ? 0.8 : 0.5,
}))

export default function Sky({ people, progress, id = 'sky', title = 'Family lifelines becoming a constellation' }: { people: Person[], progress: number, id?: string, title?: string }) {
  const age = storyAge(progress)
  const constellation = smooth((progress - 0.9) / 0.1)
  const positions = people.map((p, i) => starPosition(p, i, people.length, progress))
  const labelBoxes: { left: number, right: number, top: number, bottom: number }[] = []
  const labels = people.map((person, i) => {
    const lines = person.name.match(/.{1,12}/g) ?? ['']
    const width = Math.max(...lines.map(line => line.length)) * 14
    const x = Math.max(width / 2 + 10, Math.min(790 - width / 2, positions[i].x))
    let y = positions[i].y - 27
    for (let attempt = 0; attempt < 12; attempt++) {
      const box = { left: x - width / 2, right: x + width / 2, top: y - 25, bottom: y + (lines.length - 1) * 25 + 6 }
      const collision = labelBoxes.find(b => box.left < b.right + 12 && box.right > b.left - 12 && box.top < b.bottom + 10 && box.bottom > b.top - 10)
      if (!collision) { if (positions[i].visible) labelBoxes.push(box); break }
      y = collision.top - (lines.length - 1) * 25 - 16
    }
    return { x, y, lines }
  })
  return <svg className="cl-sky-svg" viewBox="0 0 800 800" role="img" aria-labelledby={`${id}-title`} xmlns="http://www.w3.org/2000/svg">
    <title id={`${id}-title`}>{title}</title>
    <defs>
      <radialGradient id={`${id}-nebula`}><stop stopColor="#222b50" stopOpacity=".58" /><stop offset="1" stopColor="#080e1b" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-fade`} x2="0" y2="1"><stop stopColor="white" /><stop offset=".73" stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient>
      <mask id={`${id}-mask`}><rect width="800" height="800" fill={`url(#${id}-fade)`} /></mask>
      {people.map(p => <radialGradient key={p.id} id={`${id}-glow-${p.id}`}><stop stopColor={p.color} stopOpacity=".4" /><stop offset=".35" stopColor={p.color} stopOpacity=".12" /><stop offset="1" stopColor={p.color} stopOpacity="0" /></radialGradient>)}
    </defs>
    <ellipse cx="410" cy="250" rx="480" ry="420" fill={`url(#${id}-nebula)`} />
    <g fill="#d4deed">{stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={i % 3 === 0 ? 0.6 : 0.26} />)}</g>
    <g opacity={1 - constellation} fontFamily="system-ui, sans-serif" fontSize="11" fill="#a0aec3">
      <path d="M33 90V720" stroke="#a0aec3" strokeOpacity=".18" />
      {[0, 10, 20, 30, 40, 50, 60, 70, 80].map(t => { const y = 510 + (age - t) * 7; return y > 90 && y < 720 ? <g key={t}><path d={`M28 ${y}h5`} stroke="#a0aec3" strokeOpacity=".4" /><text x="21" y={y + 4} textAnchor="end">{t}</text></g> : null })}
      <circle cx="33" cy="510" r="3" fill="#f7ce85" />
      <text x="17" y="75" letterSpacing="2" fontSize="9">AGE</text>
    </g>
    <g mask={`url(#${id}-mask)`} opacity={1 - constellation} fill="none">
      {people.map((p, i) => <g key={p.id} stroke={p.color}>
        <path d={trailPath(p, i, people.length, progress)} strokeWidth="8" opacity=".035" />
        <path d={trailPath(p, i, people.length, progress)} strokeWidth="3.5" opacity=".16" />
        <path d={trailPath(p, i, people.length, progress)} strokeWidth="1.3" opacity=".85" />
      </g>)}
    </g>
    <path d={`${positions.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} Z`} fill="none" stroke="#e0dbce" strokeWidth=".8" opacity={constellation * 0.5} />
    {people.map((p, i) => { const pos = positions[i]; const ended = p.end !== null && age >= p.end; return <g key={p.id} opacity={pos.visible ? 1 : 0}>
      <circle cx={pos.x} cy={pos.y} r="36" fill={`url(#${id}-glow-${p.id})`} />
      <circle cx={pos.x} cy={pos.y} r="3.5" fill="#fff8e9" />
      <path d={`M${pos.x - 9} ${pos.y}h18 M${pos.x} ${pos.y - 9}v18`} stroke={p.color} strokeWidth=".7" opacity={ended ? 0.9 : constellation} />
      <text className="cl-star-label" x={labels[i].x} y={labels[i].y} fill={p.color} textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="25"><title>{p.name}</title>{labels[i].lines.map((line, n) => <tspan key={n} x={labels[i].x} dy={n ? 25 : 0}>{line}</tspan>)}</text>
    </g> })}
    <text x="400" y="704" textAnchor="middle" fill="#d7c6a2" fontFamily="Georgia, serif" fontSize="22" fontStyle="italic" opacity={constellation}>The people we love become part of us.</text>
  </svg>
}
