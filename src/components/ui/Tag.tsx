interface TagProps {
  label: string
}

export default function Tag({ label }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2em 0.6em',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 500,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-muted)',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  )
}
