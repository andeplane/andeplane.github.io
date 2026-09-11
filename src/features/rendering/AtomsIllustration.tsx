import { useId } from 'react'

// A schematic of atom positions and their screen-facing bounds, not a molecular model.
const atoms = [
  { x: 160, y: 62, r: 22 },
  { x: 370, y: 50, r: 24 },
  { x: 274, y: 100, r: 36 },
  { x: 426, y: 153, r: 32 },
  { x: 185, y: 180, r: 30 },
]
const bonds = [[0, 2], [1, 2], [2, 3], [2, 4]]

export default function AtomsIllustration({ bounds = false }: { bounds?: boolean }) {
  const id = useId()
  return (
    <svg viewBox="0 0 600 240" aria-hidden="true" className="block w-full">
      <defs>
        <radialGradient id={id} cx="32%" cy="26%" r="75%">
          <stop offset="0" stopColor="#e2f5ff" />
          <stop offset="0.25" stopColor="#91b5f8" />
          <stop offset="0.7" stopColor="#4c6ea7" />
          <stop offset="1" stopColor="#17243e" />
        </radialGradient>
      </defs>
      {bonds.map(([a, b]) => (
        <g key={`${a}-${b}`} strokeLinecap="round">
          <line x1={atoms[a].x} y1={atoms[a].y} x2={atoms[b].x} y2={atoms[b].y} stroke="#334761" strokeWidth="15" />
          <line x1={atoms[a].x} y1={atoms[a].y - 2} x2={atoms[b].x} y2={atoms[b].y - 2} stroke="#8babc5" strokeWidth="6" />
        </g>
      ))}
      {atoms.map(({ x, y, r }, i) => <circle key={i} cx={x} cy={y} r={r} fill={`url(#${id})`} />)}
      {bounds && atoms.map(({ x, y, r }, i) => (
        <g key={i} stroke="#e9bf7d" strokeWidth="1" fill="none">
          <rect x={x - r} y={y - r} width={2 * r} height={2 * r} strokeDasharray="4 3" />
          <path d={`M${x - r} ${y - r} L${x + r} ${y + r}`} opacity="0.6" />
        </g>
      ))}
    </svg>
  )
}
