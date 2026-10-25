import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Download, Maximize2, Minimize2, Music2, Pause, Play, Plus, RotateCcw, Settings2, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import Sky from './Sky'
import { CHAPTERS, COLORS, SAMPLE, chapterAt, clamp, readPeople, storyAge } from './story'
import type { Person } from './story'
import './constellation.css'

const KEY = 'the-light-we-leave-v1'
function loadPeople() {
  try { return readPeople(JSON.parse(localStorage.getItem(KEY) ?? 'null')) ?? SAMPLE.map(p => ({ ...p })) } catch { return SAMPLE.map(p => ({ ...p })) }
}

export default function Constellation() {
  const [people, setPeople] = useState<Person[]>(loadPeople)
  const [draft, setDraft] = useState<Person[]>([])
  const [editing, setEditing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(96)
  const [song, setSong] = useState<{ url: string, name: string } | null>(null)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [error, setError] = useState('')
  const [storageMessage, setStorageMessage] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const root = useRef<HTMLElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const chapter = chapterAt(progress)
  const current = CHAPTERS[chapter]
  const finished = progress >= 1

  useEffect(() => {
    document.title = 'The light we leave · Anders Hafreager'
    return () => { document.title = 'Anders Hafreager' }
  }, [])
  useEffect(() => { if (song) return () => URL.revokeObjectURL(song.url) }, [song])
  useEffect(() => {
    if (!playing) { audio.current?.pause(); return }
    let frame = 0
    let previous = performance.now()
    function tick(now: number) {
      const next = song && audio.current ? audio.current.currentTime / duration : progressRef.current + (now - previous) / (duration * 1000) * speed
      previous = now
      progressRef.current = clamp(next)
      setProgress(progressRef.current)
      if (next >= 1) { setPlaying(false); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration, speed, song])
  useEffect(() => {
    function visibility() { if (document.hidden) setPlaying(false) }
    function changed() { setFullscreen(document.fullscreenElement === root.current) }
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', changed)
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', changed) }
  }, [])
  useEffect(() => {
    if (editing) dialog.current?.showModal()
    else if (dialog.current?.open) { dialog.current.close(); editButton.current?.focus() }
  }, [editing])

  function seek(value: number) {
    const next = clamp(value)
    progressRef.current = next
    setProgress(next)
    if (audio.current && song) audio.current.currentTime = next * duration
    if (next === 1) setPlaying(false)
  }
  async function togglePlay() {
    if (playing) { setPlaying(false); return }
    if (finished) seek(0)
    if (song && audio.current) {
      try { await audio.current.play() } catch { setError('The song could not play. Choose another audio file or remove it to continue in silence.'); return }
    }
    setPlaying(true)
  }
  function openEditor() { setPlaying(false); setDraft(people.map(p => ({ ...p }))); setError(''); setEditing(true) }
  function updatePerson(index: number, update: Partial<Person>) { setDraft(old => old.map((p, i) => i === index ? { ...p, ...update } : p)) }
  function save() {
    const normalized = draft.map(p => ({ ...p, name: p.name.trim() }))
    if (!readPeople(normalized)) { setError('Give each person a name. Ages must be 0–79, with an ending later than the beginning and no later than 80.'); return }
    setPeople(normalized)
    try { localStorage.setItem(KEY, JSON.stringify(normalized)); setStorageMessage('Your sky is saved on this browser.') } catch { setStorageMessage('Your sky works for this visit. This browser could not save it.') }
    setError(''); setEditing(false); seek(0)
  }
  function chooseSong(file?: File) {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) { setError('Choose an audio file smaller than 100 MB.'); return }
    setPlaying(false); setSong({ url: URL.createObjectURL(file), name: file.name }); setError(''); seek(0)
  }
  function downloadSky() {
    const source = root.current?.querySelector('.cl-sky-svg')?.cloneNode(true) as SVGSVGElement | undefined
    if (!source) return
    source.setAttribute('width', '800'); source.setAttribute('height', '800')
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '800'); bg.setAttribute('height', '800'); bg.setAttribute('fill', '#080e1b')
    source.insertBefore(bg, source.firstChild)
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(source)], { type: 'image/svg+xml' }))
    const link = document.createElement('a'); link.href = url; link.download = 'the-light-we-leave.svg'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen() } catch { setError('Fullscreen is unavailable in this browser. The story still works here.') }
  }

  return <main ref={root} className={`cl-app ${progress > 0 ? 'cl-started' : ''} ${finished ? 'cl-finished' : ''}`}>
    <header className="cl-header">
      <Link to="/projects" className="cl-back"><ArrowLeft size={15} /> <span>Anders Hafreager</span></Link>
      <span className="cl-wordmark"><Sparkles size={15} /> A little perspective</span>
      <button ref={editButton} onClick={openEditor} className="cl-text-button"><Settings2 size={15} /><span>Make it yours</span></button>
    </header>

    <div className="cl-experience">
      <section className="cl-narrative" aria-label="Story">
        <div className="cl-eyebrow"><span /> AN INTERACTIVE SHORT STORY</div>
        <h1>The light<br />{'we '}<em>leave.</em></h1>
        <div className="cl-chapter-copy" key={chapter}>
          <p className="cl-chapter-number">{String(chapter + 1).padStart(2, '0')} <span>/</span> {current.label}</p>
          <h2>{current.title}</h2>
          <p className="cl-description">{current.text}</p>
        </div>
        {!finished ? <button className="cl-primary" onClick={togglePlay}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{playing ? 'Pause for a moment' : progress > 0 ? 'Continue the story' : 'Begin the story'}<ArrowRight size={17} /></button> : <button className="cl-primary" onClick={downloadSky}><Download size={16} /> Keep this constellation</button>}
        <p className="cl-footnote">{song ? 'Your soundtrack. Your sky.' : 'A quiet moment. About a minute and a half.'}</p>
      </section>

      <section className="cl-stage" aria-label="Animated family sky">
        <div className="cl-stage-caption"><span>{finished ? 'A CONSTELLATION OF US' : 'EVERY LINE, A LIFE TOUCHED'}</span><span className="cl-live-dot" />{finished ? 'Always here' : `Age ${Math.floor(storyAge(progress))}`}</div>
        <Sky people={people} progress={progress} />
        <div className="cl-sky-caption"><span className="cl-caption-line" />{finished ? 'Different paths. One sky.' : 'Watch the paths. Remember the people.'}</div>
      </section>
    </div>

    <footer className="cl-controls">
      <div className="cl-transport">
        <button className="cl-play" onClick={togglePlay} aria-label={playing ? 'Pause story' : finished ? 'Replay story' : 'Play story'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
        <button onClick={() => { setPlaying(false); seek(0) }} aria-label="Restart story"><RotateCcw size={16} /></button>
        <span className="cl-time">{Math.floor(progress * duration / 60)}:{String(Math.floor(progress * duration % 60)).padStart(2, '0')} <span>/ {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span></span>
        <button onClick={() => setSpeed(s => { const next = s === 1 ? 2 : 1; if (audio.current) audio.current.playbackRate = next; return next })} aria-label={`Playback speed ${speed} times`}>{speed}×</button>
        <div className="cl-transport-spacer" />
        {song ? <button onClick={() => setMuted(v => !v)} aria-label={muted ? 'Unmute song' : 'Mute song'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button> : <button className="cl-add-song" onClick={openEditor} aria-label="Add a song"><Music2 size={15} /><span>Add a song</span></button>}
        <button onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
      <input className="cl-scrubber" aria-label="Story progress" aria-valuetext={`${current.label}, age ${Math.floor(storyAge(progress))}`} type="range" min="0" max="1" step="0.001" value={progress} onChange={e => seek(Number(e.target.value))} style={{ '--cl-progress': `${progress * 100}%` } as React.CSSProperties} />
      <nav className="cl-chapters" aria-label="Story chapters">{CHAPTERS.map((c, i) => <button key={c.label} aria-current={chapter === i ? 'step' : undefined} onClick={() => seek(c.at)}><span>{String(i + 1).padStart(2, '0')}</span>{c.label}</button>)}</nav>
      <div className="cl-bottom-note"><span>An imagined life. A familiar feeling.</span><span>Inspired by the family lifelines of <a href="https://www.instagram.com/creaconbruno/" target="_blank" rel="noreferrer">@creaconbruno <ArrowRight size={10} /></a></span></div>
    </footer>
    <p className="cl-sr-only" role="status">{storageMessage}</p>
    {error && !editing && <div className="cl-error" role="alert">{error}<button aria-label="Dismiss message" onClick={() => setError('')}><X size={16} /></button></div>}
    {song && <audio ref={audio} src={song.url} muted={muted} onLoadedMetadata={e => { const length = e.currentTarget.duration; if (Number.isFinite(length) && length > 0) { setDuration(length); e.currentTarget.playbackRate = speed } else setError('This audio file has no usable duration. Choose another file.') }} onEnded={() => { setPlaying(false); setProgress(1) }} onError={() => { setPlaying(false); setError('This browser cannot read that audio file. Try an MP3, M4A, or WAV file, or remove the song.')}} />}

    <dialog className="cl-dialog" ref={dialog} aria-labelledby="cl-editor-title" onCancel={() => setEditing(false)} onClick={e => { if (e.target === e.currentTarget) setEditing(false) }}>
      <div className="cl-editor">
        <header><div><p className="cl-eyebrow">EVERY SKY IS DIFFERENT</p><h2 id="cl-editor-title">Make room for your people.</h2></div><button aria-label="Close editor" onClick={() => setEditing(false)}><X size={20} /></button></header>
        <p className="cl-editor-intro">Start with names. Ages are <strong>your age</strong> when someone enters your story or their trail ends. A blank ending keeps them beside you. The sample is fictional, never a prediction.</p>
        <div className="cl-editor-labels"><span>Person</span><span>Enters at</span><span>Ends at</span><span /></div>
        {draft.map((p, i) => <div key={p.id} className="cl-person-row">
          <label className="cl-name"><span style={{ background: p.color }} /><input aria-label={`Person ${i + 1} name`} maxLength={24} value={p.name} onChange={e => updatePerson(i, { name: e.target.value })} /></label>
          <input aria-label={`${p.name || `Person ${i + 1}`} enters at age`} type="number" min="0" max="79" value={Number.isFinite(p.start) ? p.start : ''} onChange={e => updatePerson(i, { start: e.target.value === '' ? NaN : Number(e.target.value) })} />
          <input aria-label={`${p.name || `Person ${i + 1}`} trail ends at age`} type="number" min="1" max="80" placeholder="—" value={p.end ?? ''} onChange={e => updatePerson(i, { end: e.target.value === '' ? null : Number(e.target.value) })} />
          <button aria-label={`Remove ${p.name || `person ${i + 1}`}`} disabled={draft.length === 1} onClick={() => setDraft(old => old.filter((_, n) => n !== i))}><Trash2 size={15} /></button>
        </div>)}
        <button className="cl-text-button cl-add-person" disabled={draft.length >= 8} onClick={() => { const color = COLORS.find(c => !draft.some(p => p.color === c)) ?? COLORS[0]; setDraft(old => [...old, { id: crypto.randomUUID(), name: '', color, start: 0, end: null }]) }}><Plus size={16} />{draft.length >= 8 ? 'Your sky has eight people' : 'Add someone'}</button>
        <div className="cl-song-box"><Music2 size={21} /><div><h3>A song for this sky</h3><p>{song ? song.name : 'Bring your song later. The story follows its duration.'}</p><label className="cl-upload">{song ? 'Choose another song' : 'Choose an audio file'}<input type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={e => { chooseSong(e.target.files?.[0]); e.target.value = '' }} /></label>{song && <button className="cl-remove-song" onClick={() => { setSong(null); setDuration(96); setError(''); seek(0) }}>Remove song</button>}</div></div>
        <p className="cl-privacy">Names stay in this browser. Audio stays on your device and is not saved between visits.</p>
        {error && <p className="cl-inline-error" role="alert">{error}</p>}
        <footer><button className="cl-text-button" onClick={() => { setDraft(SAMPLE.map(p => ({ ...p }))); setError('') }}>Reset sample</button><button className="cl-primary" onClick={save}><Check size={16} /> Save my sky</button></footer>
      </div>
    </dialog>
  </main>
}
