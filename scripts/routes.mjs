// Every URL the router can serve, with the title and description that page
// should ship in its HTML. GitHub Pages has no server-side rewrite, so each of
// these needs a real file on disk (build-seo.mjs) or it 404s on direct load —
// which is also why a crawler could never index the site while it used hashes.
import { readdir, readFile } from 'node:fs/promises'

export const SITE_URL = 'https://andeplane.github.io'
const SUFFIX = 'Anders Hafreager (andeplane)'

const CONTENT = new URL('../src/content/', import.meta.url)

const STATIC_ROUTES = [
  {
    path: '/projects',
    title: 'Projects',
    description:
      'Browser-native simulations and tools: finite elements, molecular dynamics, ray tracing, acoustics and games, each running entirely in a tab.',
  },
  {
    path: '/blog',
    title: 'Writing',
    description:
      'Posts on physics, numerical methods, graphics and music — each one built around something interactive you can poke at.',
  },
  {
    path: '/about',
    title: 'About',
    description:
      'Anders Hafreager (andeplane) — Vice President of Engineering at Cognite, with a PhD in computational physics from the University of Oslo.',
  },
  {
    path: '/interests',
    title: 'Interests',
    description: 'Maths, physics, 3D rendering and music, explored through things that run in a browser.',
  },
  {
    path: '/interests/physics',
    title: 'Physics',
    description: 'Molecular dynamics, statistical mechanics and relativity, as interactive experiments rather than equations on a page.',
  },
  {
    path: '/interests/music',
    title: 'Music',
    description: 'Intervals, tuning and wind-instrument acoustics, taught through simulations you can play.',
  },
  {
    path: '/interests/3d-rendering',
    title: '3D rendering',
    description: 'Ray tracing, implicit surfaces and GPU rendering — from a sphere in a pixel shader to a quartic torus.',
  },
]

// Mirrors the `tabs` array in src/features/neural-operators/NeuralOperators.tsx.
const NEURAL_OPERATOR_TABS = [
  ['overview', 'Start here'],
  ['labs', 'Learning labs'],
  ['concepts', 'Concepts'],
  ['graph', 'Literature graph'],
  ['timeline', 'Timeline'],
  ['reading', 'Papers & reading'],
]

function frontmatter(raw) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!block) return {}
  const data = {}
  for (const line of block[1].split(/\r?\n/)) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    if (!key) continue
    try {
      data[key] = JSON.parse(line.slice(sep + 1).trim())
    } catch {
      data[key] = line.slice(sep + 1).trim()
    }
  }
  return data
}

async function blogRoutes() {
  const dir = new URL('blog/', CONTENT)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'))
  return Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.md$/, '')
      const { title, description } = frontmatter(await readFile(new URL(file, dir), 'utf8'))
      return {
        path: `/blog/${slug}`,
        title: title ?? slug,
        description: description ?? '',
      }
    })
  )
}

async function projectRoutes() {
  const dir = new URL('projects/', CONTENT)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'))
  return Promise.all(
    files.map(async (file) => {
      // Type stripping lets us read the real module instead of regexing it, so
      // a renamed field breaks the build rather than silently emptying a tag.
      const { default: project } = await import(new URL(file, dir).href)
      return {
        path: `/projects/${project.slug}`,
        title: project.title,
        description: project.description.replace(/\s+/g, ' ').trim(),
        image: project.screenshot,
      }
    })
  )
}

/** Every indexable route, homepage first. */
export async function siteRoutes() {
  const [blog, projects] = await Promise.all([blogRoutes(), projectRoutes()])
  const neural = NEURAL_OPERATOR_TABS.map(([id, label], i) => ({
    path: i === 0 ? '/interests/neural-operators' : `/interests/neural-operators/${id}`,
    title: `${label} · Neural operators`,
    description:
      'A reading path through neural operators: what the papers establish, what they do not, and interactive labs for the mechanisms behind them.',
  }))

  return [
    { path: '/', title: null, description: null }, // index.html already carries these
    ...STATIC_ROUTES,
    ...neural,
    ...projects.sort((a, b) => a.path.localeCompare(b.path)),
    ...blog.sort((a, b) => a.path.localeCompare(b.path)),
  ].map((r) => ({ ...r, title: r.title ? `${r.title} · ${SUFFIX}` : null }))
}

/** Route paths declared in the router, with `:param` segments expanded. */
export async function routerPaths() {
  const src = await readFile(new URL('../src/router/index.tsx', import.meta.url), 'utf8')
  return [...src.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '/')
}
