import { useMemo } from 'react'
import katex from 'katex'

/** Inline math. Usage: <M>{String.raw`\sqrt{N}`}</M> */
export function M({ children }: { children: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { throwOnError: false }),
    [children],
  )
  return <span className="math" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Display math on its own line. */
export function MD({ children }: { children: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { throwOnError: false, displayMode: true }),
    [children],
  )
  return <div className="math-display" dangerouslySetInnerHTML={{ __html: html }} />
}
