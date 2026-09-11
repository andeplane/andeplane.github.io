import { useMemo } from 'react'
import type { ProjectMeta } from '@/types'

const modules = import.meta.glob<{ default: ProjectMeta }>('/src/content/projects/*.ts', { eager: true })

// Shared by the Projects page and the homepage carousel.
const featuredSlugs = ['fem-lab', 'atomify', 'lunarlander', 'particle-defence', 'teslacode']
const featuredRank = new Map(featuredSlugs.map((slug, index) => [slug, index]))

export function useProjects(): ProjectMeta[] {
  return useMemo(() => {
    return Object.values(modules)
      .map((m) => m.default)
      .sort((a, b) => {
        const rankA = featuredRank.get(a.slug) ?? featuredSlugs.length
        const rankB = featuredRank.get(b.slug) ?? featuredSlugs.length
        return rankA - rankB || a.title.localeCompare(b.title)
      })
  }, [])
}

export function useProject(slug: string): ProjectMeta | undefined {
  return useMemo(() => {
    return Object.values(modules)
      .map((m) => m.default)
      .find((p) => p.slug === slug)
  }, [slug])
}
