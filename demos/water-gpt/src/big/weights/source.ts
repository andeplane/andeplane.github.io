/**
 * Where the weights come from. In production every file is fetched straight from
 * Hugging Face by the visitor's browser and kept in the Cache API, so a second visit
 * fills the reservoirs from disk. Nothing derived from the weights is ever committed.
 *
 * Overrides (for development and headless tests, since this repo's CI has no weights):
 *   ?weights=http://localhost:8124/   serve the files under their local names (below)
 *   ?gpt2_weights=<url> etc.          override one file
 */

export interface ModelFiles {
  weights: string
  tokenizer: string
  config?: string
}

export const HF_FILES: Record<'gpt2' | 'tinystories', ModelFiles> = {
  gpt2: {
    weights: 'https://huggingface.co/openai-community/gpt2/resolve/main/model.safetensors',
    tokenizer: 'https://huggingface.co/openai-community/gpt2/resolve/main/tokenizer.json',
  },
  tinystories: {
    weights: 'https://huggingface.co/roneneldan/TinyStories-33M/resolve/main/pytorch_model.bin',
    // TinyStories ships GPT-Neo's vocab files but no tokenizer.json; the BPE is GPT-2's.
    tokenizer: 'https://huggingface.co/openai-community/gpt2/resolve/main/tokenizer.json',
    config: 'https://huggingface.co/roneneldan/TinyStories-33M/resolve/main/config.json',
  },
}

/** File names used by `?weights=<base>` (matches the dev copies in tools/serve-weights). */
export const LOCAL_NAMES: Record<'gpt2' | 'tinystories', ModelFiles> = {
  gpt2: { weights: 'gpt2.safetensors', tokenizer: 'gpt2-tokenizer.json' },
  tinystories: {
    weights: 'tinystories-33m.pytorch_model.bin',
    tokenizer: 'gpt2-tokenizer.json',
    config: 'tinystories-33m-config.json',
  },
}

export function resolveFiles(model: 'gpt2' | 'tinystories', params?: URLSearchParams): ModelFiles {
  const files = { ...HF_FILES[model] }
  const base = params?.get('weights')
  if (base) {
    const b = base.endsWith('/') ? base : base + '/'
    const local = LOCAL_NAMES[model]
    files.weights = b + local.weights
    files.tokenizer = b + local.tokenizer
    if (local.config) files.config = b + local.config
  }
  const one = (k: keyof ModelFiles) => params?.get(`${model}_${k}`)
  for (const k of ['weights', 'tokenizer', 'config'] as const) {
    const v = one(k)
    if (v) files[k] = v
  }
  return files
}

export const CACHE_NAME = 'water-gpt-weights-v1'

export interface Download {
  body: ReadableStream<Uint8Array>
  /** Total bytes, when the server (or cache) says. */
  size: number | null
  fromCache: boolean
}

/**
 * Open a weights file as a stream. A cached copy is used when present; otherwise the
 * network response is tee'd: one branch feeds the parser, the other the cache.
 */
export async function openDownload(url: string, signal?: AbortSignal): Promise<Download> {
  const cache = await openCache()
  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit && hit.body) return { body: hit.body, size: lengthOf(hit), fromCache: true }
    } catch {
      /* fall through to network */
    }
  }
  const res = await fetch(url, { signal, mode: 'cors' })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${res.statusText} (${url})`)
  const size = lengthOf(res)
  if (!cache) return { body: res.body, size, fromCache: false }
  const [a, b] = res.body.tee()
  const headers = new Headers({ 'content-type': 'application/octet-stream' })
  if (size !== null) headers.set('content-length', String(size))
  // Errors (quota, private mode) only cost the cache, never the load.
  cache.put(url, new Response(b, { headers })).catch(() => cache.delete(url).catch(() => {}))
  return { body: a, size, fromCache: false }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const cache = await openCache()
  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit) return (await hit.json()) as T
    } catch {
      /* ignore */
    }
  }
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`download failed: ${res.status} (${url})`)
  const text = await res.text()
  if (cache) cache.put(url, new Response(text, { headers: { 'content-type': 'application/json' } })).catch(() => {})
  return JSON.parse(text) as T
}

export async function isCached(url: string): Promise<boolean> {
  const cache = await openCache()
  if (!cache) return false
  try {
    return !!(await cache.match(url))
  } catch {
    return false
  }
}

export async function forgetCached(urls: string[]): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  for (const u of urls) await cache.delete(u).catch(() => false)
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(CACHE_NAME)
  } catch {
    return null
  }
}

function lengthOf(res: Response): number | null {
  const v = res.headers.get('content-length')
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
