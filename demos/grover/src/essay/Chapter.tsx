import type { ReactNode } from 'react'

export function Chapter({
  no,
  title,
  children,
}: {
  no: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="chapter">
      <div className="chapter-head">
        <span className="no">{no}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

/** A prose column block; widgets sit between these at full width. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose">{children}</div>
}
