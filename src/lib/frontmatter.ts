export interface ParsedMarkdown<T = Record<string, unknown>> {
  data: T
  content: string
}

// Minimal frontmatter parser (replaces gray-matter, which needs Node's Buffer
// and crashes in the browser). Supports the flat `key: <JSON value>` format
// used by all posts: quoted strings and arrays of strings.
export function parseFrontmatter<T = Record<string, unknown>>(raw: string): ParsedMarkdown<T> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { data: {} as T, content: raw }

  const data: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim()
    if (!key) continue
    try {
      data[key] = JSON.parse(value)
    } catch {
      data[key] = value
    }
  }
  return { data: data as T, content: raw.slice(match[0].length) }
}
