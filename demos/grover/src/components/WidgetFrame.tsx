import type { ReactNode } from 'react'

let figCounter = 0
const figNumbers = new Map<string, number>()

/** Stable "FIG. n" numbering per widget id, in mount order of first use. */
function figNumber(id: string): number {
  let n = figNumbers.get(id)
  if (n === undefined) {
    n = ++figCounter
    figNumbers.set(id, n)
  }
  return n
}

export interface WidgetFrameProps {
  id: string
  title: string
  caption?: ReactNode
  right?: ReactNode
  children: ReactNode
}

/** The instrument panel: mono title bar, body, italic caption. */
export function WidgetFrame({ id, title, caption, right, children }: WidgetFrameProps) {
  return (
    <figure className="widget" style={{ margin: '2.2rem auto' }}>
      <div className="widget-title">
        <span>
          <span className="fig">Fig. {figNumber(id)}</span>
          {'  ·  '}
          {title}
        </span>
        {right}
      </div>
      <div className="widget-body">{children}</div>
      {caption && <figcaption className="widget-caption">{caption}</figcaption>}
    </figure>
  )
}
