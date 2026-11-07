/**
 * The GPU solver: ζ on an N×N periodic grid, ψ by FFT, SSP-RK3 in time, plus the
 * passive cloud tracer, the ring sampler for the mode readout, and the render pass.
 * Every dispatch is recorded into one command encoder per frame.
 */
import { fftShader, FFT_WORKGROUP, type FftVariant } from '../gpu/shaders/fft.wgsl.ts';
import { RENDER } from '../gpu/shaders/render.wgsl.ts';
import { RHS, RING, RK, TRACER, TRACER_INIT, TRACER_SCALE } from '../gpu/shaders/sim.wgsl.ts';
import { RING_SAMPLES } from './modes.ts';
import { gridNu, gridWidthFactor, spongeRate, stableDt, targetVorticity, type Params } from './params.ts';

export const GRID_SIZES = [256, 512, 1024] as const;

export interface ViewState {
  /** 0 = Cassini clouds, 1 = vorticity, 2 = speed, 3 = dye */
  mode: number;
  /** ψ-contour density; 0 disables. */
  contours: number;
  exposure: number;
  showRing: boolean;
}

export interface MouseState {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

const UNIFORM_FLOATS = 24;

export class Solver {
  readonly n: number;
  readonly dx: number;
  readonly dt: number;
  time = 0;
  steps = 0;
  params: Params;

  private readonly device: GPUDevice;
  private readonly uniformData = new ArrayBuffer(UNIFORM_FLOATS * 4);
  private readonly uniformBuffer: GPUBuffer;

  // Vorticity ping-pong plus RK stages.
  private zA: GPUBuffer;
  private zB: GPUBuffer;
  private readonly z1: GPUBuffer;
  private readonly z2: GPUBuffer;
  private readonly k: GPUBuffer;
  private readonly psi: GPUBuffer;
  private readonly zt: GPUBuffer;
  private readonly sp: GPUBuffer;
  private readonly fftA: GPUBuffer;
  private readonly fftB: GPUBuffer;
  private readonly ring: GPUBuffer;
  private readonly ringStaging: GPUBuffer;
  private ringPending = false;
  private tracers: [GPUTexture, GPUTexture];
  private tracerParity = 0;
  private readonly sampler: GPUSampler;

  private readonly rhsPipeline: GPUComputePipeline;
  private readonly rkPipelines: [GPUComputePipeline, GPUComputePipeline, GPUComputePipeline];
  private readonly fftPipelines: GPUComputePipeline[];
  private readonly tracerPipeline: GPUComputePipeline;
  private readonly tracerInitPipeline: GPUComputePipeline;
  private readonly ringPipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;

  // Bind groups keyed by the vorticity buffer they read.
  private readonly fftRowsFwd = new Map<GPUBuffer, GPUBindGroup>();
  private readonly rhsGroups = new Map<GPUBuffer, GPUBindGroup>();
  private fftMid!: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
  private readonly ringGroups = new Map<GPUBuffer, GPUBindGroup>();
  private readonly renderGroups = new Map<string, GPUBindGroup>();
  private tracerGroups!: [GPUBindGroup, GPUBindGroup];
  // rk stage groups keyed by `${z0.label}/${stage}`; zin/zout follow from stage and z0.
  private readonly rkGroups = new Map<string, GPUBindGroup>();
  private tracerInitGroups!: [GPUBindGroup, GPUBindGroup];

  constructor(device: GPUDevice, n: number, params: Params, format: GPUTextureFormat) {
    this.device = device;
    this.n = n;
    this.dx = 2 / n;
    this.params = { ...params };
    this.dt = stableDt(n, params);

    const nn = n * n;
    const field = (label: string) =>
      device.createBuffer({
        label,
        size: nn * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    this.zA = field('zeta A');
    this.zB = field('zeta B');
    this.z1 = field('zeta stage 1');
    this.z2 = field('zeta stage 2');
    this.k = field('rhs');
    this.psi = field('psi');
    this.zt = field('target vorticity');
    this.sp = field('sponge');
    this.fftA = device.createBuffer({ label: 'fft scratch A', size: nn * 8, usage: GPUBufferUsage.STORAGE });
    this.fftB = device.createBuffer({ label: 'fft scratch B', size: nn * 8, usage: GPUBufferUsage.STORAGE });
    this.ring = device.createBuffer({
      label: 'ring',
      size: RING_SAMPLES * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.ringStaging = device.createBuffer({
      label: 'ring staging',
      size: RING_SAMPLES * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms',
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const tex = (label: string) =>
      device.createTexture({
        label,
        size: [n * TRACER_SCALE, n * TRACER_SCALE],
        format: 'rgba16float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.tracers = [tex('tracer 0'), tex('tracer 1')];
    this.sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
    });

    const compute = (label: string, code: string, constants?: Record<string, number>) =>
      device.createComputePipeline({
        label,
        layout: 'auto',
        compute: { module: device.createShaderModule({ label, code }), entryPoint: 'main', constants },
      });

    this.rhsPipeline = compute('rhs', RHS);
    const rkModule = device.createShaderModule({ label: 'rk', code: RK });
    const rk = (A: number, B: number) =>
      device.createComputePipeline({
        label: `rk ${A} ${B}`,
        layout: 'auto',
        compute: { module: rkModule, entryPoint: 'main', constants: { A, B } },
      });
    this.rkPipelines = [rk(0, 1), rk(0.75, 0.25), rk(1 / 3, 2 / 3)];

    const variants: FftVariant[] = [
      { axis: 'rows', inverse: false, inputReal: true, outputReal: false, poisson: false },
      { axis: 'cols', inverse: false, inputReal: false, outputReal: false, poisson: true },
      { axis: 'rows', inverse: true, inputReal: false, outputReal: false, poisson: false },
      { axis: 'cols', inverse: true, inputReal: false, outputReal: true, poisson: false },
    ];
    this.fftPipelines = variants.map((v, i) => compute(`fft ${i}`, fftShader(n, v)));
    this.tracerPipeline = compute('tracer', TRACER);
    this.tracerInitPipeline = compute('tracer init', TRACER_INIT);
    this.ringPipeline = compute('ring', RING.replace('RING_SAMPLES_U', `${RING_SAMPLES}u`));

    const renderModule = device.createShaderModule({ label: 'render', code: RENDER });
    this.renderPipeline = device.createRenderPipeline({
      label: 'render',
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs' },
      fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    this.buildBindGroups();
    this.uploadProfiles();
    this.reset();
  }

  private buildBindGroups(): void {
    const d = this.device;
    const u = { binding: 0, resource: { buffer: this.uniformBuffer } };
    const buf = (binding: number, buffer: GPUBuffer) => ({ binding, resource: { buffer } });

    for (const z of [this.zA, this.zB, this.z1, this.z2]) {
      this.fftRowsFwd.set(
        z,
        d.createBindGroup({
          layout: this.fftPipelines[0].getBindGroupLayout(0),
          entries: [buf(0, z), buf(1, this.fftA)],
        }),
      );
      this.rhsGroups.set(
        z,
        d.createBindGroup({
          layout: this.rhsPipeline.getBindGroupLayout(0),
          entries: [u, buf(1, z), buf(2, this.psi), buf(3, this.zt), buf(4, this.sp), buf(5, this.k)],
        }),
      );
      this.ringGroups.set(
        z,
        d.createBindGroup({
          layout: this.ringPipeline.getBindGroupLayout(0),
          entries: [u, buf(1, z), buf(2, this.ring)],
        }),
      );
    }
    this.fftMid = [
      d.createBindGroup({
        layout: this.fftPipelines[1].getBindGroupLayout(0),
        entries: [buf(0, this.fftA), buf(1, this.fftB)],
      }),
      d.createBindGroup({
        layout: this.fftPipelines[2].getBindGroupLayout(0),
        entries: [buf(0, this.fftB), buf(1, this.fftA)],
      }),
      d.createBindGroup({
        layout: this.fftPipelines[3].getBindGroupLayout(0),
        entries: [buf(0, this.fftA), buf(1, this.psi)],
      }),
    ];

    for (const [z0, zB] of [[this.zA, this.zB], [this.zB, this.zA]] as const) {
      const stages: [GPUBuffer, GPUBuffer][] = [[z0, this.z1], [this.z1, this.z2], [this.z2, zB]];
      stages.forEach(([zin, zout], stage) => {
        this.rkGroups.set(
          `${z0.label}/${stage}`,
          d.createBindGroup({
            layout: this.rkPipelines[stage].getBindGroupLayout(0),
            entries: [u, buf(1, z0), buf(2, zin), buf(3, this.k), buf(4, zout)],
          }),
        );
      });
    }

    const tracerGroup = (src: number) =>
      d.createBindGroup({
        layout: this.tracerPipeline.getBindGroupLayout(0),
        entries: [
          u,
          buf(1, this.psi),
          { binding: 2, resource: this.tracers[src].createView() },
          { binding: 3, resource: this.sampler },
          { binding: 4, resource: this.tracers[1 - src].createView() },
        ],
      });
    this.tracerGroups = [tracerGroup(0), tracerGroup(1)];
    this.tracerInitGroups = [0, 1].map((i) =>
      d.createBindGroup({
        layout: this.tracerInitPipeline.getBindGroupLayout(0),
        entries: [u, { binding: 1, resource: this.tracers[i].createView() }],
      }),
    ) as [GPUBindGroup, GPUBindGroup];

    for (const z of [this.zA, this.zB]) {
      for (const t of [0, 1]) {
        this.renderGroups.set(
          `${z.label}/${t}`,
          d.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
              u,
              buf(1, z),
              buf(2, this.psi),
              { binding: 3, resource: this.tracers[t].createView() },
              { binding: 4, resource: this.sampler },
            ],
          }),
        );
      }
    }
  }

  /** Recompute the target-vorticity and sponge fields from the current params. */
  uploadProfiles(): void {
    const { n, dx, params } = this;
    const profile = { ...params, jetWidth: params.jetWidth * gridWidthFactor(n) };
    const zt = new Float32Array(n * n);
    const sp = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const y = -1 + (j + 0.5) * dx;
      for (let i = 0; i < n; i++) {
        const x = -1 + (i + 0.5) * dx;
        const r = Math.hypot(x, y);
        zt[j * n + i] = targetVorticity(r, profile);
        sp[j * n + i] = spongeRate(r, params);
      }
    }
    this.device.queue.writeBuffer(this.zt, 0, zt);
    this.device.queue.writeBuffer(this.sp, 0, sp);
    this.ztCache = zt;
  }
  private ztCache: Float32Array | null = null;

  setParams(p: Params): void {
    const profileKeys: (keyof Params)[] = ['jetRadius', 'jetWidth', 'jetSpeed', 'poleSpeed', 'poleRadius', 'capRadius', 'spongeRate'];
    const changed = profileKeys.some((key) => p[key] !== this.params[key]);
    this.params = { ...p };
    if (changed) this.uploadProfiles();
  }

  /** Start over on the target jet plus seed noise. */
  reset(): void {
    if (!this.ztCache) this.uploadProfiles();
    const zt = this.ztCache!;
    const z = new Float32Array(zt.length);
    const a = this.params.seedNoise;
    for (let i = 0; i < z.length; i++) z[i] = zt[i] * (1 + a * (Math.random() - 0.5)) + a * (Math.random() - 0.5);
    this.device.queue.writeBuffer(this.zA, 0, z);
    this.time = 0;
    this.steps = 0;
    this.writeUniforms({ mode: 0, contours: 0, exposure: 1, showRing: false }, { x: 0, y: 0, strength: 0, radius: 0.05 }, 1, 0);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.tracerInitPipeline);
    const wg = Math.ceil((this.n * TRACER_SCALE) / 16);
    for (const g of this.tracerInitGroups) {
      pass.setBindGroup(0, g);
      pass.dispatchWorkgroups(wg, wg);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Re-seed the tracers only (keep the flow). */
  resetTracers(): void {
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.tracerInitPipeline);
    const wg = Math.ceil((this.n * TRACER_SCALE) / 16);
    for (const g of this.tracerInitGroups) {
      pass.setBindGroup(0, g);
      pass.dispatchWorkgroups(wg, wg);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  private writeUniforms(view: ViewState, mouse: MouseState, aspect: number, frameDt: number): void {
    const f = new Float32Array(this.uniformData);
    const i = new Uint32Array(this.uniformData);
    const p = this.params;
    i[0] = this.n;
    f[1] = this.dt;
    f[2] = this.dx;
    f[3] = this.time;
    f[4] = p.jetRadius;
    f[5] = p.gamma;
    f[6] = gridNu(this.n, p.nu);
    f[7] = p.relax;
    f[8] = mouse.x;
    f[9] = mouse.y;
    f[10] = mouse.strength;
    f[11] = mouse.radius;
    f[12] = view.mode;
    f[13] = view.contours;
    f[14] = view.exposure;
    f[15] = aspect;
    f[16] = 0.9; // tracer inject
    f[17] = 0.35; // tracer decay
    f[18] = frameDt;
    f[19] = this.steps % 100000; // noise seed
    f[20] = p.capRadius;
    f[21] = 34; // band frequency
    f[22] = view.showRing ? 1 : 0;
    f[23] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
  }

  private solvePsi(pass: GPUComputePassEncoder, z: GPUBuffer): void {
    pass.setPipeline(this.fftPipelines[0]);
    pass.setBindGroup(0, this.fftRowsFwd.get(z)!);
    pass.dispatchWorkgroups(this.n);
    for (let s = 1; s < 4; s++) {
      pass.setPipeline(this.fftPipelines[s]);
      pass.setBindGroup(0, this.fftMid[s - 1]);
      pass.dispatchWorkgroups(this.n);
    }
  }

  private rhs(pass: GPUComputePassEncoder, z: GPUBuffer): void {
    this.solvePsi(pass, z);
    pass.setPipeline(this.rhsPipeline);
    pass.setBindGroup(0, this.rhsGroups.get(z)!);
    const wg = Math.ceil(this.n / 16);
    pass.dispatchWorkgroups(wg, wg);
  }

  private rk(pass: GPUComputePassEncoder, stage: number, z0: GPUBuffer): void {
    pass.setPipeline(this.rkPipelines[stage]);
    pass.setBindGroup(0, this.rkGroups.get(`${z0.label}/${stage}`)!);
    pass.dispatchWorkgroups(Math.ceil((this.n * this.n) / 256));
  }

  /**
   * Advance `steps` time steps, advect the tracer, sample the ring, and draw.
   */
  frame(steps: number, view: ViewState, mouse: MouseState, target: GPUTextureView, aspect: number): void {
    const frameDt = steps * this.dt;
    this.writeUniforms(view, mouse, aspect, frameDt);

    const enc = this.device.createCommandEncoder({ label: 'frame' });
    const pass = enc.beginComputePass();
    for (let s = 0; s < steps; s++) {
      // SSP-RK3: z1 = z + dt k(z); z2 = ¾z + ¼(z1 + dt k(z1)); z' = ⅓z + ⅔(z2 + dt k(z2))
      this.rhs(pass, this.zA);
      this.rk(pass, 0, this.zA);
      this.rhs(pass, this.z1);
      this.rk(pass, 1, this.zA);
      this.rhs(pass, this.z2);
      this.rk(pass, 2, this.zA);
      [this.zA, this.zB] = [this.zB, this.zA];
      this.time += this.dt;
      this.steps++;
    }
    // ψ for the current state — used by the tracer and the renderer.
    this.solvePsi(pass, this.zA);
    if (steps > 0) {
      pass.setPipeline(this.tracerPipeline);
      pass.setBindGroup(0, this.tracerGroups[this.tracerParity]);
      const wg = Math.ceil((this.n * TRACER_SCALE) / 16);
      pass.dispatchWorkgroups(wg, wg);
      this.tracerParity = 1 - this.tracerParity;
    }
    pass.setPipeline(this.ringPipeline);
    pass.setBindGroup(0, this.ringGroups.get(this.zA)!);
    pass.dispatchWorkgroups(Math.ceil(RING_SAMPLES / 64));
    pass.end();

    if (!this.ringPending) enc.copyBufferToBuffer(this.ring, 0, this.ringStaging, 0, RING_SAMPLES * 4);

    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }],
    });
    rp.setPipeline(this.renderPipeline);
    rp.setBindGroup(0, this.renderGroups.get(`${this.zA.label}/${this.tracerParity}`)!);
    rp.draw(3);
    rp.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Resolve with the latest ring samples, or null if a readback is still in flight. */
  async readRing(): Promise<Float32Array | null> {
    if (this.ringPending) return null;
    this.ringPending = true;
    try {
      await this.ringStaging.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(this.ringStaging.getMappedRange().slice(0));
      this.ringStaging.unmap();
      return out;
    } finally {
      this.ringPending = false;
    }
  }

  destroy(): void {
    for (const b of [this.zA, this.zB, this.z1, this.z2, this.k, this.psi, this.zt, this.sp, this.fftA, this.fftB, this.ring, this.ringStaging, this.uniformBuffer]) b.destroy();
    for (const t of this.tracers) t.destroy();
  }
}

export { FFT_WORKGROUP };
