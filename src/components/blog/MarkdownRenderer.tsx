import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface Props {
  content: string
}

const components: Components = {
  // Code blocks
  pre({ children, ...props }) {
    return (
      <pre
        {...props}
        style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '1.25rem',
          overflowX: 'auto',
          marginBottom: '1.5em',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        {children}
      </pre>
    )
  },
  code({ className, children, ...props }) {
    const isInline = !className
    if (isInline) {
      return (
        <code
          {...props}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875em',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            padding: '0.15em 0.4em',
          }}
        >
          {children}
        </code>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
