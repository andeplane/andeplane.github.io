import { BpeTokenizer, type TokenizerJson } from './bpe.ts'
import { CpuCrossbar, DEFAULT_WATER, type CrossbarBackend, type Physics } from './crossbar.ts'
import { GpuMachine } from './gpu/machine.ts'
import { GPT2_SMALL, ModelWeights, neoConfig, type BandEvent, type ModelConfig, type NeoConfigJson } from './model.ts'
import { CpuRunner } from './runner-cpu.ts'
import { ByteReader } from './weights/bytereader.ts'
import { readSafetensors } from './weights/safetensors.ts'
import { fetchJson, openDownload, resolveFiles, type ModelFiles } from './weights/source.ts'
import { readTorchZip } from './weights/torchzip.ts'

/**
 * The pluggable "mode" interface the water-gpt app drives: load, tokenize, step.
 * BigMode runs GPT-2 small or TinyStories-33M on the hydraulic crossbar, either on the
 * GPU (GpuMachine, browser) or on the CPU through any injected CrossbarBackend (Node
 * tests, or the app's own shared matmul API).
 */
export interface LoadProgress {
  phase: 'config' | 'tokenizer' | 'weights' | 'finalizing' | 'ready'
  bytes: number
  totalBytes: number | null
  valves: number
  totalValves: number
  fromCache: boolean
}

export interface Mode {
  readonly id: string
  readonly label: string
  readonly eosId: number
  load(onProgress: (p: LoadProgress) => void, signal?: AbortSignal): Promise<void>
  tokenize(text: string): number[]
  detokenize(ids: number[]): string
  step(tokens: number[]): Promise<Float32Array>
}

export type BigModelId = 'gpt2' | 'tinystories'

export const BIG_MODELS: Record<BigModelId, { label: string; blurb: string; approxMB: number; prompt: string }> = {
  gpt2: {
    label: 'GPT-2 small · 124 M valves',
    blurb: "OpenAI's 2019 GPT-2 (124 M parameters): 12 layers, 12 heads, 768-wide.",
    approxMB: 548,
    prompt: 'The museum of water computers opened its doors',
  },
  tinystories: {
    label: 'TinyStories-33M · 68 M valves',
    blurb: 'A GPT-Neo trained only on short stories for small children (Eldan & Li, 2023): 4 layers, 16 heads.',
    approxMB: 291,
    prompt: 'Once upon a time, there was a little boat made of',
  },
}

export interface BigModeOptions {
  model: BigModelId
  /** Weight/tokenizer URLs (defaults: Hugging Face, or ?weights= overrides). */
  files?: ModelFiles
  backend: 'gpu' | 'cpu'
  device?: GPUDevice
  /** CPU path: the crossbar matmul to use (defaults to the reference CPU crossbar). */
  crossbar?: CrossbarBackend
  physics?: Physics
  /** Called once the (empty) machine exists, before any bytes stream in. */
  onMachine?: (w: ModelWeights, machine: GpuMachine | null) => void
  /** Called for every band of valves as it is programmed. */
  onBand?: (e: BandEvent) => void
}

export class BigMode implements Mode {
  readonly id: string
  readonly label: string
  readonly opts: BigModeOptions
  tokenizer: BpeTokenizer | null = null
  weights: ModelWeights | null = null
  machine: GpuMachine | null = null
  runner: CpuRunner | null = null
  physics: Physics

  constructor(opts: BigModeOptions) {
    this.opts = opts
    this.id = opts.model
    this.label = BIG_MODELS[opts.model].label
    this.physics = opts.physics ?? DEFAULT_WATER
  }

  get eosId(): number {
    return this.tokenizer?.eosId ?? 50256
  }

  async load(onProgress: (p: LoadProgress) => void, signal?: AbortSignal): Promise<void> {
    const files = this.opts.files ?? resolveFiles(this.opts.model, typeof location !== 'undefined' ? new URLSearchParams(location.search) : undefined)
    const prog: LoadProgress = { phase: 'config', bytes: 0, totalBytes: null, valves: 0, totalValves: 0, fromCache: false }
    onProgress({ ...prog })
    let cfg: ModelConfig = GPT2_SMALL
    if (this.opts.model === 'tinystories') cfg = neoConfig(await fetchJson<NeoConfigJson>(files.config!))
    prog.phase = 'tokenizer'
    onProgress({ ...prog })
    this.tokenizer = new BpeTokenizer(await fetchJson<TokenizerJson>(files.tokenizer))

    const gpu = this.opts.backend === 'gpu'
    const w = new ModelWeights(cfg, !gpu)
    this.weights = w
    prog.totalValves = w.totalValves
    if (gpu) {
      if (!this.opts.device) throw new Error('GPU mode needs a device')
      this.machine = new GpuMachine(this.opts.device, w, this.physics)
    }
    this.opts.onMachine?.(w, this.machine)

    const dl = await openDownload(files.weights, signal)
    prog.phase = 'weights'
    prog.totalBytes = dl.size ?? BIG_MODELS[this.opts.model].approxMB * 1e6
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
        // let the page breathe (and paint the filling reservoirs) while we quantise
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
    if (this.opts.model === 'gpt2') await readSafetensors(reader, handlers)
    else await readTorchZip(reader, handlers)
    w.validate()
    prog.phase = 'finalizing'
    prog.valves = w.programmedValves
    onProgress({ ...prog })
    if (this.machine) this.machine.finalize()
    else this.runner = new CpuRunner(w, this.opts.crossbar ?? new CpuCrossbar(this.physics))
    prog.phase = 'ready'
    onProgress({ ...prog })
  }

  setPhysics(p: Physics): void {
    this.physics = p
    if (this.machine) this.machine.setPhysics(p)
    if (this.runner) {
      this.runner.backend.physics = p
      this.runner.reset()
    }
  }

  tokenize(text: string): number[] {
    if (!this.tokenizer) throw new Error('not loaded')
    return this.tokenizer.encode(text)
  }

  detokenize(ids: number[]): string {
    if (!this.tokenizer) throw new Error('not loaded')
    return this.tokenizer.decode(ids)
  }

  async step(tokens: number[]): Promise<Float32Array> {
    if (this.machine) return this.machine.step(tokens)
    if (this.runner) return this.runner.step(tokens)
    throw new Error('not loaded')
  }

  reset(): void {
    this.machine?.reset()
    this.runner?.reset()
  }
}
