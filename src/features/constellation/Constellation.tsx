import { useEffect, useRef, useState } from 'react'
import Sky from './Sky'
import { playbackFrame, restorePeople, storyMessage } from './story'
import './constellation.css'
import { startAudibleSound } from './sound.ts'

function loadPeople() {
  try { return restorePeople(JSON.parse(localStorage.getItem('the-light-we-leave-v2') ?? 'null'), JSON.parse(localStorage.getItem('the-light-we-leave-v1') ?? 'null')) } catch { return restorePeople(null, null) }
}

export default function Constellation() {
  const [people] = useState(loadPeople)
  const [frame, setFrame] = useState({ progress: 0, opacity: 0, afterEnding: 0 })
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const root = useRef<HTMLElement>(null)
  const music = useRef<HTMLAudioElement>(null)
  const elapsed = useRef(0)
  const hasSound = useRef(false)
  async function ensureSound() {
    const audio=music.current
    if(audio&&await startAudibleSound(audio,elapsed.current,!hasSound.current))hasSound.current=true
  }
  const message = storyMessage(frame.progress,frame.afterEnding)


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
    void ensureSound()
    const interaction=()=>{if(audio?.paused)void ensureSound()}
    document.addEventListener('pointerdown',interaction,{capture:true})
    document.addEventListener('keydown',interaction,{capture:true})
    function visibility() {
      if (document.hidden) { resumeSound = !!audio && !audio.paused; audio?.pause() }
      else if(resumeSound||!hasSound.current)void ensureSound()
    }
    document.addEventListener('visibilitychange', visibility)
    function tick(now: number) {
      if (!document.hidden) {
        if (audio && !audio.paused) elapsed.current = audio.currentTime
        else elapsed.current += Math.min((now - previous) / 1000, .1)
      }
      previous = now
      const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 120
      setFrame({ ...playbackFrame(elapsed.current, duration), afterEnding: Math.max(0, elapsed.current - duration) })
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(request); observer.disconnect(); audio?.pause(); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown',interaction,{capture:true}); document.removeEventListener('keydown',interaction,{capture:true}); document.title = previousTitle }
  }, [])

  return <main ref={root} className="cl-app" aria-label="Animated family lifelines with music" data-progress={frame.progress.toFixed(3)}>
    <audio ref={music} src="/projects/constellation/music/life-goes-on.mp3" autoPlay preload="auto" onCanPlay={()=>void ensureSound()} aria-hidden="true" />
    <div className="cl-canvas" style={{ opacity: frame.opacity }}>
      <Sky people={people} progress={frame.progress} width={size.width} viewHeight={800 * size.height / size.width} afterEnding={frame.afterEnding} />
      {message && <div className={`cl-story-message ${message.title ? 'cl-story-ending' : ''} ${'kind' in message ? 'cl-story-dedication' : ''}`} style={{ opacity: message.opacity }}>
        {message.title && <div className="cl-story-title">{message.title}</div>}
        {message.lines.map(line => <div className="cl-story-sentence" key={line}>{line}</div>)}
      </div>}
    </div>
  </main>
}
