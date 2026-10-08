import { useEffect, useRef } from 'react'
import type { ShorCircuit } from '@andeplane/quantum'
import type { Snapshot } from '../lab/useLab.ts'
import { phaseColor } from './color.ts'

/**
 * Every amplitude of the joint counting × work state, one pixel each:
 * column j is a counting value, row w a work value, colour is the phase.
 */
export function AmplitudeMap({ shor, snapshot }: { shor: ShorCircuit; snapshot: Snapshot | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cols = 2 ** shor.counting.length
  const rows = shor.N

  useEffect(() => {
    const canvas = ref.current
    const map = snapshot?.map
    if (!canvas || !map) return
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(cols, rows)
    let max = 0
    for (let i = 0; i < map.re.length; i++) max = Math.max(max, Math.hypot(map.re[i], map.im[i]))
    const scale = max > 0 ? 1 / max : 0
    for (let w = 0; w < rows; w++) {
      for (let j = 0; j < cols; j++) {
        const i = w * cols + j // work bits sit above the counting bits
        const [r, g, b] = phaseColor(map.re[i], map.im[i], scale)
        const o = ((rows - 1 - w) * cols + j) * 4
        img.data[o] = r
        img.data[o + 1] = g
        img.data[o + 2] = b
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [snapshot, cols, rows])

  if (snapshot && !snapshot.map) {
    return <div className="map-empty">The joint state has {(cols * 2 ** shor.work.length).toLocaleString()} amplitudes, too many to draw. The histogram below still shows the counting register.</div>
  }
  return (
    <div className="map">
      <div className="map-axis-y">work register value (0 – {rows - 1})</div>
      <canvas ref={ref} className={cols < 600 ? 'pixelated' : ''} aria-label="Amplitude map of the counting and work registers" />
      <div className="map-axis-x">counting register value j (0 – {cols - 1})</div>
    </div>
  )
}
