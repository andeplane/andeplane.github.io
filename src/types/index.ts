export interface ProjectMeta {
  slug: string
  title: string
  description: string
  longDescription: string
  tags: string[]
  liveUrl?: string
  repoUrl?: string
  screenshot?: string
  portrait?: boolean
}

export interface BlogPostMeta {
  slug: string
  title: string
  date: string
  description: string
  tags: string[]
}
