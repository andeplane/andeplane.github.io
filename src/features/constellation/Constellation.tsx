import { useEffect, useRef, useState } from 'react'
import Sky from './Sky'
import { playbackFrame, restorePeople, storyMessage } from './story'
import './constellation.css'
import { listenForSoundUnlock, startAudibleSound } from './sound.ts'

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
  const soundAttempt = useRef<Promise<boolean>|null>(null)
  const [soundState,setSoundState]=useState('loading')
  async function ensureSound(retryAfterPending=true) {
    const audio=music.current
    if(!audio)return
    if(soundAttempt.current) {
      // Development remounts can pause an in-flight play request. The next
      // mount must retry once after that request settles, not silently drop it.
      if(retryAfterPending) {
        await soundAttempt.current
        if(music.current===audio&&audio.paused&&!audio.ended)void ensureSound(false)
      }
      return
    }
    const attempt=startAudibleSound(audio,elapsed.current,!hasSound.current)
    soundAttempt.current=attempt
    const started=await attempt
    soundAttempt.current=null
    if(started){hasSound.current=true;setSoundState('playing')}
    else if(!audio.ended)setSoundState(audio.error?'error':'blocked')
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
    const removeSoundUnlock=listenForSoundUnlock(document,interaction)
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
    return () => { cancelAnimationFrame(request); observer.disconnect(); audio?.pause(); document.removeEventListener('visibilitychange', visibility); removeSoundUnlock(); document.title = previousTitle }
  }, [])

  return <main ref={root} className="cl-app" aria-label="Animated family lifelines with music" data-progress={frame.progress.toFixed(3)} data-sound={soundState}>
    <audio ref={music} src="/projects/constellation/music/life-goes-on.mp3" autoPlay preload="auto" onCanPlay={()=>void ensureSound()} onPlaying={()=>setSoundState('playing')} onEnded={()=>setSoundState('finished')} onError={()=>setSoundState('error')} aria-hidden="true" />
    <div className="cl-canvas" style={{ opacity: frame.opacity }}>
      <Sky people={people} progress={frame.progress} width={size.width} viewHeight={800 * size.height / size.width} afterEnding={frame.afterEnding} />
      {(soundState==='blocked'||soundState==='error')&&frame.progress<.85&&<button className="cl-sound-prompt" onClick={()=>void ensureSound()} type="button" aria-label="Enable the soundtrack">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Tap or click for sound
      </button>}
      {message && <div className={`cl-story-message ${message.title ? 'cl-story-ending' : ''} ${'kind' in message ? 'cl-story-dedication' : ''}`} style={{ opacity: message.opacity }}>
        {message.title && <div className="cl-story-title">{message.title}</div>}
        {message.lines.map(line => <div className="cl-story-sentence" key={line}>{line}</div>)}
      </div>}
    </div>
  </main>
}
