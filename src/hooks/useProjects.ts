import { useMemo } from 'react'
import type { ProjectMeta } from '@/types'

const modules = import.meta.glob<{ default: ProjectMeta }>('/src/content/projects/*.ts', { eager: true })

export function useProjects(): ProjectMeta[] {
  return useMemo(() => {
    return Object.values(modules)
      .map((m) => m.default)
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [])
}

export function useProject(slug: string): ProjectMeta | undefined {
  return useMemo(() => {
    return Object.values(modules)
      .map((m) => m.default)
      .find((p) => p.slug === slug)
  }, [slug])
}
