import { Link } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useBlogPosts } from '@/hooks/useBlogPosts'
import ProjectCard from '@/components/projects/ProjectCard'
import BlogCard from '@/components/blog/BlogCard'

export default function Home() {
  const projects = useProjects()
  const { posts } = useBlogPosts()

  const featured = projects.slice(0, 3)
  const recentPosts = posts.slice(0, 3)

  return (
    <div>
      {/* Hero */}
      <section style={{ paddingBottom: '5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'inline-block', padding: '0.3em 0.8em', borderRadius: '20px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Engineering Manager at Cognite
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 1.25rem' }}>
          Hi, I'm Anders Hafreager.
        </h1>
        <p style={{ fontSize: '1.15rem', color: 'var(--color-text-muted)', maxWidth: '55ch', lineHeight: 1.7, margin: '0 0 2.5rem' }}>
          Engineering Manager at <a href="https://www.cognite.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-light)' }}>Cognite</a>, PhD in computational physics. I build simulations, games, and AI-powered tools — mostly in TypeScript and C++, often in the browser.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            to="/projects"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.5rem',
              background: 'var(--color-accent)',
              color: '#fff',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.95rem',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent-hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)' }}
          >
            View Projects →
          </Link>
          <Link
            to="/about"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.65rem 1.5rem',
              background: 'transparent',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.95rem',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          >
            About me
          </Link>
        </div>
      </section>

      {/* Featured Projects */}
      <section style={{ paddingTop: '4rem', paddingBottom: '4rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Featured Projects</h2>
          <Link to="/projects" style={{ fontSize: '0.875rem', color: 'var(--color-accent-light)' }}>View all →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {featured.map((p) => <ProjectCard key={p.slug} project={p} />)}
        </div>
      </section>

      {/* Recent Blog Posts */}
      {recentPosts.length > 0 && (
        <section style={{ paddingTop: '4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Recent Posts</h2>
            <Link to="/blog" style={{ fontSize: '0.875rem', color: 'var(--color-accent-light)' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentPosts.map((post) => <BlogCard key={post.slug} post={post} />)}
          </div>
        </section>
      )}
    </div>
  )
}
