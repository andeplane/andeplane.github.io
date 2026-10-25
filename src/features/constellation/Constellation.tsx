import { useEffect, useRef, useState } from 'react'
import Sky from './Sky'
import { SAMPLE, playbackFrame, restorePeople, smooth, storyMessage } from './story'
import './constellation.css'

function loadPeople() {
  try { return restorePeople(JSON.parse(localStorage.getItem('the-light-we-leave-v2') ?? 'null'), JSON.parse(localStorage.getItem('the-light-we-leave-v1') ?? 'null')) } catch { return SAMPLE.map(p => ({ ...p })) }
}

export default function Constellation() {
  const [people] = useState(loadPeople)
  const [frame, setFrame] = useState({ progress: 0, opacity: 0 })
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const root = useRef<HTMLElement>(null)
  const music = useRef<HTMLAudioElement>(null)
  const elapsed = useRef(0)
  const hasSound = useRef(false)
  const [needsSound, setNeedsSound] = useState(false)
  async function toggleSound() {
    const audio = music.current
    if (!audio) return
    if (audio.paused) {
      if (!hasSound.current) { audio.currentTime = 0; elapsed.current = 0 }
      try { await audio.play(); hasSound.current = true; setNeedsSound(false) } catch { setNeedsSound(true) }
    } else audio.muted = !audio.muted
  }
  const message = storyMessage(frame.progress)
  const sceneScale = 1 - .22 * smooth((frame.progress - .85) / .08)
  const messageGap = size.height < 500 && size.width > 700 ? 18 : Math.min(42, Math.max(24, size.height * .04))

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'The light we leave · Anders Hafreager'
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    if (root.current) observer.observe(root.current)
    let request = 0
    let previous = performance.now()
    const audio = music.current
    let resumeSound = false
    audio?.play().then(() => { hasSound.current = true; setNeedsSound(false) }).catch(() => setNeedsSound(true))
    function visibility() {
      if (document.hidden) { resumeSound = !!audio && !audio.paused; audio?.pause() }
      else if (resumeSound) audio?.play().catch(() => setNeedsSound(true))
    }
    document.addEventListener('visibilitychange', visibility)
    function tick(now: number) {
      if (!document.hidden) {
        if (audio && !audio.paused) elapsed.current = audio.currentTime
        else elapsed.current += Math.min((now - previous) / 1000, .1)
      }
      previous = now
      setFrame(playbackFrame(elapsed.current, audio && Number.isFinite(audio.duration) ? audio.duration : undefined))
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(request); observer.disconnect(); audio?.pause(); document.removeEventListener('visibilitychange', visibility); document.title = previousTitle }
  }, [])

  return <main ref={root} className="cl-app" aria-label="Animated family lifelines. Tap or press Enter to enable or mute music." tabIndex={0} onPointerDown={toggleSound} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void toggleSound() } }} data-progress={frame.progress.toFixed(3)}>
    <audio ref={music} src="/projects/constellation/music/life-goes-on.mp3" loop preload="auto" aria-hidden="true" />
    <div className="cl-canvas" style={{ opacity: frame.opacity }}>
      <Sky people={people} progress={frame.progress} width={size.width} viewHeight={800 * size.height / size.width} sceneScale={sceneScale} />
      {needsSound && <span className="cl-sound-hint">Tap anywhere for sound</span>}
      {message && <div className={`cl-story-message ${message.title ? 'cl-story-ending' : ''}`} style={{ opacity: message.opacity, top: message.title ? `calc(${70 * sceneScale}% + ${messageGap}px)` : undefined }}>
        {message.title && <div className="cl-story-title">{message.title}</div>}
        {message.lines.map(line => <div className="cl-story-sentence" key={line}>{line}</div>)}
      </div>}
    </div>
  </main>
}
