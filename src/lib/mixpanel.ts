import { matchRoutes } from 'react-router-dom'
import type { router as appRouter } from '@/router'
import { createAnalytics, type Tracker } from '@/lib/analytics'

const token = import.meta.env.VITE_MIXPANEL_TOKEN
const apiHost = import.meta.env.VITE_MIXPANEL_API_HOST

// Tracks page views and clicks that leave the app. Only production builds
// with a token configured send anything, so local development stays silent.
// The SDK is loaded on demand so it never delays the first render.
export async function startAnalytics(router: typeof appRouter): Promise<void> {
  if (!import.meta.env.PROD || !token) return
  const { default: mixpanel } = await import('mixpanel-browser')

  mixpanel.init(token, {
    ...(apiHost ? { api_host: apiHost } : {}),
    track_pageview: false,
    autocapture: false,
    persistence: 'localStorage',
    // A visit is a handful of events, often ending in a jump to a demo or a
    // closed tab; send each one straight away instead of batching.
    batch_requests: false,
  })

  const tracker: Tracker = {
    track(event, properties, viaBeacon) {
      mixpanel.track(event, properties, viaBeacon ? { transport: 'sendBeacon' } : undefined)
    },
  }
  const isAppRoute = (pathname: string) => matchRoutes(router.routes, pathname) !== null
  const analytics = createAnalytics(tracker, window.location.origin, isAppRoute)

  // Pages set their title in effects, after the router has settled.
  const pageView = () => setTimeout(() => analytics.pageView(router.state.location, document.title))
  pageView()
  router.subscribe(state => {
    if (state.navigation.state === 'idle') pageView()
  })

  const onClick = (event: MouseEvent) => {
    if (event.button > 1) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(anchor instanceof HTMLAnchorElement)) return
    const newTab = anchor.target === '_blank' || event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey
    analytics.linkClick({ href: anchor.href, text: anchor.textContent?.trim() || anchor.getAttribute('aria-label') || '', newTab }, router.state.location)
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('auxclick', onClick, true)
}
