import { useId, useMemo } from 'react'
import { useAnimatedVector } from '../hooks/useAnimatedVector'
import type { GroverControls } from '../hooks/useGrover'
import { theta } from '../sim/analytic'

const W = 440
const H = 440
const CX = W / 2
const CY = H / 2 + 6
const R = 168

/** Exact angle of the state for a given (t, phase). */
function angleOf(t: number, phase: GroverControls['phase'], th: number): number {
  if (phase === 'initial') return th
  if (phase === 'post-oracle') return -(2 * t - 1) * th
  return (2 * t + 1) * th
}

function pt(angle: number, r = R): { x: number; y: number } {
  return { x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle) }
}

export interface RotationDiscProps {
  g: GroverControls
  height?: number
}

/**
 * The state as one arrow in the plane spanned by |α⟩ (the marked item, up)
 * and |β⟩ (everything else, right). Angles come from the closed form, not
 * the statevector, so the picture is exact: oracle reflects across the |β⟩
 * axis, diffusion reflects across the |s⟩ line, together a 2θ rotation.
 */
export function RotationDisc({ g }: RotationDiscProps) {
  const uid = useId()
  const th = theta(g.N, g.marked.size)
  const target = useMemo(
    () => Float64Array.of(angleOf(g.t, g.phase, th)),
    [g.t, g.phase, th],
  )
  const { values, animating } = useAnimatedVector(target, 650)
  const a = values[0]
  const tip = pt(a)
  const p = Math.sin(a) ** 2

  const oracleMirrorHot = animating && g.lastMove === 'oracle'
  const diffMirrorHot = animating && g.lastMove === 'diffuse'

  // Ghosts of past post-diffusion states (most recent few).
  const ghosts: number[] = []
  for (let k = Math.max(0, g.t - 7); k < g.t; k++) ghosts.push((2 * k + 1) * th)

  // 2θ arc between the previous and current post-diffusion angle.
  const showArc = g.phase === 'post-diffusion' && g.t >= 1 && !animating
  const arcFrom = (2 * g.t - 1) * th
  const arcTo = (2 * g.t + 1) * th
  const arcR = R * 0.55
  const arcStart = pt(arcFrom, arcR)
  const arcEnd = pt(arcTo, arcR)
  const arcLarge = arcTo - arcFrom > Math.PI ? 1 : 0

  const sLine = pt(th, R + 14)
  const sLineNeg = pt(th + Math.PI, R + 14)

  return (
    <svg
      className="svg-frame"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`State vector at angle ${((a * 180) / Math.PI).toFixed(1)} degrees; success probability ${(p * 100).toFixed(1)}%`}
    >
      <defs>
        <marker
          id={`${uid}-head`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* unit circle */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={1} />

      {/* |β⟩ axis — the oracle's mirror */}
      <line
        x1={CX - R - 14}
        x2={CX + R + 14}
        y1={CY}
        y2={CY}
        stroke={oracleMirrorHot ? 'var(--amber)' : 'var(--border-strong)'}
        strokeWidth={oracleMirrorHot ? 2 : 1.2}
        style={{ transition: 'stroke 200ms ease' }}
      />
      {/* |α⟩ axis */}
      <line
        x1={CX}
        x2={CX}
        y1={CY - R - 14}
        y2={CY + R + 14}
        stroke="var(--border-strong)"
        strokeWidth={1.2}
      />

      {/* |s⟩ line — the diffusion mirror */}
      <line
        x1={sLineNeg.x}
        y1={sLineNeg.y}
        x2={sLine.x}
        y2={sLine.y}
        stroke="var(--amber)"
        strokeWidth={diffMirrorHot ? 2.2 : 1.2}
        strokeDasharray="7 5"
        opacity={diffMirrorHot ? 1 : 0.6}
        style={{ transition: 'stroke-width 200ms ease, opacity 200ms ease' }}
      />

      {/* ghosts of previous iterations */}
      {ghosts.map((ga, i) => {
        const gp = pt(ga)
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={gp.x}
            y2={gp.y}
            stroke="var(--accent)"
            strokeWidth={1.4}
            opacity={0.1 + (0.12 * (i + 1)) / ghosts.length}
          />
        )
      })}

      {/* the 2θ arc */}
      {showArc && (
        <g>
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${arcLarge} 0 ${arcEnd.x} ${arcEnd.y}`}
            fill="none"
            stroke="var(--amber)"
            strokeWidth={1.6}
          />
          <text
            className="axis-label"
            x={pt((arcFrom + arcTo) / 2, arcR - 24).x}
            y={pt((arcFrom + arcTo) / 2, arcR - 24).y}
            textAnchor="middle"
            fill="var(--amber)"
          >
            2θ
          </text>
        </g>
      )}

      {/* the state arrow */}
      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--accent)"
        strokeWidth={2.6}
        markerEnd={`url(#${uid}-head)`}
      />

      {/* labels */}
      <text className="axis-label" x={CX + R + 6} y={CY - 8} textAnchor="end">
        |β⟩ everything else
      </text>
      <text className="axis-label" x={CX + 8} y={CY - R - 4}>
        |α⟩ the marked one
      </text>
      <text
        className="axis-label"
        x={sLine.x - 4}
        y={sLine.y - 6}
        textAnchor="end"
        fill="var(--amber)"
        opacity={0.85}
      >
        |s⟩ uniform
      </text>

      {/* readouts */}
      <text className="axis-label" x={14} y={22}>
        angle {((a * 180) / Math.PI).toFixed(1)}°
      </text>
      <text className="axis-label" x={14} y={40} fill="var(--green)">
        P = sin²(angle) = {(p * 100).toFixed(1)}%
      </text>
    </svg>
  )
}
