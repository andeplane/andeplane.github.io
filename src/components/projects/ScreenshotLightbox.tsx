import { useEffect, useRef } from 'react'

type Image = { src: string; alt: string; caption: string }

export default function ScreenshotLightbox({ images, index, title, returnFocus, onChange, onClose }: {
  images: Image[]
  index: number
  title: string
  returnFocus: HTMLButtonElement | null
  onChange: (index: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const image = images[index]
  const move = (step: number) => onChange((index + step + images.length) % images.length)

  useEffect(() => {
    const dialog = ref.current!
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      returnFocus?.focus({ preventScroll: true })
    }
  }, [returnFocus])

  return <dialog ref={ref} className="screenshot-lightbox" aria-label={`${title} screenshots`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        move(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }}>
    <div className="screenshot-lightbox-content">
      <div className="screenshot-lightbox-toolbar">
        <span>{title}</span>
        <span aria-live="polite">{index + 1} / {images.length}</span>
        <button type="button" onClick={onClose} aria-label="Close screenshots" autoFocus>✕</button>
      </div>
      <div className="screenshot-lightbox-stage">
        <img src={image.src} alt={image.alt} />
        {images.length > 1 && <>
          <button type="button" className="screenshot-lightbox-previous" onClick={() => move(-1)} aria-label="Previous screenshot">‹</button>
          <button type="button" className="screenshot-lightbox-next" onClick={() => move(1)} aria-label="Next screenshot">›</button>
        </>}
      </div>
      <p className="screenshot-lightbox-caption" aria-live="polite">{image.caption}</p>
      <p className="screenshot-lightbox-help">← → Browse screenshots · Esc to close</p>
    </div>
  </dialog>
}
