import type { Backend, WeightSpec } from '../engine/backend.ts'
import type { CrossbarSettings } from '../crossbar/tile.ts'
import type { ModeCopy, ModelMode, Sequence } from '../modes/types.ts'
import { BpeTokenizer, type TokenizerJson } from './bpe.ts'
import { BigForward } from './forward.ts'
import { GpuMachine } from './gpu/machine.ts'
import { GPT2_SMALL, ModelWeights, neoConfig, type BandEvent, type ModelConfig, type NeoConfigJson } from './model.ts'
import { ByteReader } from './weights/bytereader.ts'
import { readSafetensors } from './weights/safetensors.ts'
import { fetchJson, openDownload, resolveFiles, type ModelFiles } from './weights/source.ts'
import { readTorchZip } from './weights/torchzip.ts'

/**
 * GPT-2 small and TinyStories-33M as water-computer modes.
 *
 * They are ordinary `ModelMode`s: a tokenizer, weights, and a forward pass (BigForward) that
 * sends every product through a `Backend`, so in Node (or for checks) they run on
 * ExactBackend or on LatticeBackend, the CPU form of the same water. In the browser they also
 * run on the WebGPU machine (`gpu: true`), which computes the identical physics in WGSL, and
 * the app shows them in the hall of valves instead of calc-gpt's exhibit.
 */
export type BigModelId = 'gpt2' | 'tinystories'

export interface LoadProgress {
  phase: 'config' | 'tokenizer' | 'weights' | 'finalizing' | 'ready'
  bytes: number
  totalBytes: number | null
  valves: number
  totalValves: number
  fromCache: boolean
  host: string
}

/** The big models' machine: chosen so text stays coherent (see tools/reference-big.ts). */
export const BIG_WATER: CrossbarSettings = { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1, errors: 'hash', ir: 'first-order' }

export const BIG_MODELS: Record<BigModelId, { label: string; blurb: string; approxMB: number; prompt: string; copy: ModeCopy }> = {
  gpt2: {
    label: 'GPT-2 small',
    blurb: "OpenAI's 2019 GPT-2: 124 million weights, 12 layers, 12 heads, 768 wide.",
    approxMB: 548,
    prompt: 'The museum of water computers opened its doors',
    copy: {
      label: 'GPT-2 small',
      title: 'GPT-2, in water',
      intro:
        'Every one of GPT-2’s 124 million weights is a valve. Your text becomes water heads, and it runs through 12 layers of crossbars to the 50 257 collectors of the output head.',
      promptLabel: 'Prompt',
      placeholder: 'The museum of water computers opened its doors',
      examples: ['The museum of water computers opened its doors', 'In a quiet village by the river,', 'The secret of the old lighthouse was'],
      provenance:
        '<a href="https://huggingface.co/openai-community/gpt2" target="_blank" rel="noopener">GPT-2 small</a> (OpenAI, 2019). The 548 MB of weights stream from Hugging Face into your browser and are kept in its cache; nothing is stored here.',
    },
  },
  tinystories: {
    label: 'TinyStories-33M',
    blurb: 'A GPT-Neo trained only on simple stories for small children (Eldan & Li, 2023): 4 layers, 16 heads, 768 wide.',
    approxMB: 291,
    prompt: 'Once upon a time, there was a little boat made of',
    copy: {
      label: 'TinyStories-33M',
      title: 'Bedtime stories, in water',
      intro:
        'A small GPT-Neo that only ever read children’s stories. Its 68 million valves (most of them in the output head) are enough to tell a coherent little story.',
      promptLabel: 'Prompt',
      placeholder: 'Once upon a time, there was a little boat made of',
      examples: ['Once upon a time, there was a little boat made of', 'Lily wanted to see the sea, so', 'Tom found a shiny stone in the garden.'],
      provenance:
        '<a href="https://huggingface.co/roneneldan/TinyStories-33M" target="_blank" rel="noopener">TinyStories-33M</a> (Eldan &amp; Li, 2023). The 291 MB of weights stream from Hugging Face into your browser and are kept in its cache; nothing is stored here.',
    },
  },
}

export interface BigModeOptions {
  /** Weight/tokenizer URLs (defaults: Hugging Face, or the page's ?weights= overrides). */
  files?: ModelFiles
  /** Run on the WebGPU machine (browser). Otherwise keep float weights for a CPU Backend. */
  gpu?: { device: GPUDevice; settings: CrossbarSettings }
  /** Also keep the half floats the GPU uses on the CPU (for GPU-vs-CPU checks). */
  keepHalf?: boolean
  /** Called once the (empty) machine exists, before any bytes stream in. */
  onMachine?: (w: ModelWeights, machine: GpuMachine | null) => void
  /** Called for every band of valves as it is programmed. */
  onBand?: (e: BandEvent) => void
}

export class BigMode implements ModelMode {
  readonly kind = 'hall'
  readonly copy: ModeCopy
  readonly maxNewTokens = 200
  tokenizer: BpeTokenizer | null = null
  modelWeights: ModelWeights | null = null
  machine: GpuMachine | null = null
  private specs: WeightSpec[] | null = null
  private vocabCache: string[] | null = null
  private loading: Promise<void> | null = null

  constructor(
    readonly id: BigModelId,
    public opts: BigModeOptions = {},
  ) {
    this.copy = BIG_MODELS[id].copy
  }

  get cfg(): ModelConfig {
    if (!this.modelWeights) throw new Error('not loaded')
    return this.modelWeights.cfg
  }

  get contextLength(): number {
    return this.machine ? this.machine.ctx : this.modelWeights?.cfg.nCtx ?? 1024
  }

  get stopToken(): number {
    return this.tokenizer?.eosId ?? 50256
  }

  get vocab(): string[] {
    if (!this.tokenizer) return []
    if (!this.vocabCache) {
      const t = this.tokenizer
      this.vocabCache = Array.from({ length: this.modelWeights?.cfg.vocab ?? 50257 }, (_, i) => t.tokenString(i))
    }
    return this.vocabCache
  }

  get loaded(): boolean {
    return this.modelWeights !== null && this.loading === null
  }

  load(onProgress: (p: LoadProgress) => void = () => {}, signal?: AbortSignal): Promise<void> {
    if (this.modelWeights && !this.loading) return Promise.resolve()
    this.loading ??= this.doLoad(onProgress, signal).finally(() => (this.loading = null))
    return this.loading
  }

  private async doLoad(onProgress: (p: LoadProgress) => void, signal?: AbortSignal): Promise<void> {
    const files = this.opts.files ?? resolveFiles(this.id, typeof location !== 'undefined' ? new URLSearchParams(location.search) : undefined)
    const host = new URL(files.weights).host
    const prog: LoadProgress = { phase: 'config', bytes: 0, totalBytes: null, valves: 0, totalValves: 0, fromCache: false, host }
    onProgress({ ...prog })
    let cfg: ModelConfig = GPT2_SMALL
    if (this.id === 'tinystories') cfg = neoConfig(await fetchJson<NeoConfigJson>(files.config!))
    prog.phase = 'tokenizer'
    onProgress({ ...prog })
    this.tokenizer = new BpeTokenizer(await fetchJson<TokenizerJson>(files.tokenizer))
    this.vocabCache = null

    const gpu = this.opts.gpu
    const w = new ModelWeights(cfg, { f32: !gpu, half: !!this.opts.keepHalf })
    prog.totalValves = w.totalValves
    this.machine?.destroy()
    this.machine = gpu ? new GpuMachine(gpu.device, w, gpu.settings) : null
    this.opts.onMachine?.(w, this.machine)

    const dl = await openDownload(files.weights, signal)
    prog.phase = 'weights'
    prog.totalBytes = dl.size ?? BIG_MODELS[this.id].approxMB * 1e6
    prog.fromCache = dl.fromCache
    onProgress({ ...prog })
    const reader = new ByteReader(dl.body)
    let lastReport = 0
    let lastYield = performance.now()
    reader.onBytes = (pos) => {
      prog.bytes = pos
      const now = performance.now()
      if (now - lastReport > 50) {
        lastReport = now
        prog.valves = w.programmedValves
        onProgress({ ...prog })
      }
    }
    const handlers = {
      want: w.want,
      bandRows: w.bandRows,
      band: async (b: Parameters<typeof w.band>[0]) => {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
        w.band(b)
        // let the page breathe (and paint the filling reservoirs) while bands arrive
        const now = performance.now()
        if (now - lastYield > 24) {
          await new Promise((r) => setTimeout(r, 0))
          lastYield = performance.now()
        }
      },
    }
    w.onBand = (e) => {
      this.machine?.uploadBand(e)
      this.opts.onBand?.(e)
    }
    if (this.id === 'gpt2') await readSafetensors(reader, handlers)
    else await readTorchZip(reader, handlers)
    w.validate()
    prog.phase = 'finalizing'
    prog.valves = w.programmedValves
    onProgress({ ...prog })
    if (this.machine) {
      this.machine.finalize()
      await this.machine.commission()
    }
    this.modelWeights = w
    this.specs = null
    prog.phase = 'ready'
    onProgress({ ...prog })
  }

  facts(): { label: string; value: string }[] {
    const w = this.modelWeights
    if (!w) return []
    const c = w.cfg
    return [
      { label: 'valves (weights)', value: w.totalValves.toLocaleString('en-US') },
      { label: 'layers × heads', value: `${c.nLayer} × ${c.nHead}` },
      { label: 'vocabulary', value: c.vocab.toLocaleString('en-US') },
    ]
  }

  /** The weight crossbars (CPU path only: in the browser the floats live on the GPU). */
  weights(): WeightSpec[] {
    if (!this.modelWeights) throw new Error('not loaded')
    this.specs ??= this.modelWeights.weightSpecs(!this.modelWeights.grids[0].f32)
    return this.specs
  }

  encode(text: string): number[] {
    if (!this.tokenizer) throw new Error('not loaded')
    return this.tokenizer.encode(text)
  }

  decode(ids: number[]): string {
    if (!this.tokenizer) throw new Error('not loaded')
    return this.tokenizer.decode(ids)
  }

  validate(prompt: string): string | null {
    if (!prompt.trim()) return 'Type a few words to start from'
    if (this.tokenizer && this.encode(prompt).length > this.contextLength - 8) return 'That prompt is too long for the machine'
    return null
  }

  newSequence(backend: Backend): Sequence {
    const w = this.modelWeights
    if (!w) throw new Error('not loaded')
    return new BigForward(w.cfg, (k) => w.v(k), backend)
  }

  /** GPU path: logits after the last of `tokens` (the key/value cache is reused for a shared prefix). */
  async stepGpu(tokens: number[]): Promise<Float32Array> {
    if (!this.machine) throw new Error('no GPU machine')
    return this.machine.step(tokens)
  }

  setSettings(s: CrossbarSettings): void {
    if (this.opts.gpu) this.opts.gpu.settings = s
    this.machine?.setPhysics(s)
  }
}
