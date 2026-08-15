import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

const W = 720
const PAD_L = 40
const PAD_R = 12
const PAD_T = 14
const PAD_B = 26

export interface AmplitudeBarsProps {
  /** Displayed amplitude values (callers pass animated values). */
  amps: ArrayLike<number>
  marked?: ReadonlySet<number>
  /** Index the broken oracle actually flips — tinted as the impostor. */
  wrongIndex?: number
  onBarClick?: (i: number) => void
  draggable?: boolean
  onDrag?: (i: number, value: number) => void
  /** Draw the dashed mean line (the diffusion mirror). */
  showMean?: boolean
  meanEmphasis?: boolean
  /** Probability labels under each bar (small N only). */
  showProbs?: boolean
  height?: number
  ariaLabel?: string
}

/**
 * The essay's core primitive: N signed amplitudes as bars about a zero
 * baseline, y fixed to [−1, 1] so nothing rescales mid-animation.
 */
export function AmplitudeBars({
  amps,
  marked,
  wrongIndex,
  onBarClick,
  draggable = false,
  onDrag,
  showMean = false,
  meanEmphasis = false,
  showProbs = false,
  height = 250,
  ariaLabel,
}: AmplitudeBarsProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIndex = useRef<number | null>(null)
  const N = amps.length
  const plotW = W - PAD_L - PAD_R
  const y0 = PAD_T + (height - PAD_T - PAD_B) / 2
  const scale = (height - PAD_T - PAD_B) / 2
  const slot = plotW / N
  const barW = Math.min(46, slot * 0.62)

  const xOf = (i: number) => PAD_L + slot * i + (slot - barW) / 2
  const yOf = (v: number) => y0 - v * scale

  let mean = 0
  for (let i = 0; i < N; i++) mean += (amps[i] ?? 0) / N

  const toLocal = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * height,
    }
  }

  const valueAt = (y: number) =>
    Math.max(-0.995, Math.min(0.995, (y0 - y) / scale))

  const handleDown = (e: ReactPointerEvent) => {
    if (!draggable || !onDrag) return
    const { x, y } = toLocal(e)
    const i = Math.floor((x - PAD_L) / slot)
    if (i < 0 || i >= N) return
    dragIndex.current = i
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    onDrag(i, valueAt(y))
  }

  const handleMove = (e: ReactPointerEvent) => {
    if (dragIndex.current === null || !onDrag) return
    onDrag(dragIndex.current, valueAt(toLocal(e).y))
  }

  const handleUp = () => {
    dragIndex.current = null
  }

  const labelEvery = N <= 16 ? 1 : 4

  return (
    <svg
      ref={svgRef}
      className="svg-frame"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `${N} amplitude bars`}
      style={{ touchAction: draggable ? 'none' : undefined, cursor: draggable ? 'ns-resize' : undefined }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {/* y axis guides at +1, 0, −1 */}
      {[1, 0, -1].map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke="var(--border)"
            strokeWidth={v === 0 ? 1.4 : 1}
            strokeDasharray={v === 0 ? undefined : '2 5'}
          />
          <text className="axis-label" x={PAD_L - 8} y={yOf(v) + 4} textAnchor="end">
            {v === 0 ? '0' : v > 0 ? '+1' : '−1'}
          </text>
        </g>
      ))}

      {/* bars */}
      {Array.from({ length: N }, (_, i) => {
        const v = amps[i]
        const isMarked = marked?.has(i) ?? false
        const isWrong = wrongIndex === i
        const yTop = Math.min(y0, yOf(v))
        const h = Math.max(Math.abs(yOf(v) - y0), 1.5)
        const fill = isWrong
          ? 'var(--red)'
          : isMarked
            ? 'var(--accent)'
            : 'var(--text-faint)'
        return (
          <g key={i}>
            <rect
              x={xOf(i)}
              y={yTop}
              width={barW}
              height={h}
              rx={2}
              fill={fill}
              opacity={isMarked || isWrong ? 0.95 : 0.55}
              style={{ cursor: onBarClick ? 'pointer' : undefined }}
              onClick={onBarClick ? () => onBarClick(i) : undefined}
            />
            {/* generous invisible hit area for click-to-mark */}
            {onBarClick && (
              <rect
                x={PAD_L + slot * i}
                y={PAD_T}
                width={slot}
                height={height - PAD_T - PAD_B}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onBarClick(i)}
              />
            )}
            {i % labelEvery === 0 && (
              <text
                className="axis-label"
                x={xOf(i) + barW / 2}
                y={height - 10}
                textAnchor="middle"
                fill={isMarked ? 'var(--accent)' : undefined}
              >
                {i}
              </text>
            )}
            {showProbs && N <= 8 && (
              <text
                className="axis-label"
                x={xOf(i) + barW / 2}
                y={PAD_T + 10}
                textAnchor="middle"
              >
                {Math.round(v * v * 100)}%
              </text>
            )}
          </g>
        )
      })}

      {/* the diffusion mirror: dashed mean line */}
      {showMean && (
        <g style={{ transition: 'opacity 300ms ease' }} opacity={meanEmphasis ? 1 : 0.55}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOf(mean)}
            y2={yOf(mean)}
            stroke="var(--amber)"
            strokeWidth={meanEmphasis ? 1.8 : 1.2}
            strokeDasharray="7 5"
          />
          <text
            className="axis-label"
            x={W - PAD_R}
            y={yOf(mean) - 6}
            textAnchor="end"
            fill="var(--amber)"
          >
            mean
          </text>
        </g>
      )}
    </svg>
  )
}
