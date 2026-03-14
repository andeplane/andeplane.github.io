import { Link } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjects } from '@/hooks/useProjects'
import { useBlogPosts } from '@/hooks/useBlogPosts'
import ProjectCard from '@/components/projects/ProjectCard'
import BlogCard from '@/components/blog/BlogCard'
import type { ProjectMeta } from '@/types'

const VISIBLE = 3
const INTERVAL = 5000

function ProjectCarousel({ projects }: { projects: ProjectMeta[] }) {
  const [index, setIndex] = useState(0)
  const paused = useRef(false)
  const n = projects.length

  const next = useCallback(() => setIndex((i) => (i + 1) % n), [n])
  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % n), [n])

  useEffect(() => {
    const id = setInterval(() => { if (!paused.current) next() }, INTERVAL)
    return () => clearInterval(id)
  }, [next])

  const visible = Array.from({ length: VISIBLE }, (_, k) => projects[(index + k) % n])

  return (
    <div
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
        {visible.map((p, k) => <ProjectCard key={`${p.slug}-${k}`} project={p} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
        <button
          onClick={prev}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            color: 'var(--color-text)', cursor: 'pointer', fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          aria-label="Previous"
        >
          ←
        </button>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {projects.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                border: 'none',
                cursor: 'pointer',
                background: i === index ? 'var(--color-accent)' : 'var(--color-border)',
                padding: 0,
                transition: 'width 0.3s, background 0.3s',
              }}
              aria-label={`Go to project ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={next}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            color: 'var(--color-text)', cursor: 'pointer', fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          aria-label="Next"
        >
          →
        </button>
      </div>
    </div>
  )
}

export default function Home() {
  const projects = useProjects()
  const { posts } = useBlogPosts()
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
          Engineering Manager at <a href="https://www.cognite.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-light)' }}>Cognite</a>, PhD in computational physics from the University of Oslo. I build simulations, games, and AI-powered tools — mostly in TypeScript, C++, and Python, often in the browser. I love graphics programming and getting things to run in the browser — especially pushing what's possible with WebAssembly and WebGPU.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            to="/projects"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.65rem 1.5rem', background: 'var(--color-accent)',
              color: '#fff', borderRadius: '8px', fontWeight: 600, fontSize: '0.95rem',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent-hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)' }}
          >
            View Projects →
          </Link>
          <Link
            to="/about"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0.65rem 1.5rem', background: 'transparent',
              color: 'var(--color-text)', border: '1px solid var(--color-border)',
              borderRadius: '8px', fontWeight: 500, fontSize: '0.95rem',
              textDecoration: 'none', transition: 'border-color 0.15s',
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
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Projects</h2>
          <Link to="/projects" style={{ fontSize: '0.875rem', color: 'var(--color-accent-light)' }}>View all →</Link>
        </div>
        {projects.length > 0 && <ProjectCarousel projects={projects} />}
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
