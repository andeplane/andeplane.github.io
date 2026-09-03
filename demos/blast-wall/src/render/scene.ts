/**
 * Render pipelines and the per-frame draw.
 *
 * Four draws: ground, wall, charge marker, shock shell. The wall's index buffer holds
 * node indices, so `@builtin(vertex_index)` in the vertex shader IS the node id and the
 * deformed position comes straight out of the solver arena — there is no vertex buffer
 * and no per-frame upload of geometry at all.
 */

import type { Mesh } from '../model/mesh.ts';
import type { U32 } from '../model/types.ts';
import type { GpuSolver } from '../gpu/solver.ts';
import { sceneShader } from './shaders/scene.wgsl.ts';
import type { OrbitCamera } from './camera.ts';

export type ColourMode = 'damage' | 'speed' | 'plain';

const SCENE_BYTES = 176;
const SAMPLES = 4;

export interface FrameOptions {
  colourMode: ColourMode;
  /** Radius of the drawn shock front, metres; ≤ 0 hides it. */
  shockRadius: number;
  /** Speed that saturates the colour ramp, m/s. */
  referenceSpeed: number;
  charge: { x: number; y: number; z: number };
  chargeRadius: number;
}

export class Scene {
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly uniform: GPUBuffer;
  private readonly index: GPUBuffer;
  private readonly flags: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly wall: GPURenderPipeline;
  private readonly ground: GPURenderPipeline;
  private readonly shock: GPURenderPipeline;
  private readonly marker: GPURenderPipeline;
  private readonly indexCount: number;
  private readonly flagData: U32;
  private readonly bytes = new ArrayBuffer(SCENE_BYTES);
  private readonly f32 = new Float32Array(this.bytes);
  private readonly u32 = new Uint32Array(this.bytes);

  private colour: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  private width = 0;
  private height = 0;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    private readonly mesh: Mesh,
    private readonly solver: GpuSolver,
  ) {
    this.device = device;
    this.context = context;
    this.format = format;

    // Six indices per exposed quad, each one a node id the vertex shader looks up.
    const idx = new Uint32Array(mesh.quadCount * 6);
    for (let q = 0; q < mesh.quadCount; q++) {
      const a = mesh.quads[q * 4];
      const b = mesh.quads[q * 4 + 1];
      const c = mesh.quads[q * 4 + 2];
      const d = mesh.quads[q * 4 + 3];
      idx.set([a, b, c, a, c, d], q * 6);
    }
    this.indexCount = idx.length;
    this.index = device.createBuffer({
      label: 'wall indices',
      size: idx.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.index, 0, idx);

    this.flagData = new Uint32Array(Math.max(1, mesh.units.length));
    this.flags = device.createBuffer({
      label: 'unit flags',
      size: this.flagData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.flags, 0, this.flagData);

    this.uniform = device.createBuffer({
      label: 'scene',
      size: SCENE_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ label: 'scene', code: sceneShader });
    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.bindGroup = device.createBindGroup({
      label: 'scene',
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: solver.u32 } },
        { binding: 2, resource: { buffer: solver.ro } },
        { binding: 3, resource: { buffer: solver.rw } },
        { binding: 4, resource: { buffer: this.flags } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });

    const make = (
      label: string,
      vs: string,
      fs: string,
      opts: { blend?: boolean; depthWrite?: boolean } = {},
    ): GPURenderPipeline =>
      device.createRenderPipeline({
        label,
        layout,
        vertex: { module, entryPoint: vs },
        fragment: {
          module,
          entryPoint: fs,
          targets: [
            {
              format,
              blend: opts.blend
                ? {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
                  }
                : undefined,
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: opts.depthWrite !== false,
          depthCompare: 'less',
        },
        multisample: { count: SAMPLES },
      });

    this.ground = make('ground', 'vsGround', 'fsGround');
    this.wall = make('wall', 'vsWall', 'fsWall');
    this.marker = make('marker', 'vsMarker', 'fsMarker');
    this.shock = make('shock', 'vsShock', 'fsShock', { blend: true, depthWrite: false });
  }

  /** Highlight a set of units. Passing an empty set clears the highlight. */
  setSelection(units: Iterable<number>): void {
    this.flagData.fill(0);
    for (const u of units) if (u >= 0 && u < this.flagData.length) this.flagData[u] = 1;
    this.device.queue.writeBuffer(this.flags, 0, this.flagData);
  }

  private resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.colour?.destroy();
    this.depth?.destroy();
    this.colour = this.device.createTexture({
      label: 'msaa colour',
      size: [width, height],
      format: this.format,
      sampleCount: SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depth = this.device.createTexture({
      label: 'depth',
      size: [width, height],
      format: 'depth24plus',
      sampleCount: SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  draw(
    encoder: GPUCommandEncoder,
    camera: OrbitCamera,
    width: number,
    height: number,
    opts: FrameOptions,
  ): void {
    this.resize(width, height);
    const aspect = width / Math.max(height, 1);
    const vp = camera.viewProj(aspect);
    const eye = camera.eye();
    const off = this.solver.layout.off;

    this.f32.set(vp, 0);
    this.f32.set([eye[0], eye[1], eye[2], 0], 16);
    this.f32.set([-0.45, 0.82, 0.36, 0.55], 20);
    this.f32.set(
      [
        opts.colourMode === 'damage' ? 0 : opts.colourMode === 'speed' ? 1 : 2,
        this.solver.time,
        opts.shockRadius,
        1 / Math.max(opts.referenceSpeed, 0.01),
      ],
      24,
    );
    this.u32.set([off.x, off.centroid, off.nodeScalar, off.nodeUnit], 28);
    this.u32.set([off.unitScale, this.mesh.units.length, opts.shockRadius > 0 ? 1 : 0, 0], 32);
    this.f32.set(
      [this.mesh.lattice.length, this.mesh.lattice.height, this.mesh.lattice.thickness, 0.5],
      36,
    );
    this.f32.set([opts.charge.x, opts.charge.y, opts.charge.z, opts.chargeRadius], 40);
    this.device.queue.writeBuffer(this.uniform, 0, this.bytes);

    const pass = encoder.beginRenderPass({
      label: 'scene',
      colorAttachments: [
        {
          view: this.colour!.createView(),
          resolveTarget: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.035, g: 0.038, b: 0.05, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depth!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setBindGroup(0, this.bindGroup);

    pass.setPipeline(this.ground);
    pass.draw(6);

    pass.setPipeline(this.wall);
    pass.setIndexBuffer(this.index, 'uint32');
    // Instance 0 is the mortar body at full expanded size; instance 1 is the real brick,
    // shrunk half a fuge on every face so the joint shows.
    pass.drawIndexed(this.indexCount, 2);

    pass.setPipeline(this.marker);
    pass.draw(12 * 24 * 6);

    if (opts.shockRadius > 0) {
      pass.setPipeline(this.shock);
      pass.draw(24 * 48 * 6);
    }

    pass.end();
  }

  destroy(): void {
    this.uniform.destroy();
    this.index.destroy();
    this.flags.destroy();
    this.colour?.destroy();
    this.depth?.destroy();
  }
}
