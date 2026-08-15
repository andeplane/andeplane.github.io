/**
 * Camera and render pipelines. The lattice pass draws into a persistent accumulation
 * texture with alpha blending (temporal smoothing), and a blit pass copies that to the
 * canvas — the canvas' own texture is transient and cannot carry the fade between
 * frames.
 */

import type { Gpu } from '../gpu/device.ts';
import { RENDER_WGSL, BLIT_WGSL } from '../gpu/shaders/render.wgsl.ts';
import { GEOMETRIES, sitePosition, type GeometryKey } from '../physics/lattice.ts';

export type ColormapKey = 'ink' | 'ember';

const COLORMAPS: Record<ColormapKey, { down: [number, number, number]; up: [number, number, number] }> = {
  ink: { down: [0.043, 0.055, 0.078], up: [0.906, 0.925, 0.957] },
  ember: { down: [0.055, 0.098, 0.212], up: [0.976, 0.62, 0.257] },
};

const SMOOTHING_ALPHA = 0.55;

export class View {
  private readonly gpu: Gpu;
  private readonly canvas: HTMLCanvasElement;

  private geometry: GeometryKey = 'square';
  private L = 510;
  centerX = 0;
  centerY = 0;
  /** Physical pixels per world unit (one world unit = one lattice spacing). */
  pxPerCell = 1;
  smoothing = true;
  private colormap: ColormapKey = 'ink';

  private readonly latticePipeline: GPURenderPipeline;
  private readonly blitPipeline: GPURenderPipeline;
  private readonly viewUniforms: GPUBuffer;
  private readonly uniformData = new Float32Array(20);
  private latticeBind: GPUBindGroup | null = null;
  private blitBind: GPUBindGroup | null = null;
  private accum: GPUTexture | null = null;
  private accumFresh = true;

  constructor(gpu: Gpu, canvas: HTMLCanvasElement) {
    this.gpu = gpu;
    this.canvas = canvas;

    this.viewUniforms = gpu.device.createBuffer({
      label: 'view uniforms',
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const latticeModule = gpu.device.createShaderModule({ code: RENDER_WGSL });
    this.latticePipeline = gpu.device.createRenderPipeline({
      label: 'lattice',
      layout: 'auto',
      vertex: { module: latticeModule, entryPoint: 'vs_main' },
      fragment: {
        module: latticeModule,
        entryPoint: 'fs_lattice',
        targets: [
          {
            format: 'rgba8unorm',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'zero' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    const blitModule = gpu.device.createShaderModule({ code: BLIT_WGSL });
    this.blitPipeline = gpu.device.createRenderPipeline({
      label: 'blit',
      layout: 'auto',
      vertex: { module: blitModule, entryPoint: 'vs_main' },
      fragment: { module: blitModule, entryPoint: 'fs_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  setSpins(spins: GPUBuffer): void {
    this.latticeBind = this.gpu.device.createBindGroup({
      layout: this.latticePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: spins } },
        { binding: 1, resource: { buffer: this.viewUniforms } },
      ],
    });
  }

  setColormap(key: ColormapKey): void {
    this.colormap = key;
  }

  get colormapKey(): ColormapKey {
    return this.colormap;
  }

  setLattice(geometry: GeometryKey, L: number): void {
    this.geometry = geometry;
    this.L = L;
    this.fit();
  }

  /** World-space bounding extent of the lattice, for fitting. */
  private extent(): [number, number] {
    const [x1] = sitePosition(this.geometry, this.L, 0);
    const [x2, y2] = sitePosition(this.geometry, 0, this.L);
    return [Math.abs(x1) + Math.abs(x2), Math.max(Math.abs(y2), this.L * 0.01)];
  }

  fit(): void {
    const [ex, ey] = this.extent();
    const [cx, cy] = sitePosition(this.geometry, this.L / 2, this.L / 2);
    this.centerX = cx;
    this.centerY = cy;
    this.pxPerCell = Math.min(this.canvas.width / ex, this.canvas.height / Math.abs(ey));
  }

  private minZoom(): number {
    const [ex, ey] = this.extent();
    return 0.5 * Math.min(this.canvas.width / ex, this.canvas.height / Math.abs(ey));
  }

  screenToWorld(cssX: number, cssY: number): [number, number] {
    const dpr = this.canvas.width / this.canvas.clientWidth;
    const px = cssX * dpr;
    const py = cssY * dpr;
    return [
      this.centerX + (px - this.canvas.width / 2) / this.pxPerCell,
      this.centerY + (py - this.canvas.height / 2) / this.pxPerCell,
    ];
  }

  zoomAt(cssX: number, cssY: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(cssX, cssY);
    const next = Math.min(48, Math.max(this.minZoom(), this.pxPerCell * factor));
    const applied = next / this.pxPerCell;
    this.pxPerCell = next;
    // Keep the world point under the cursor fixed.
    this.centerX = wx - (wx - this.centerX) / applied;
    this.centerY = wy - (wy - this.centerY) / applied;
  }

  panBy(cssDx: number, cssDy: number): void {
    const dpr = this.canvas.width / this.canvas.clientWidth;
    this.centerX -= (cssDx * dpr) / this.pxPerCell;
    this.centerY -= (cssDy * dpr) / this.pxPerCell;
  }

  /** Brush radius in world units for a radius given in lattice cells. */
  worldRadius(cells: number): number {
    return cells;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height && this.accum) return;
    const fitBefore = this.accum === null;
    this.canvas.width = w;
    this.canvas.height = h;
    this.accum?.destroy();
    this.accum = this.gpu.device.createTexture({
      label: 'accum',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.accumFresh = true;
    this.blitBind = this.gpu.device.createBindGroup({
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.accum.createView() }],
    });
    if (fitBefore) this.fit();
  }

  render(encoder: GPUCommandEncoder): void {
    if (!this.accum || !this.latticeBind || !this.blitBind) return;

    const colors = COLORMAPS[this.colormap];
    const u = this.uniformData;
    u.set([...colors.down, 1], 0);
    u.set([...colors.up, 1], 4);
    u[8] = this.centerX;
    u[9] = this.centerY;
    u[10] = this.canvas.width;
    u[11] = this.canvas.height;
    u[12] = this.pxPerCell;
    u[13] = this.L;
    u[14] = GEOMETRIES[this.geometry].geomId;
    u[15] = this.pxPerCell > 3 ? 1 : 0;
    u[16] = this.smoothing && !this.accumFresh ? SMOOTHING_ALPHA : 1;
    this.gpu.device.queue.writeBuffer(this.viewUniforms, 0, u);

    const latticePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.accum.createView(),
          loadOp: this.accumFresh ? 'clear' : 'load',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    this.accumFresh = false;
    latticePass.setPipeline(this.latticePipeline);
    latticePass.setBindGroup(0, this.latticeBind);
    latticePass.draw(3);
    latticePass.end();

    const blitPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    blitPass.setPipeline(this.blitPipeline);
    blitPass.setBindGroup(0, this.blitBind);
    blitPass.draw(3);
    blitPass.end();
  }
}
