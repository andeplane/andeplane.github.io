import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
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
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 1.5rem',
          height: '60px',
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

        <ul style={{ display: 'flex', gap: '0.25rem', listStyle: 'none', margin: 0, padding: 0 }}>
          {links.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({
                  padding: '0.375rem 0.875rem',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#fff' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-surface-2)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'color 0.15s, background 0.15s',
                })}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
