export interface ProjectMeta {
  slug: string
  title: string
  description: string
  longDescription: string
  tags: string[]
  liveUrl?: string
  repoUrl?: string
  screenshot?: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  date: string
  description: string
  tags: string[]
}
