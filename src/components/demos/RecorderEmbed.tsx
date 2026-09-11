import { useEffect, useRef, useState } from 'react'

export default function RecorderEmbed() {
  const iframe = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(1500)

  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return
      if (event.data?.type !== 'recorder-lab-height' || !Number.isFinite(event.data.height)) return
      setHeight(Math.min(5000, Math.max(600, event.data.height)))
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [])

  return (
    <iframe
      ref={iframe}
      src="/demos/flute-lab/?embed=1"
      title="Recorder Lab — playable physics simulation"
      allow="autoplay"
      style={{ width: '100%', height, border: 0, borderRadius: '12px', marginBottom: '2rem', background: 'var(--color-background)' }}
    />
  )
}
