export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--color-border)',
        marginTop: '6rem',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: '0.85rem',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span>© {new Date().getFullYear()} Anders Hafreager</span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <a href="https://github.com/andeplane" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-muted)' }}>
            GitHub
          </a>
          <a href="https://linkedin.com/in/andershaf/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-muted)' }}>
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  )
}
