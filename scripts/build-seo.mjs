// Runs after `vite build`. Copies dist/index.html to a real file at every route
// and rewrites the title/description/canonical/og tags for that page, then
// writes the sitemap. Without this, GitHub Pages answers /blog/<slug> with a
// 404 — a redirect shim would too, which is why we emit files instead.
//
// This is not prerendering: the body is still an empty #root that the crawler
// has to render. What it buys is a 200 at a real URL with the right metadata,
// which is the part a crawler cannot work around on its own.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { siteRoutes, SITE_URL } from './routes.mjs'

const DIST = new URL('../dist/', import.meta.url)

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// GitHub Pages serves /blog/x/index.html and 301s /blog/x to /blog/x/, so the
// slashed form is the one to advertise: a canonical pointing at the redirect
// would make every crawled URL take an extra hop.
const canonical = (path) => SITE_URL + path + (path.endsWith('/') ? '' : '/')

/** Replace the content of a meta tag, matching however it is written. */
function setMeta(html, attr, name, value) {
  const re = new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`)
  if (!re.test(html)) throw new Error(`index.html has no <meta ${attr}="${name}">`)
  return html.replace(re, `$1${escape(value)}$2`)
}

function shell(template, route) {
  const url = canonical(route.path)
  let html = template
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${escape(route.title)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
  html = setMeta(html, 'name', 'description', route.description)
  html = setMeta(html, 'property', 'og:title', route.title)
  html = setMeta(html, 'property', 'og:description', route.description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'name', 'twitter:title', route.title)
  html = setMeta(html, 'name', 'twitter:description', route.description)
  if (route.image) {
    html = setMeta(html, 'property', 'og:image', SITE_URL + route.image)
    html = setMeta(html, 'name', 'twitter:image', SITE_URL + route.image)
  }
  // A blog post is an article, not the site's front page.
  if (route.path.startsWith('/blog/')) html = setMeta(html, 'property', 'og:type', 'article')
  return html
}

function sitemap(routes) {
  const urls = routes
    .map((r) => `  <url><loc>${escape(canonical(r.path))}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

const template = await readFile(new URL('index.html', DIST), 'utf8')
const routes = await siteRoutes()

for (const route of routes) {
  if (route.path === '/') continue // vite already wrote it
  const dir = new URL(`.${route.path}/`, DIST)
  await mkdir(dir, { recursive: true })
  await writeFile(new URL('index.html', dir), shell(template, route))
}

await writeFile(new URL('sitemap.xml', DIST), sitemap(routes))

console.log(`build-seo: ${routes.length - 1} route shells + sitemap.xml`)
