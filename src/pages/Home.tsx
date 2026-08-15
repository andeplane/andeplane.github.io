import { Link } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useProjects } from '@/hooks/useProjects'
import { useBlogPosts } from '@/hooks/useBlogPosts'
import ProjectCard from '@/components/projects/ProjectCard'
import BlogCard from '@/components/blog/BlogCard'
import type { ProjectMeta } from '@/types'

const INTERVAL = 5000

const ANIM_MS = 400

// The carousel slides whole columns; each column stacks this many cards.
const ROWS = 2

function useVisibleCount(): number {
  const [visible, setVisible] = useState(3)

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 640px)')
    const medium = window.matchMedia('(max-width: 960px)')
    const update = () => setVisible(narrow.matches ? 1 : medium.matches ? 2 : 3)
    update()
    narrow.addEventListener('change', update)
    medium.addEventListener('change', update)
    return () => {
      narrow.removeEventListener('change', update)
      medium.removeEventListener('change', update)
    }
  }, [])

  return visible
}

function ProjectCarousel({ projects }: { projects: ProjectMeta[] }) {
  const [index, setIndex] = useState(0)
  const [shift, setShift] = useState(0)
  const [animating, setAnimating] = useState(false)
  const paused = useRef(false)
  const visible = useVisibleCount()
  const n = projects.length

  const navigate = useCallback((delta: number) => {
    if (animating || delta === 0) return
    setShift(delta)
    setAnimating(true)
    setTimeout(() => {
      setIndex((i) => (((i + delta) % n) + n) % n)
      setAnimating(false)
    }, ANIM_MS)
  }, [animating, n])

  const next = useCallback(() => navigate(1), [navigate])
  const prev = useCallback(() => navigate(-1), [navigate])
  const goTo = useCallback((i: number) => navigate(i - index), [navigate, index])

  useEffect(() => {
    const id = setInterval(() => { if (!paused.current) next() }, INTERVAL)
    return () => clearInterval(id)
  }, [next])

  // Never show more slots than there are projects, or a project would appear twice.
  const rows = Math.min(ROWS, n)
  const count = Math.max(1, Math.min(visible, Math.floor(n / rows)))
  const gap = '1.25rem'
  const cardWidth = `calc((100% - ${count - 1} * ${gap}) / ${count})`
  const step = `calc(${cardWidth} + ${gap})`

  // While animating, the track holds the visible columns plus the |shift|
  // columns sliding in (appended when moving forward, prepended when moving
  // back), and translates by exactly shift × one column width.
  const windowStart = animating && shift < 0 ? index + shift : index
  const at = (i: number) => projects[(((i % n) + n) % n)]
  // Projects run left-to-right along the top row and continue on the second
  // row, so column k holds project k and the one `count` positions later.
  // Advancing by one keeps every slot filled even when n is odd.
  const columns = Array.from(
    { length: animating ? count + Math.abs(shift) : count },
    (_, k) => Array.from({ length: rows }, (_, r) => at(windowStart + k + r * count)),
  )

  const trackStyle = {
    display: 'flex',
    gap,
    animation: animating ? `carousel-shift cubic-bezier(0.4, 0, 0.2, 1) ${ANIM_MS}ms both` : undefined,
    '--carousel-from': animating && shift < 0 ? `calc(${shift} * ${step})` : '0px',
    '--carousel-to': animating && shift > 0 ? `calc(${-shift} * ${step})` : '0px',
  } as CSSProperties

  const edgeArrowStyle = (side: 'left' | 'right'): CSSProperties => ({
    position: 'absolute',
    [side]: '-18px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
    color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.15s',
  })

  return (
    <div
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={trackStyle}>
            {columns.map((column, k) => (
              <div
                key={`${column[0].slug}-${k}`}
                style={{
                  flex: `0 0 ${cardWidth}`,
                  minWidth: 0,
                  display: 'grid',
                  gridTemplateRows: `repeat(${rows}, 1fr)`,
                  gap,
                }}
              >
                {column.map((p, r) => <ProjectCard key={`${p.slug}-${r}`} project={p} />)}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={prev}
          style={edgeArrowStyle('left')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          aria-label="Previous"
        >
          ←
        </button>
        <button
          onClick={next}
          style={edgeArrowStyle('right')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
          aria-label="Next"
        >
          →
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1.5rem' }}>
        {projects.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
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
