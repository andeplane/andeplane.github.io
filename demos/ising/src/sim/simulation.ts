/**
 * Owns the GPU state of the lattice and encodes the per-frame work: brush stamps,
 * then S sweeps of color passes, then (when asked) one observable reduction.
 *
 * Temperature, field and algorithm ride in a uniform buffer with 256-byte slots bound
 * at dynamic offsets — one slot per color pass — so a whole frame's sweeps are encoded
 * against a single buffer written once. An instant quench is nothing but a different
 * float in the next slot.
 */

import { GEOMETRIES, type Geometry, type GeometryKey } from '../physics/lattice.ts';
import { buildUpdateShader } from '../gpu/shaders/update.wgsl.ts';
import { buildReduceShader } from '../gpu/shaders/reduce.wgsl.ts';
import { FILL_WGSL } from '../gpu/shaders/fill.wgsl.ts';
import { PAINT_WGSL } from '../gpu/shaders/paint.wgsl.ts';

const SLOT = 256;
const MAX_PASS_SLOTS = 256;
const MAX_PAINT_SLOTS = 64;
const REDUCE_WORKGROUPS = 256;

export interface PaintStamp {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
  value: 0 | 1 | 2;
}

export type Algorithm = 'metropolis' | 'glauber';
export type FillMode = 'down' | 'up' | 'random';

/** World -> fractional lattice coordinates; inverse of sitePosition's basis. */
export function fracCoords(g: GeometryKey, x: number, y: number): [number, number] {
  switch (g) {
    case 'square':
      return [x, y];
    case 'triangular':
      return [x - y / Math.sqrt(3), (y * 2) / Math.sqrt(3)];
    case 'honeycomb':
      return [x / (Math.sqrt(3) / 2), y / 1.5];
  }
}

export class Simulation {
  readonly device: GPUDevice;
  geometry: Geometry;
  L: number;
  N: number;

  T = 5;
  h = 0;
  algorithm: Algorithm = 'metropolis';

  /** Total sweeps performed, ever. */
  sweepCount = 0;
  /** Sweeps since the last successful measurement encode (for the acceptance rate). */
  sweepsSinceMeasure = 0;
  /**
   * Whether the configuration may have changed since the last measurement. Guards
   * against re-measuring a frozen (paused) lattice every frame, which would flood the
   * statistics bins with duplicates of one configuration and collapse χ and C_v.
   */
  dirtySinceMeasure = true;

  spins!: GPUBuffer;
  readonly results: GPUBuffer;
  readonly flips: GPUBuffer;

  private readonly passUniforms: GPUBuffer;
  private readonly passData = new ArrayBuffer(MAX_PASS_SLOTS * SLOT);
  private readonly passView = new DataView(this.passData);
  private readonly paintUniforms: GPUBuffer;
  private readonly paintData = new ArrayBuffer(MAX_PAINT_SLOTS * SLOT);
  private readonly paintView = new DataView(this.paintData);
  private readonly fillUniforms: GPUBuffer;
  private readonly reduceUniforms: GPUBuffer;

  private updatePipeline!: GPUComputePipeline;
  private reducePipeline!: GPUComputePipeline;
  private readonly fillPipeline: GPUComputePipeline;
  private readonly paintPipeline: GPUComputePipeline;
  private readonly paintLayout!: GPUBindGroupLayout;
  private readonly updateLayout!: GPUBindGroupLayout;

  private updateBind!: GPUBindGroup;
  private reduceBind!: GPUBindGroup;
  private fillBind!: GPUBindGroup;
  private paintBind!: GPUBindGroup;

  private passCounter = 0;
  private seed: number;
  private readonly paintQueue: PaintStamp[] = [];

  constructor(device: GPUDevice, L: number, geometry: GeometryKey) {
    this.device = device;
    this.geometry = GEOMETRIES[geometry];
    this.L = L;
    this.N = L * L;
    this.seed = randomSeed();

    this.passUniforms = device.createBuffer({
      label: 'pass uniforms',
      size: MAX_PASS_SLOTS * SLOT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.paintUniforms = device.createBuffer({
      label: 'paint uniforms',
      size: MAX_PAINT_SLOTS * SLOT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.fillUniforms = device.createBuffer({
      label: 'fill uniforms',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.reduceUniforms = device.createBuffer({
      label: 'reduce uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.results = device.createBuffer({
      label: 'reduce results',
      size: 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.flips = device.createBuffer({
      label: 'flip counter',
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.fillPipeline = device.createComputePipeline({
      label: 'fill',
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: FILL_WGSL }), entryPoint: 'main' },
    });

    // Explicit layouts wherever a uniform is bound at dynamic offsets — 'auto' would
    // infer hasDynamicOffset: false and reject the offsets at bind time.
    this.paintLayout = device.createBindGroupLayout({
      label: 'paint layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 },
        },
      ],
    });
    this.paintPipeline = device.createComputePipeline({
      label: 'paint',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.paintLayout] }),
      compute: { module: device.createShaderModule({ code: PAINT_WGSL }), entryPoint: 'main' },
    });
    this.updateLayout = device.createBindGroupLayout({
      label: 'update layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 32 },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    this.createSpinBuffer();
    this.buildGeometryPipelines();
  }

  private createSpinBuffer(): void {
    this.spins?.destroy();
    this.spins = this.device.createBuffer({
      label: `spins ${this.L}²`,
      size: this.N * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.reduceUniforms, 0, new Uint32Array([this.L, this.N]));
    this.fillBind = this.device.createBindGroup({
      layout: this.fillPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.spins } },
        { binding: 1, resource: { buffer: this.fillUniforms } },
      ],
    });
    this.paintBind = this.device.createBindGroup({
      layout: this.paintLayout,
      entries: [
        { binding: 0, resource: { buffer: this.spins } },
        { binding: 1, resource: { buffer: this.paintUniforms, size: SLOT } },
      ],
    });
  }

  private buildGeometryPipelines(): void {
    const g = this.geometry;
    this.updatePipeline = this.device.createComputePipeline({
      label: `update ${g.key}`,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.updateLayout] }),
      compute: {
        module: this.device.createShaderModule({ code: buildUpdateShader(g) }),
        entryPoint: 'main',
      },
    });
    this.reducePipeline = this.device.createComputePipeline({
      label: `reduce ${g.key}`,
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: buildReduceShader(g) }),
        entryPoint: 'main',
      },
    });
    this.rebuildGeometryBindGroups();
  }

  private rebuildGeometryBindGroups(): void {
    this.updateBind = this.device.createBindGroup({
      layout: this.updateLayout,
      entries: [
        { binding: 0, resource: { buffer: this.spins } },
        { binding: 1, resource: { buffer: this.passUniforms, size: SLOT } },
        { binding: 2, resource: { buffer: this.flips } },
      ],
    });
    this.reduceBind = this.device.createBindGroup({
      layout: this.reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.spins } },
        { binding: 1, resource: { buffer: this.reduceUniforms } },
        { binding: 2, resource: { buffer: this.results } },
      ],
    });
  }

  setGeometry(key: GeometryKey): void {
    if (key === this.geometry.key) return;
    this.geometry = GEOMETRIES[key];
    this.buildGeometryPipelines();
  }

  setSize(L: number): void {
    if (L === this.L) return;
    this.L = L;
    this.N = L * L;
    this.createSpinBuffer();
    this.rebuildGeometryBindGroups();
    this.reset('random');
  }

  reset(mode: FillMode): void {
    this.seed = randomSeed();
    this.dirtySinceMeasure = true;
    const modeCode = mode === 'down' ? 0 : mode === 'up' ? 1 : 2;
    const counter = this.passCounter;
    this.passCounter = (this.passCounter + 1) >>> 0;
    this.device.queue.writeBuffer(
      this.fillUniforms,
      0,
      new Uint32Array([modeCode, this.seed, this.N, this.L, counter]),
    );
    const encoder = this.device.createCommandEncoder({ label: 'fill' });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.fillPipeline);
    pass.setBindGroup(0, this.fillBind);
    pass.dispatchWorkgroups(Math.ceil(this.N / 256));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  queuePaint(stamp: PaintStamp): void {
    if (this.paintQueue.length < MAX_PAINT_SLOTS) this.paintQueue.push(stamp);
  }

  /** Encode queued brush stamps, then `sweeps` full sweeps. */
  encodeFrame(encoder: GPUCommandEncoder, sweeps: number): void {
    const { colors } = this.geometry;
    const totalPasses = sweeps * colors;
    if (totalPasses > MAX_PASS_SLOTS) throw new Error('too many passes for the uniform ring');

    if (this.paintQueue.length > 0) {
      this.encodePaints(encoder);
      this.dirtySinceMeasure = true;
    }
    if (sweeps === 0) return;
    this.dirtySinceMeasure = true;

    for (let p = 0; p < totalPasses; p++) {
      const base = p * SLOT;
      this.passView.setUint32(base + 0, this.L, true);
      this.passView.setUint32(base + 4, p % colors, true);
      this.passView.setUint32(base + 8, this.passCounter + p, true);
      this.passView.setUint32(base + 12, this.seed, true);
      this.passView.setFloat32(base + 16, 1 / this.T, true);
      this.passView.setFloat32(base + 20, this.h, true);
      this.passView.setUint32(base + 24, this.algorithm === 'metropolis' ? 0 : 1, true);
    }
    this.device.queue.writeBuffer(this.passUniforms, 0, this.passData, 0, totalPasses * SLOT);

    const stride = this.L / colors;
    const wx = Math.ceil(stride / 64);
    const wy = Math.ceil(this.L / 4);
    const pass = encoder.beginComputePass({ label: 'sweeps' });
    pass.setPipeline(this.updatePipeline);
    for (let p = 0; p < totalPasses; p++) {
      pass.setBindGroup(0, this.updateBind, [p * SLOT]);
      pass.dispatchWorkgroups(wx, wy);
    }
    pass.end();

    this.passCounter = (this.passCounter + totalPasses) >>> 0;
    this.sweepCount += sweeps;
    this.sweepsSinceMeasure += sweeps;
  }

  private encodePaints(encoder: GPUCommandEncoder): void {
    const g = this.geometry;
    const dispatches: { slot: number; wx: number; wy: number }[] = [];
    for (let k = 0; k < this.paintQueue.length; k++) {
      const s = this.paintQueue[k];
      const [ua, va] = fracCoords(g.key, s.ax, s.ay);
      const [ub, vb] = fracCoords(g.key, s.bx, s.by);
      // Conservative index-space margin around the world-space capsule.
      const margin = s.radius * 2 + 2;
      const i0 = Math.floor(Math.min(ua, ub) - margin);
      const j0 = Math.floor(Math.min(va, vb) - margin);
      const bw = Math.min(this.L, Math.ceil(Math.max(ua, ub) + margin) - i0 + 1);
      const bh = Math.min(this.L, Math.ceil(Math.max(va, vb) + margin) - j0 + 1);

      const base = k * SLOT;
      const v = this.paintView;
      v.setFloat32(base + 0, s.ax, true);
      v.setFloat32(base + 4, s.ay, true);
      v.setFloat32(base + 8, s.bx, true);
      v.setFloat32(base + 12, s.by, true);
      v.setFloat32(base + 16, s.radius, true);
      v.setUint32(base + 20, s.value, true);
      v.setUint32(base + 24, this.L, true);
      v.setUint32(base + 28, g.geomId, true);
      v.setInt32(base + 32, i0, true);
      v.setInt32(base + 36, j0, true);
      v.setUint32(base + 40, this.seed, true);
      v.setUint32(base + 44, this.passCounter, true);
      dispatches.push({ slot: k, wx: Math.ceil(bw / 16), wy: Math.ceil(bh / 16) });
    }
    this.device.queue.writeBuffer(this.paintUniforms, 0, this.paintData, 0, this.paintQueue.length * SLOT);
    this.paintQueue.length = 0;
    this.passCounter = (this.passCounter + 1) >>> 0;

    const pass = encoder.beginComputePass({ label: 'paint' });
    pass.setPipeline(this.paintPipeline);
    for (const d of dispatches) {
      pass.setBindGroup(0, this.paintBind, [d.slot * SLOT]);
      pass.dispatchWorkgroups(d.wx, d.wy);
    }
    pass.end();
  }

  /**
   * Encode one reduction and copy the results plus the flip counter into `staging`
   * (16 bytes: sumS i32, sumBonds i32, flips u32). Returns the sweeps the flip count
   * covers; resets that window.
   */
  encodeMeasure(encoder: GPUCommandEncoder, staging: GPUBuffer): number {
    encoder.clearBuffer(this.results);
    const pass = encoder.beginComputePass({ label: 'reduce' });
    pass.setPipeline(this.reducePipeline);
    pass.setBindGroup(0, this.reduceBind);
    pass.dispatchWorkgroups(Math.min(REDUCE_WORKGROUPS, Math.ceil(this.N / 256)));
    pass.end();
    encoder.copyBufferToBuffer(this.results, 0, staging, 0, 8);
    encoder.copyBufferToBuffer(this.flips, 0, staging, 8, 4);
    encoder.clearBuffer(this.flips);
    const covered = this.sweepsSinceMeasure;
    this.sweepsSinceMeasure = 0;
    this.dirtySinceMeasure = false;
    return covered;
  }
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
