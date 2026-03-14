import matter from 'gray-matter'

export interface ParsedMarkdown<T = Record<string, unknown>> {
  data: T
  content: string
}

export function parseFrontmatter<T = Record<string, unknown>>(raw: string): ParsedMarkdown<T> {
  const { data, content } = matter(raw)
  return { data: data as T, content }
}
