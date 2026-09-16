import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdir } from 'node:fs/promises'
import { siteRoutes, routerPaths } from '../../scripts/routes.mjs'

const routes = await siteRoutes()
const paths = new Set(routes.map((r) => r.path))

// The whole point of the shells: a route the router serves but build-seo does
// not emit is a 404 on direct load and is invisible to a crawler.
test('every router path has a shell to be served from', async () => {
  for (const declared of await routerPaths()) {
    const path = '/' + declared
    if (!path.includes(':')) {
      assert.ok(paths.has(path), `router serves ${path} but no shell is generated for it`)
      continue
    }
    const prefix = path.slice(0, path.indexOf('/:'))
    assert.ok(
      routes.some((r) => r.path.startsWith(prefix + '/')),
      `router serves ${path} but no shell is generated under ${prefix}/`
    )
  }
})

test('every blog post and project gets its own URL', async () => {
  const blog = (await readdir(new URL('../../src/content/blog/', import.meta.url))).filter((f) => f.endsWith('.md'))
  const projects = (await readdir(new URL('../../src/content/projects/', import.meta.url))).filter((f) => f.endsWith('.ts'))

  for (const file of blog) assert.ok(paths.has(`/blog/${file.replace(/\.md$/, '')}`), file)
  assert.equal(routes.filter((r) => r.path.startsWith('/projects/')).length, projects.length)
})

test('shells carry a title and description, and the homepage keeps the ones in index.html', () => {
  assert.ok(paths.has('/'))
  for (const route of routes) {
    if (route.path === '/') {
      assert.equal(route.title, null)
      continue
    }
    assert.match(route.title, /andeplane/, `${route.path} title`)
    assert.ok(route.description.length > 20, `${route.path} has no usable description`)
  }
})

test('paths are unique', () => {
  assert.equal(paths.size, routes.length)
})
