import { useEffect, useRef } from 'react'
import type { ShorCircuit, ShorReading } from '@andeplane/quantum'
import type { Snapshot } from '../lab/useLab.ts'

/** P(counting register = y), with the latest measurement marked. */
export function Histogram({ shor, snapshot, shots }: { shor: ShorCircuit; snapshot: Snapshot | null; shots: ShorReading[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = 2 ** shor.counting.length
  const solved = shots.find((s) => s.r !== null)?.r ?? null

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !snapshot) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth, H = canvas.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)
    const p = snapshot.counting
    let max = 0
    for (const v of p) max = Math.max(max, v)
    const css = getComputedStyle(canvas)
    const bar = css.getPropertyValue('--bar').trim() || '#6366f1'
    const mark = css.getPropertyValue('--mark').trim() || '#d4a24e'
    const guide = css.getPropertyValue('--guide').trim() || '#5fb37a'
    const bw = W / size

    if (solved) {
      ctx.strokeStyle = guide
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      for (let s = 0; s < solved; s++) {
        const x = ((s * size) / solved + 0.5) * bw
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      ctx.setLineDash([])
    }
    ctx.fillStyle = bar
    for (let y = 0; y < size; y++) {
      if (p[y] < 1e-7) continue
      const h = (p[y] / max) * (H - 6)
      ctx.fillRect(y * bw + (bw > 3 ? 0.5 : 0), H - h, Math.max(bw - (bw > 3 ? 1 : 0), 1), h)
    }
    const last = shots[0]
    if (last) {
      ctx.fillStyle = mark
      const x = (last.y + 0.5) * bw
      ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 7); ctx.fill()
    }
  }, [snapshot, shots, size, solved])

  return (
    <div className="hist">
      <canvas ref={ref} aria-label="Probability of each counting register value" />
      <div className="hist-axis">
        <span>0</span>
        <span>P(counting register = y){solved ? ` · dashed lines at multiples of 2^${shor.counting.length}/${solved}` : ''}</span>
        <span>{size - 1}</span>
      </div>
    </div>
  )
}
