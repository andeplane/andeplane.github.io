import { useEffect, useRef, useState } from 'react'
import Sky from './Sky'
import { DEFAULT_DURATION, SAMPLE, clamp, restorePeople, smooth } from './story'
import './constellation.css'

function loadPeople() {
  try { return restorePeople(JSON.parse(localStorage.getItem('the-light-we-leave-v2') ?? 'null'), JSON.parse(localStorage.getItem('the-light-we-leave-v1') ?? 'null')) } catch { return SAMPLE.map(p => ({ ...p })) }
}

export default function Constellation() {
  const [people] = useState(loadPeople)
  const [frame, setFrame] = useState({ progress: 0, opacity: 0 })
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'The light we leave · Anders Hafreager'
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    if (root.current) observer.observe(root.current)
    let request = 0
    let elapsed = 0
    let previous = performance.now()
    const fade = 1.2
    const hold = 4
    const cycle = DEFAULT_DURATION + hold + fade * 2
    function tick(now: number) {
      if (!document.hidden) elapsed += Math.min((now - previous) / 1000, .1)
      previous = now
      const time = elapsed % cycle
      setFrame({
        progress: clamp((time - fade) / DEFAULT_DURATION),
        opacity: smooth(time / fade) * (1 - smooth((time - fade - DEFAULT_DURATION - hold) / fade)),
      })
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(request); observer.disconnect(); document.title = previousTitle }
  }, [])

  return <main ref={root} className="cl-app" aria-label="Animated family lifelines" data-progress={frame.progress.toFixed(3)}>
    <div className="cl-canvas" style={{ opacity: frame.opacity }}>
      <Sky people={people} progress={frame.progress} width={size.width} viewHeight={800 * size.height / size.width} />
    </div>
  </main>
}
