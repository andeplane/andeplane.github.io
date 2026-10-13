// The WebGPU backend: the statevector lives in a storage buffer and every op
// is one compute dispatch.
//
// A batch of ops becomes a single compute pass. Each op's parameters go into
// its own 256-byte slot of one uniform buffer, selected per dispatch with a
// dynamic offset, so thousands of gates cost one buffer write and one submit.
// WebGPU orders dispatches within a pass, so gate k+1 sees gate k's writes.

import type { UnitaryOp, PermuteOp } from '../circuit.ts'
import { complement, deposit, extract, maskOf } from '../bits.ts'
import type { Backend } from './backend.ts'
import { GATE, SWAP, PERMUTE, MARGINAL, GATHER } from './shaders.ts'

const SLOT = 256 // bytes per op in the uniform buffer (≥ minUniformBufferOffsetAlignment)
const SLOTS = 4096
const WG = 256
const MAX_QUBITS = 30
const BYTES_PER_AMPLITUDE = 8

export interface GpuContext {
  readonly device: GPUDevice
  /** e.g. "apple metal-3" or "nvidia ampere"; empty when the browser hides it. */
  readonly adapterName: string
}

/** Ask for a device with the largest storage buffers the adapter allows. */
export async function requestGpu(): Promise<GpuContext | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) return null
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  })
  const info = adapter.info
  const adapterName = info ? [info.vendor, info.architecture].filter(Boolean).join(' ') : ''
  return { device, adapterName }
}

/** Largest statevector this device can hold in one binding. */
export function webGpuMaxQubits(device: GPUDevice): number {
  const bytes = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize)
  return Math.min(MAX_QUBITS, Math.floor(Math.log2(bytes / BYTES_PER_AMPLITUDE)))
}

export async function createWebGpuBackend(nQubits: number, gpu?: GpuContext): Promise<WebGpuBackend | null> {
  const ctx = gpu ?? (await requestGpu())
  if (!ctx) return null
  return new WebGpuBackend(ctx, nQubits)
}

interface Pipelines {
  gate: GPUComputePipeline
  swap: GPUComputePipeline
  permute: GPUComputePipeline
  marginal: GPUComputePipeline
  gather: GPUComputePipeline
}

const pipelineCache = new WeakMap<GPUDevice, Pipelines>()

function pipelines(device: GPUDevice): Pipelines {
  let p = pipelineCache.get(device)
  if (!p) {
    const make = (code: string, label: string, dynamic: boolean) => {
      const module = device.createShaderModule({ code, label })
      // Gate and swap share a layout whose uniform takes a dynamic offset;
      // the others get an automatic layout.
      const layout = dynamic
        ? device.createPipelineLayout({
            bindGroupLayouts: [
              device.createBindGroupLayout({
                entries: [
                  { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
                  { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                ],
              }),
            ],
          })
        : 'auto'
      return device.createComputePipeline({ label, layout, compute: { module, entryPoint: 'main' } })
    }
    p = {
      gate: make(GATE, 'quantum gate', true),
      swap: make(SWAP, 'quantum swap', true),
      permute: make(PERMUTE, 'quantum permute', false),
      marginal: make(MARGINAL, 'quantum marginal', false),
      gather: make(GATHER, 'quantum gather', false),
    }
    pipelineCache.set(device, p)
  }
  return p
}

/** Workgroup grid covering `threads`, folded into 2D past the 65 535 limit. */
function grid(threads: number): [number, number] {
  const groups = Math.max(1, Math.ceil(threads / WG))
  const x = Math.min(groups, 65535)
  return [x, Math.ceil(groups / x)]
}

export class WebGpuBackend implements Backend {
  readonly name: string
  readonly device: GPUDevice
  private readonly pipes: Pipelines
  private readonly buffers: GPUBuffer[] = []
  private current = 0
  private readonly params: GPUBuffer
  private readonly paramData = new ArrayBuffer(SLOT * SLOTS)
  private readonly gateGroups: GPUBindGroup[] = []
  private readonly tables = new WeakMap<PermuteOp, GPUBuffer>()
  private readonly ownedTables: GPUBuffer[] = []
  private readonly dim: number

  constructor(ctx: GpuContext, readonly nQubits: number) {
    const { device } = ctx
    const max = webGpuMaxQubits(device)
    if (nQubits < 1 || nQubits > max) throw new Error(`this GPU holds at most ${max} qubits, not ${nQubits}`)
    this.device = device
    this.name = ctx.adapterName ? `WebGPU (${ctx.adapterName})` : 'WebGPU'
    this.dim = 2 ** nQubits
    this.pipes = pipelines(device)
    this.params = device.createBuffer({
      label: 'quantum op params',
      size: SLOT * SLOTS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.buffers.push(this.stateBuffer('quantum state A'))
    this.reset()
  }

  private stateBuffer(label: string): GPUBuffer {
    return this.device.createBuffer({
      label,
      size: this.dim * BYTES_PER_AMPLITUDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
  }

  private get state(): GPUBuffer {
    return this.buffers[this.current]
  }

  private gateGroup(): GPUBindGroup {
    return (this.gateGroups[this.current] ??= this.device.createBindGroup({
      layout: this.pipes.gate.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params, size: 48 } },
        { binding: 1, resource: { buffer: this.state } },
      ],
    }))
  }

  reset(): void {
    const enc = this.device.createCommandEncoder()
    enc.clearBuffer(this.state)
    this.device.queue.submit([enc.finish()])
    this.device.queue.writeBuffer(this.state, 0, new Float32Array([1, 0]))
  }

  apply(ops: readonly UnitaryOp[]): void {
    for (let start = 0; start < ops.length; start += SLOTS) this.applyChunk(ops.slice(start, start + SLOTS))
  }

  private applyChunk(ops: readonly UnitaryOp[]): void {
    const u32 = new Uint32Array(this.paramData)
    const f32 = new Float32Array(this.paramData)
    ops.forEach((op, s) => {
      const w = (s * SLOT) / 4
      if (op.kind === 'gate') {
        u32.set([op.target, maskOf(op.controls), 0, this.dim / 2], w)
        f32.set(op.matrix, w + 4)
      } else if (op.kind === 'swap') {
        u32.set([op.a, maskOf(op.controls), op.b, this.dim], w)
      } else {
        u32.set([0, maskOf(op.controls), maskOf(op.qubits), this.dim], w)
      }
    })
    this.device.queue.writeBuffer(this.params, 0, this.paramData, 0, ops.length * SLOT)

    const enc = this.device.createCommandEncoder()
    const pass = enc.beginComputePass()
    const half = grid(this.dim / 2)
    const full = grid(this.dim)
    ops.forEach((op, s) => {
      if (op.kind === 'permute') {
        pass.setPipeline(this.pipes.permute)
        pass.setBindGroup(0, this.permuteGroup(op, s))
        pass.dispatchWorkgroups(...full)
        this.current = 1 - this.current
        return
      }
      pass.setPipeline(op.kind === 'gate' ? this.pipes.gate : this.pipes.swap)
      pass.setBindGroup(0, this.gateGroup(), [s * SLOT])
      pass.dispatchWorkgroups(...(op.kind === 'gate' ? half : full))
    })
    pass.end()
    this.device.queue.submit([enc.finish()])
  }

  private permuteGroup(op: PermuteOp, slot: number): GPUBindGroup {
    if (this.buffers.length === 1) this.buffers.push(this.stateBuffer('quantum state B'))
    let table = this.tables.get(op)
    if (!table) {
      const data = new Uint32Array(32 + op.table.length)
      data[0] = op.qubits.length
      data.set(op.qubits, 1)
      data.set(op.table, 32)
      table = this.device.createBuffer({ label: `permute ${op.name}`, size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
      this.device.queue.writeBuffer(table, 0, data)
      this.tables.set(op, table)
      this.ownedTables.push(table)
    }
    return this.device.createBindGroup({
      layout: this.pipes.permute.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params, offset: slot * SLOT, size: 48 } },
        { binding: 1, resource: { buffer: this.buffers[this.current] } },
        { binding: 2, resource: { buffer: this.buffers[1 - this.current] } },
        { binding: 3, resource: { buffer: table } },
      ],
    })
  }

  async flush(): Promise<void> {
    await this.device.queue.onSubmittedWorkDone()
  }

  /** Run a read-only kernel into a fresh buffer and copy it back. */
  private async readKernel(
    pipeline: GPUComputePipeline, info: Uint32Array<ArrayBuffer>, qubits: readonly number[], outBytes: number, threads: number,
  ): Promise<ArrayBuffer> {
    const { device } = this
    const infoBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(infoBuf, 0, info)
    const qubitBuf = device.createBuffer({ size: Math.max(16, qubits.length * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(qubitBuf, 0, new Uint32Array(qubits))
    const out = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
    const staging = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const enc = device.createCommandEncoder()
    const pass = enc.beginComputePass()
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: infoBuf } },
        { binding: 1, resource: { buffer: this.state } },
        { binding: 2, resource: { buffer: qubitBuf } },
        { binding: 3, resource: { buffer: out } },
      ],
    }))
    pass.dispatchWorkgroups(...grid(threads))
    pass.end()
    enc.copyBufferToBuffer(out, 0, staging, 0, outBytes)
    device.queue.submit([enc.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    const data = staging.getMappedRange().slice(0)
    staging.unmap()
    for (const b of [infoBuf, qubitBuf, out, staging]) b.destroy()
    return data
  }

  async probabilities(qubits: readonly number[]): Promise<Float64Array> {
    const k = qubits.length
    const rest = complement(this.nQubits, qubits)
    // Enough partial sums to keep ~65k threads busy, but never more chunks
    // than there are values of the other qubits.
    const logChunks = Math.max(0, Math.min(rest.length, 16 - k))
    const threads = 2 ** (k + logChunks)
    const data = await this.readKernel(
      this.pipes.marginal, new Uint32Array([k, rest.length, logChunks, 0]), [...qubits, ...rest], threads * 4, threads,
    )
    const partial = new Float32Array(data)
    const out = new Float64Array(2 ** k)
    for (let g = 0; g < threads; g++) out[g & (out.length - 1)] += partial[g]
    return out
  }

  async amplitudes(qubits: readonly number[], fixed = 0): Promise<{ re: Float64Array; im: Float64Array }> {
    const rest = complement(this.nQubits, qubits)
    const base = deposit(extract(fixed, rest), rest)
    const size = 2 ** qubits.length
    const data = new Float32Array(await this.readKernel(this.pipes.gather, new Uint32Array([qubits.length, base, 0, 0]), qubits, size * 8, size))
    const re = new Float64Array(size), im = new Float64Array(size)
    for (let o = 0; o < size; o++) {
      re[o] = data[2 * o]
      im[o] = data[2 * o + 1]
    }
    return { re, im }
  }

  collapse(qubit: number, outcome: 0 | 1, prob: number): void {
    const s = 1 / Math.sqrt(prob)
    const matrix = outcome === 0 ? [s, 0, 0, 0, 0, 0, 0, 0] as const : [0, 0, 0, 0, 0, 0, s, 0] as const
    this.apply([{ kind: 'gate', name: 'collapse', target: qubit, controls: [], matrix }])
  }

  dispose(): void {
    for (const b of [...this.buffers, this.params, ...this.ownedTables]) b.destroy()
  }
}
