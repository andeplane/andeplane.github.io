import { useParams, Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useProject } from '@/hooks/useProjects'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'
import Tag from '@/components/ui/Tag'
import RecorderEmbed from '@/components/demos/RecorderEmbed'
import './project-detail.css'
import ScreenshotLightbox from '@/components/projects/ScreenshotLightbox'

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const project = useProject(slug ?? '')
  const [openScreenshot, setOpenScreenshot] = useState<{ slug: string; index: number } | null>(null)
  const screenshotTrigger = useRef<HTMLButtonElement | null>(null)

  if (!project) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h2 style={{ color: '#fff' }}>Project not found</h2>
        <Link to="/projects" style={{ color: 'var(--color-accent-light)' }}>← Back to projects</Link>
      </div>
    )
  }

  if (project.slug === 'flute-lab') {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          <Link to="/projects">← Projects</Link>
          <a href={project.liveUrl} target="_blank" rel="noreferrer">Open standalone ↗</a>
        </div>
        <RecorderEmbed />
      </div>
    )
  }

  const images = [
    ...(project.screenshot ? [{ src: project.screenshot, alt: project.screenshotAlt ?? `${project.title} screenshot`, caption: project.title }] : []),
    ...(project.screenshots ?? []),
  ]
  const showScreenshot = (index: number, trigger: HTMLButtonElement) => {
    screenshotTrigger.current = trigger
    setOpenScreenshot({ slug: project.slug, index })
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <Link
        to="/projects"
        style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginBottom: '2rem' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)' }}
      >
        ← Projects
      </Link>

      {project.screenshot && (
        <button type="button" className="project-screenshot-button project-screenshot-hero" aria-label={`View ${project.title} screenshots`} onClick={event => showScreenshot(0, event.currentTarget)} style={{
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '2rem',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-2)',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <img
            src={project.screenshot}
            alt={project.screenshotAlt ?? `${project.title} screenshot`}
            style={{
              display: 'block',
              maxWidth: project.portrait ? '320px' : '100%',
              width: '100%',
            }}
          />
        </button>
      )}

      <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 0.75rem', letterSpacing: '-0.02em' }}>
        {project.title}
      </h1>

      <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
        {project.description}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1.5rem' }}>
        {project.tags.map((tag) => <Tag key={tag} label={tag} />)}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
        {project.liveUrl && (
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.5rem 1.25rem',
              background: 'var(--color-accent)',
              color: '#fff',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent-hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)' }}
          >
            Live Demo →
          </a>
        )}
        {project.repoUrl && (
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.5rem 1.25rem',
              background: 'transparent',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.9rem',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          >
            View Source
          </a>
        )}
      </div>

      {!!project.screenshots?.length && (
        <section className="project-screenshots" aria-labelledby="screenshots-title">
          <h2 id="screenshots-title">{project.screenshotsTitle ?? 'Game screenshots'}</h2>
          {project.screenshotsNote && <p className="project-screenshots-note">{project.screenshotsNote}</p>}
          <div className="project-screenshots-grid">
            {project.screenshots.map((shot, index) => (
              <figure key={shot.src} className={shot.width > shot.height ? 'project-screenshot-wide' : undefined}>
                <button type="button" className="project-screenshot-button" onClick={event => showScreenshot(index + (project.screenshot ? 1 : 0), event.currentTarget)} aria-label={`Enlarge: ${shot.alt}`}>
                  <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
                </button>
                <figcaption>{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', marginBottom: '3rem' }} />

      <MarkdownRenderer content={project.longDescription} />
      {openScreenshot?.slug === project.slug && <ScreenshotLightbox
        images={images} index={openScreenshot.index} title={project.title}
        returnFocus={screenshotTrigger.current}
        onChange={index => setOpenScreenshot({ slug: project.slug, index })} onClose={() => setOpenScreenshot(null)}
      />}
    </div>
  )
}
