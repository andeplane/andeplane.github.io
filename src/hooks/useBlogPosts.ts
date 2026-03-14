import { useState, useEffect } from 'react'
import { parseFrontmatter } from '@/lib/frontmatter'
import type { BlogPostMeta } from '@/types'

const rawModules = import.meta.glob('/src/content/blog/*.md', { query: '?raw', eager: false })

function slugFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '')
}

export function useBlogPosts(): { posts: BlogPostMeta[]; loading: boolean } {
  const [posts, setPosts] = useState<BlogPostMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const entries = Object.entries(rawModules)

    Promise.all(
      entries.map(async ([path, load]) => {
        const mod = await load() as { default: string }
        const { data } = parseFrontmatter<Omit<BlogPostMeta, 'slug'>>(mod.default)
        return {
          slug: slugFromPath(path),
          title: data.title ?? 'Untitled',
          date: data.date ?? '',
          description: data.description ?? '',
          tags: data.tags ?? [],
        } satisfies BlogPostMeta
      })
    ).then((result) => {
      if (!cancelled) {
        setPosts(result.sort((a, b) => b.date.localeCompare(a.date)))
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { posts, loading }
}

export function useBlogPost(slug: string): { content: string; meta: BlogPostMeta | null; loading: boolean } {
  const [content, setContent] = useState('')
  const [meta, setMeta] = useState<BlogPostMeta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const entry = Object.entries(rawModules).find(([path]) => slugFromPath(path) === slug)
    if (!entry) {
      setLoading(false)
      return
    }

    const [path, load] = entry
    load().then((mod) => {
      if (!cancelled) {
        const m = mod as { default: string }
        const { data, content: body } = parseFrontmatter<Omit<BlogPostMeta, 'slug'>>(m.default)
        setMeta({
          slug: slugFromPath(path),
          title: data.title ?? 'Untitled',
          date: data.date ?? '',
          description: data.description ?? '',
          tags: data.tags ?? [],
        })
        setContent(body)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [slug])

  return { content, meta, loading }
}
