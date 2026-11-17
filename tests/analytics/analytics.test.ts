import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyLink, createAnalytics, normalizePath, pageViewProperties, type EventProperties, type Tracker } from '../../src/lib/analytics.ts'

const base = 'https://andeplane.github.io/projects/tube-sim'
const appRoutes = ['/', '/projects', '/projects/tube-sim', '/blog', '/about', '/interests/music']
const isAppRoute = (pathname: string) => appRoutes.includes(pathname.replace(/(.)\/$/, '$1'))

interface Sent { event: string, properties: EventProperties, viaBeacon: boolean }

function recordingTracker(): { tracker: Tracker, sent: Sent[] } {
  const sent: Sent[] = []
  return { sent, tracker: { track: (event, properties, viaBeacon) => { sent.push({ event, properties, viaBeacon }) } } }
}

test('page views name the section and the item within it', () => {
  assert.deepEqual(pageViewProperties({ pathname: '/', search: '' }, 'Home'), { path: '/', section: 'home', item: null, query: null, title: 'Home' })
  assert.deepEqual(pageViewProperties({ pathname: '/projects/tube-sim', search: '?x=1' }, ''), { path: '/projects/tube-sim', section: 'projects', item: 'tube-sim', query: '?x=1', title: null })
  assert.deepEqual(pageViewProperties({ pathname: '/experiments/pendulum-writer/', search: '' }, ''), { path: '/experiments/pendulum-writer', section: 'experiments', item: 'pendulum-writer', query: null, title: null })
  assert.equal(normalizePath('//'), '/')
  assert.equal(pageViewProperties({ pathname: '/interests/neural-operators/reading', search: '' }, '').item, 'neural-operators/reading')
})

test('standalone demos on this domain are demo opens, named after their folder', () => {
  assert.deepEqual(classifyLink('/demos/am-radio/', base, isAppRoute), { kind: 'demo', url: 'https://andeplane.github.io/demos/am-radio/', demo: 'am-radio' })
  assert.deepEqual(classifyLink('https://andeplane.github.io/ai-data-analytics/', base, isAppRoute), { kind: 'demo', url: 'https://andeplane.github.io/ai-data-analytics/', demo: 'ai-data-analytics' })
  assert.equal(classifyLink('/explore-titanic/index.html', base, isAppRoute)?.demo, 'explore-titanic')
})

test('other sites are outbound links', () => {
  assert.deepEqual(classifyLink('https://github.com/andeplane/tube-sim', base, isAppRoute), { kind: 'outbound', url: 'https://github.com/andeplane/tube-sim', demo: null })
})

test('app routes, assets, fragments, mail links and garbage are not tracked as clicks', () => {
  for (const href of ['/projects', '/about/', '/', '#section', '/projects/preview.png', '/blog/paper.pdf', 'mailto:a@example.com', 'javascript:void(0)']) {
    assert.equal(classifyLink(href, base, isAppRoute), null, href)
  }
  assert.equal(classifyLink('http://[bad', base, isAppRoute), null)
  assert.equal(classifyLink('/', base, () => false), null)
})

test('a page view is sent once per distinct path and query', () => {
  const { tracker, sent } = recordingTracker()
  const analytics = createAnalytics(tracker, base, isAppRoute)
  analytics.pageView({ pathname: '/', search: '' }, 'Home')
  analytics.pageView({ pathname: '/', search: '' }, 'Home')
  analytics.pageView({ pathname: '/', search: '?tab=2' }, 'Home')
  analytics.pageView({ pathname: '/about', search: '' }, 'About')
  analytics.pageView({ pathname: '/about/', search: '' }, 'About')
  assert.deepEqual(sent.map(s => [s.event, s.properties.path, s.properties.query, s.viaBeacon]), [
    ['Homepage.Page Viewed', '/', null, false],
    ['Homepage.Page Viewed', '/', '?tab=2', false],
    ['Homepage.Page Viewed', '/about', null, false],
  ])
})

test('demo opens say where the visitor came from, and use a beacon when the page is replaced', () => {
  const { tracker, sent } = recordingTracker()
  const analytics = createAnalytics(tracker, base, isAppRoute)
  analytics.linkClick({ href: 'https://andeplane.github.io/demos/am-radio/', text: '  Open the\n radio lab ↗ ', newTab: false }, { pathname: '/projects/am-radio', search: '' })
  assert.deepEqual(sent, [{
    event: 'Homepage.Demo Opened',
    viaBeacon: true,
    properties: { url: 'https://andeplane.github.io/demos/am-radio/', link_text: 'Open the radio lab ↗', from_path: '/projects/am-radio', from_section: 'projects', from_item: 'am-radio', demo: 'am-radio' },
  }])
})

test('outbound clicks carry the host, and a new tab needs no beacon', () => {
  const { tracker, sent } = recordingTracker()
  const analytics = createAnalytics(tracker, base, isAppRoute)
  analytics.linkClick({ href: 'https://linkedin.com/in/andershaf/', text: '', newTab: true }, { pathname: '/about', search: '' })
  analytics.linkClick({ href: '/projects', text: 'Projects', newTab: false }, { pathname: '/about', search: '' })
  assert.deepEqual(sent, [{
    event: 'Homepage.Outbound Link Clicked',
    viaBeacon: false,
    properties: { url: 'https://linkedin.com/in/andershaf/', link_text: null, from_path: '/about', from_section: 'about', from_item: null, host: 'linkedin.com' },
  }])
})
