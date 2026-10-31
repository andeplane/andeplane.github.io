// Visitor analytics, kept free of the Mixpanel SDK and the router so it can be
// unit tested with plain fakes. src/lib/mixpanel.ts wires it to the real thing.

// Every app shares one Mixpanel project; the prefix keeps the homepage's events apart.
export const EVENT_PREFIX = 'Homepage.'

export type EventProperties = Record<string, string | null>

export interface Tracker {
  track(event: string, properties: EventProperties, viaBeacon: boolean): void
}

export interface PageLocation {
  pathname: string
  search: string
}

export type LinkKind = 'demo' | 'outbound'

export interface ClassifiedLink {
  kind: LinkKind
  url: string
  demo: string | null
}

// Splits a path into the site area (first segment) and the item in it, so a
// dashboard can break page views down by "projects" and then by project slug.
export function pageViewProperties(location: PageLocation, title: string): EventProperties {
  const segments = location.pathname.split('/').filter(Boolean)
  return {
    path: location.pathname,
    section: segments[0] ?? 'home',
    item: segments.length > 1 ? segments.slice(1).join('/') : null,
    query: location.search || null,
    title: title || null,
  }
}

// Same-origin paths the app router does not own are standalone pages: the
// demos under /demos/ and the other repositories served from this GitHub Pages
// domain. Leaving the SPA for one of them is a demo open. Any other http(s)
// destination is an outbound link; mailto:, fragments and SPA links are ignored.
export function classifyLink(
  href: string,
  baseUrl: string,
  isAppRoute: (pathname: string) => boolean,
): ClassifiedLink | null {
  let url: URL
  try {
    url = new URL(href, baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const base = new URL(baseUrl)
  if (url.origin !== base.origin) return { kind: 'outbound', url: url.href, demo: null }

  if (isAppRoute(url.pathname)) return null
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith('.html')) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null
  const demo = segments[0] === 'demos' && segments[1] ? segments[1] : segments[0]
  return { kind: 'demo', url: url.href, demo }
}

export interface LinkClick {
  href: string
  text: string
  newTab: boolean
}

export interface Analytics {
  pageView(location: PageLocation, title: string): void
  linkClick(click: LinkClick, from: PageLocation): void
}

export function createAnalytics(
  tracker: Tracker,
  baseUrl: string,
  isAppRoute: (pathname: string) => boolean,
): Analytics {
  let lastPage: string | null = null

  return {
    pageView(location, title) {
      // The router reports state changes that keep the same URL (loaders,
      // revalidation); only a new path or query is a new page view.
      const key = location.pathname + location.search
      if (key === lastPage) return
      lastPage = key
      tracker.track(EVENT_PREFIX + 'Page Viewed', pageViewProperties(location, title), false)
    },

    linkClick(click, from) {
      const link = classifyLink(click.href, baseUrl, isAppRoute)
      if (!link) return
      const fromPage = pageViewProperties(from, '')
      const properties: EventProperties = {
        url: link.url,
        link_text: click.text.trim().replace(/\s+/g, ' ').slice(0, 120) || null,
        from_path: fromPage.path,
        from_section: fromPage.section,
        from_item: fromPage.item,
      }
      // A link that replaces this page would cancel a normal request, so
      // send it as a beacon; a new tab leaves this page alive.
      const viaBeacon = !click.newTab
      if (link.kind === 'demo') {
        tracker.track(EVENT_PREFIX + 'Demo Opened', { ...properties, demo: link.demo }, viaBeacon)
      } else {
        tracker.track(EVENT_PREFIX + 'Outbound Link Clicked', { ...properties, host: new URL(link.url).host }, viaBeacon)
      }
    },
  }
}
