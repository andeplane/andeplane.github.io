import { Link } from 'react-router-dom'
import Tag from '@/components/ui/Tag'
import type { BlogPostMeta } from '@/types'

interface Props {
  post: BlogPostMeta
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogCard({ post }: Props) {
  return (
    <Link to={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
      <article
        style={{
          padding: '1.5rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          transition: 'border-color 0.2s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
      >
        <time style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
          {formatDate(post.date)}
        </time>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
          {post.title}
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {post.description}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {post.tags.map((tag) => <Tag key={tag} label={tag} />)}
        </div>
      </article>
    </Link>
  )
}
