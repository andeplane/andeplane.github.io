/**
 * GPT-2 byte-level BPE tokenizer, built from a Hugging Face `tokenizer.json`.
 *
 * Shared by GPT-2 small and TinyStories-33M (GPT-Neo uses the same vocabulary).
 * This is the classic algorithm from OpenAI's encoder.py: split text with the GPT-2
 * pre-tokenisation regex, map each UTF-8 byte to a printable unicode character, then
 * greedily apply the lowest-ranked merge until none apply. Tokenisation is digital:
 * it happens before any water moves.
 */

const PRETOKENIZE =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu

function bytesToUnicode(): string[] {
  const bs: number[] = []
  for (let i = 33; i <= 126; i++) bs.push(i)
  for (let i = 161; i <= 172; i++) bs.push(i)
  for (let i = 174; i <= 255; i++) bs.push(i)
  const cs = bs.slice()
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n)
      n++
    }
  }
  const table: string[] = new Array(256)
  for (let i = 0; i < bs.length; i++) table[bs[i]] = String.fromCharCode(cs[i])
  return table
}

export interface TokenizerJson {
  model: { vocab: Record<string, number>; merges: (string | [string, string])[] }
  added_tokens?: { id: number; content: string }[]
}

export class BpeTokenizer {
  readonly vocabSize: number
  readonly eosId: number
  private encoder: Map<string, number>
  private decoder: string[]
  private ranks: Map<string, number>
  private byteEncoder: string[]
  private byteDecoder: Map<string, number>
  private special: Map<string, number>
  private cache = new Map<string, number[]>()
  private textEncoder = new TextEncoder()

  constructor(json: TokenizerJson) {
    this.encoder = new Map(Object.entries(json.model.vocab))
    this.special = new Map()
    for (const t of json.added_tokens ?? []) {
      this.encoder.set(t.content, t.id)
      this.special.set(t.content, t.id)
    }
    let maxId = 0
    for (const id of this.encoder.values()) maxId = Math.max(maxId, id)
    this.vocabSize = maxId + 1
    this.decoder = new Array(this.vocabSize).fill('')
    for (const [tok, id] of this.encoder) this.decoder[id] = tok
    this.ranks = new Map()
    json.model.merges.forEach((m, i) => {
      const key = typeof m === 'string' ? m : `${m[0]} ${m[1]}`
      this.ranks.set(key, i)
    })
    this.byteEncoder = bytesToUnicode()
    this.byteDecoder = new Map(this.byteEncoder.map((c, b) => [c, b]))
    this.eosId = this.special.get('<|endoftext|>') ?? 50256
  }

  private bpe(word: string): number[] {
    const hit = this.cache.get(word)
    if (hit) return hit
    let parts = Array.from(word)
    while (parts.length > 1) {
      let best = -1
      let bestRank = Infinity
      for (let i = 0; i < parts.length - 1; i++) {
        const r = this.ranks.get(parts[i] + ' ' + parts[i + 1])
        if (r !== undefined && r < bestRank) {
          bestRank = r
          best = i
        }
      }
      if (best < 0) break
      const a = parts[best]
      const b = parts[best + 1]
      const merged: string[] = []
      for (let i = 0; i < parts.length; ) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) {
          merged.push(a + b)
          i += 2
        } else {
          merged.push(parts[i])
          i++
        }
      }
      parts = merged
    }
    const ids = parts.map((p) => {
      const id = this.encoder.get(p)
      if (id === undefined) throw new Error(`BPE produced unknown token ${JSON.stringify(p)}`)
      return id
    })
    if (this.cache.size < 50000) this.cache.set(word, ids)
    return ids
  }

  encode(text: string): number[] {
    const out: number[] = []
    // Split out special tokens first so `<|endoftext|>` survives as one token.
    const specials = [...this.special.keys()]
    const segments: string[] = specials.length
      ? text.split(new RegExp(`(${specials.map(escapeRe).join('|')})`))
      : [text]
    for (const seg of segments) {
      if (!seg) continue
      const sp = this.special.get(seg)
      if (sp !== undefined) {
        out.push(sp)
        continue
      }
      for (const m of seg.matchAll(PRETOKENIZE)) {
        const bytes = this.textEncoder.encode(m[0])
        let word = ''
        for (const b of bytes) word += this.byteEncoder[b]
        out.push(...this.bpe(word))
      }
    }
    return out
  }

  /** Raw bytes of a token sequence (so callers can stream partial UTF-8 safely). */
  tokenBytes(ids: number[]): Uint8Array {
    const bytes: number[] = []
    for (const id of ids) {
      const tok = this.decoder[id] ?? ''
      if (this.special.has(tok)) {
        for (const b of this.textEncoder.encode(tok)) bytes.push(b)
        continue
      }
      for (const ch of tok) {
        const b = this.byteDecoder.get(ch)
        if (b !== undefined) bytes.push(b)
      }
    }
    return new Uint8Array(bytes)
  }

  decode(ids: number[]): string {
    return new TextDecoder().decode(this.tokenBytes(ids))
  }

  /** The vocabulary string of one token, with GPT-2's Ġ (space) shown as a space. */
  tokenString(id: number): string {
    return this.decode([id])
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
