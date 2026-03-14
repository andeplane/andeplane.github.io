import { useParams, Link } from 'react-router-dom'
import { useBlogPost } from '@/hooks/useBlogPosts'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'
import Tag from '@/components/ui/Tag'

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const { content, meta, loading } = useBlogPost(slug ?? '')

  if (loading) {
    return <p style={{ color: 'var(--color-text-muted)', paddingTop: '3rem' }}>Loading…</p>
  }

  if (!meta) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h2 style={{ color: '#fff' }}>Post not found</h2>
        <Link to="/blog" style={{ color: 'var(--color-accent-light)' }}>← Back to blog</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <Link
        to="/blog"
        style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginBottom: '2rem' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)' }}
      >
        ← Blog
      </Link>

      <header style={{ marginBottom: '3rem' }}>
        <time style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.75rem' }}>
          {formatDate(meta.date)}
        </time>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', margin: '0 0 1rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {meta.title}
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
          {meta.description}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {meta.tags.map((tag) => <Tag key={tag} label={tag} />)}
        </div>
      </header>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', marginBottom: '3rem' }} />

      <MarkdownRenderer content={content} />
    </div>
  )
}
