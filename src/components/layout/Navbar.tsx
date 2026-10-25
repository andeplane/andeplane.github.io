import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { projectCategories } from '@/lib/projectCategories'
import './navbar.css'

const links = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/interests', label: 'Interests' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLLIElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const openedByHover = useRef(false)
  const location = useLocation()
  const projectsActive = /^\/(projects|hardware|games)(\/|$)/.test(location.pathname)
  useEffect(() => { setOpen(false) }, [location])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        if (menu.current?.contains(document.activeElement)) toggle.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <nav
        aria-label="Main navigation"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          paddingLeft: 'max(clamp(0.75rem, 4vw, 1.5rem), env(safe-area-inset-left))',
          paddingRight: 'max(clamp(0.75rem, 4vw, 1.5rem), env(safe-area-inset-right))',
          minHeight: '60px',
          flexWrap: 'wrap',
          gap: '0.5rem',
          paddingBlock: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <NavLink
          to="/"
          style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', textDecoration: 'none', letterSpacing: '-0.02em' }}
        >
          andeplane
        </NavLink>

        <ul style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }}>
          {links.map(({ to, label }) => to === '/projects' ? (
            <li key={to} ref={menu} className="projects-nav"
              onPointerEnter={event => { if (event.pointerType === 'mouse') { openedByHover.current = true; setOpen(true) } }}
              onPointerLeave={event => { if (event.pointerType === 'mouse') { openedByHover.current = false; if (!event.currentTarget.contains(document.activeElement)) setOpen(false) } }}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
              <div className={`projects-nav-control${projectsActive ? ' is-active' : ''}`}>
                <Link to="/projects" className="site-nav-item" aria-current={location.pathname === '/projects' && !location.search ? 'page' : undefined}>Projects</Link>
                <button ref={toggle} type="button" className="projects-nav-toggle" aria-label="Show project categories"
                  aria-expanded={open} aria-controls="project-categories"
                  onClick={() => { setOpen(openedByHover.current || !open); openedByHover.current = false }}
                  onKeyDown={event => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setOpen(true)
                      requestAnimationFrame(() => menu.current?.querySelector<HTMLAnchorElement>('.projects-dropdown a')?.focus())
                    }
                  }}><ChevronDown size={14} aria-hidden="true" /></button>
              </div>
              <div id="project-categories" className="projects-dropdown" hidden={!open}>
                <nav aria-label="Project categories">
                  <Link to="/projects">All projects</Link>
                  {projectCategories.map(category => (
                    <Link key={category.id} to={`/projects?category=${category.id}`}
                      aria-current={location.pathname === '/projects' && new URLSearchParams(location.search).get('category') === category.id ? 'page' : undefined}>{category.label}</Link>
                  ))}
                </nav>
              </div>
            </li>
          ) : (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => `site-nav-item${isActive ? ' is-active' : ''}`}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
