import { Link } from 'react-router-dom'
import Tag from '@/components/ui/Tag'
import type { ProjectMeta } from '@/types'

interface Props {
  project: ProjectMeta
}

export default function ProjectCard({ project }: Props) {
  return (
    <Link
      to={`/projects/${project.slug}`}
      style={{ textDecoration: 'none' }}
    >
      <article
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'border-color 0.2s, transform 0.2s',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        }}
      >
        {project.screenshot && (
          <div style={{
            aspectRatio: '16/9',
            overflow: 'hidden',
            background: 'var(--color-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img
              src={project.screenshot}
              alt={`${project.title} preview`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: project.portrait ? 'contain' : 'cover',
                padding: project.portrait ? '0.5rem' : 0,
              }}
              loading="lazy"
            />
          </div>
        )}
        {!project.screenshot && (
          <div
            style={{
              aspectRatio: '16/9',
              background: 'linear-gradient(135deg, var(--color-surface-2) 0%, #1e1e2e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            ⬡
          </div>
        )}

        <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            {project.title}
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.6, flex: 1 }}>
            {project.description}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: 'auto' }}>
            {project.tags.slice(0, 4).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}
          </div>
        </div>
      </article>
    </Link>
  )
}
