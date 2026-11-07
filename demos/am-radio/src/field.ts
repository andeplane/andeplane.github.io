/// <reference types="@webgpu/types" />
/**
 * Two-dimensional TMz Maxwell solver (E_z, H_x, H_y) on a Yee grid, computed
 * on WebGPU with an independent CPU reference used for validation.
 *
 * The source is a line current at SOURCE fed with an arbitrary sample stream;
 * every step's E_z at PROBE is written to a GPU buffer so that a long run can
 * be read back as a time series and fed through the receiver chain (the
 * "slow mode": this grid needs 133 million steps per second of physical
 * time, so it cannot drive the audible receiver in real time).
 *
 * Magnetic components are stored as η₀H (same units as E). The outer 24 cells
 * on every side are a split-field perfectly matched layer; the tests measure
 * its residual reflection at normal and grazing incidence.
 */
export const NX = 256,
  NY = 128,
  DX = 5,
  COURANT = 0.45,
  DT = (COURANT * DX) / 299792458;
export const SOURCE = { x: 32, y: 64 };
export const PROBE = { x: 210, y: 64 };
export const SCREEN = { x0: 144, x1: 146, gapLow: 54, gapHigh: 74 };
/**
 * Split-field (Berenger) perfectly matched layer of PML cells on every side,
 * polynomial grading of order PML_ORDER. Losses are stored in the
 * dimensionless form L = σΔt/(2ε₀) (= σ*Δt/(2μ₀), matched), so that a field
 * component decays as (1 − L)/(1 + L) per step. PML_MAX follows the usual
 * estimate σ_max = −(m+1) ε₀ c ln(R) / (2 d Δx) for a normal-incidence design
 * reflection R; the tests measure what the layer actually reflects.
 */
export const PML = 24,
  PML_ORDER = 3,
  PML_DESIGN_REFLECTION = 1e-6,
  PML_MAX = (-(PML_ORDER + 1) * COURANT * Math.log(PML_DESIGN_REFLECTION)) / (4 * PML);
/** Dimensionless loss at a (possibly half-integer) distance `edge` from the outer boundary. */
export function pmlLoss(edge: number) {
  const q = Math.max(0, (PML - edge) / PML);
  return PML_MAX * Math.pow(q, PML_ORDER);
}
/** Screen modes: 0 none, 1 conducting screen with an aperture, 2 closed conducting screen. */
export type Wall = 0 | 1 | 2;
export const BATCH = 1024;
const shader = `
struct Params { source:f32, wall:f32, step:u32, pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(2) var<uniform> p:Params;
@group(0) @binding(3) var<storage,read_write> probe:array<f32>;
// Cell layout: (E_zx, η₀H_x, η₀H_y, E_zy); E_z = x + w.
fn loss(edge:f32)->f32 {let q=max(0.,(${PML}.-edge)/${PML}.);return ${PML_MAX}*q*q*q;}
fn lx(pos:f32)->f32 {return loss(min(pos,${NX - 1}.-pos));}
fn ly(pos:f32)->f32 {return loss(min(pos,${NY - 1}.-pos));}
fn screen(x:u32,y:u32,wall:f32)->bool {
 if(wall<.5||x<${SCREEN.x0}u||x>${SCREEN.x1}u){return false;}
 return wall>1.5||y<${SCREEN.gapLow}u||y>${SCREEN.gapHigh}u;
}
@compute @workgroup_size(8,8) fn magnetic(@builtin(global_invocation_id) id:vec3u){
 let x=id.x;let y=id.y;if(x>=${NX}u||y>=${NY}u){return;}let i=y*${NX}u+x;
 let a=src[i];let e=a.x+a.w;
 let r=src[y*${NX}u+min(x+1u,${NX - 1}u)];let u=src[min(y+1u,${NY - 1}u)*${NX}u+x];
 let right=r.x+r.w;let up=u.x+u.w;
 let my=ly(f32(y)+.5);let mx=lx(f32(x)+.5);
 let hx=((1.-my)*a.y-${COURANT}*(up-e))/(1.+my);
 let hy=((1.-mx)*a.z+${COURANT}*(right-e))/(1.+mx);
 dst[i]=vec4f(a.x,hx,hy,a.w);
}
@compute @workgroup_size(8,8) fn electric(@builtin(global_invocation_id) id:vec3u){
 let x=id.x;let y=id.y;if(x>=${NX}u||y>=${NY}u){return;}let i=y*${NX}u+x;let a=src[i];
 let left=src[y*${NX}u+select(x-1u,0u,x==0u)].z;let down=src[select(y-1u,0u,y==0u)*${NX}u+x].y;
 let ex=lx(f32(x));let ey=ly(f32(y));
 var ezx=((1.-ex)*a.x+${COURANT}*(a.z-left))/(1.+ex);
 var ezy=((1.-ey)*a.w-${COURANT}*(a.y-down))/(1.+ey);
 if(x==${SOURCE.x}u&&y==${SOURCE.y}u){ezx+=p.source;}
 if(x==0u||x==${NX - 1}u||y==0u||y==${NY - 1}u||screen(x,y,p.wall)){ezx=0.;ezy=0.;}
 dst[i]=vec4f(ezx,a.y,a.z,ezy);
 if(x==${PROBE.x}u&&y==${PROBE.y}u){probe[p.step]=ezx+ezy;}
}`;
const renderShader = `
@group(0) @binding(0) var<storage,read> field:array<vec4f>;
@group(0) @binding(1) var<uniform> params:vec4f;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {var pos=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(pos[i],0.,1.);}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let x=min(u32(pos.x/params.x*${NX}.),${NX - 1}u);let y=min(u32(pos.y/params.y*${NY}.),${NY - 1}u);let cell=field[y*${NX}u+x];let v=(cell.x+cell.w)/params.w;
 var c=mix(vec3f(.045,.085,.105),select(vec3f(.75,.48,.3),vec3f(.3,.9,.77),v>0.),clamp(abs(v),0.,1.));
 let wall=params.z;
 if(wall>.5&&x>=${SCREEN.x0}u&&x<=${SCREEN.x1}u&&(wall>1.5||y<${SCREEN.gapLow}u||y>${SCREEN.gapHigh}u)){c=vec3f(.6,.66,.64);}
 let edge=min(min(x,${NX - 1}u-x),min(y,${NY - 1}u-y));
 if(edge==${PML}u){c=mix(c,vec3f(.5,.55,.5),.35);}
 if(abs(i32(x)-${SOURCE.x})<=1&&abs(i32(y)-${SOURCE.y})<=1){c=vec3f(.98,.88,.6);}
 if(abs(i32(x)-${PROBE.x})<=2&&abs(i32(y)-${PROBE.y})<=2&&(abs(i32(x)-${PROBE.x})==2||abs(i32(y)-${PROBE.y})==2)){c=vec3f(.95);}
 return vec4f(c,1.);
}`;
/**
 * CPU reference of one step: identical arithmetic to the WGSL kernels.
 * `a` holds vec4 cells (E_zx, η₀H_x, η₀H_y, E_zy); E_z = E_zx + E_zy.
 * `source` is the soft-source sample added to E_z at SOURCE this step.
 */
export function referenceStep(a: Float32Array, source: number, wall: Wall) {
  const b = new Float32Array(a.length),
    out = new Float32Array(a.length);
  const lx = (pos: number) => pmlLoss(Math.min(pos, NX - 1 - pos));
  const ly = (pos: number) => pmlLoss(Math.min(pos, NY - 1 - pos));
  const screen = (x: number, y: number) =>
    wall !== 0 &&
    x >= SCREEN.x0 &&
    x <= SCREEN.x1 &&
    (wall === 2 || y < SCREEN.gapLow || y > SCREEN.gapHigh);
  const ez = (x: number, y: number) => {
    const i = (y * NX + x) * 4;
    return a[i] + a[i + 3];
  };
  for (let y = 0; y < NY; y++) {
    const my = ly(y + 0.5);
    for (let x = 0; x < NX; x++) {
      const i = (y * NX + x) * 4,
        mx = lx(x + 0.5),
        e = a[i] + a[i + 3];
      b[i] = a[i];
      b[i + 3] = a[i + 3];
      b[i + 1] = ((1 - my) * a[i + 1] - COURANT * (ez(x, Math.min(y + 1, NY - 1)) - e)) / (1 + my);
      b[i + 2] = ((1 - mx) * a[i + 2] + COURANT * (ez(Math.min(x + 1, NX - 1), y) - e)) / (1 + mx);
    }
  }
  for (let y = 0; y < NY; y++) {
    const ey = ly(y);
    for (let x = 0; x < NX; x++) {
      const i = (y * NX + x) * 4,
        ex = lx(x);
      let ezx = ((1 - ex) * b[i] + COURANT * (b[i + 2] - b[(y * NX + Math.max(0, x - 1)) * 4 + 2])) / (1 + ex);
      let ezy = ((1 - ey) * b[i + 3] - COURANT * (b[i + 1] - b[(Math.max(0, y - 1) * NX + x) * 4 + 1])) / (1 + ey);
      if (x === SOURCE.x && y === SOURCE.y) ezx += source;
      if (x === 0 || x === NX - 1 || y === 0 || y === NY - 1 || screen(x, y)) ezx = ezy = 0;
      out[i] = ezx;
      out[i + 1] = b[i + 1];
      out[i + 2] = b[i + 2];
      out[i + 3] = ezy;
    }
  }
  return out;
}
/** E_z of a cell in the reference layout. */
export const fieldAt = (a: Float32Array, x: number, y: number) =>
  a[(y * NX + x) * 4] + a[(y * NX + x) * 4 + 3];
/**
 * Soft-source sample that represents a line current I (A) through the source
 * cell: E_z += -(Δt/ε₀) I/Δx². The sign is dropped (a phase reference).
 */
export const EPS0 = 8.8541878128e-12,
  MU0 = 1.25663706212e-6;
export const sourceForCurrent = (current: number) =>
  (current * DT) / (EPS0 * DX * DX);
/**
 * Far-zone amplitude of a 2D line current: |E_z| = (ωμ₀|I|/4)·sqrt(2/(π k r)),
 * the large-argument form of the Hankel function H₀⁽²⁾(kr).
 */
export function lineSourceField(current: number, frequency: number, r: number) {
  const w = 2 * Math.PI * frequency,
    k = w / 299792458;
  return ((w * MU0 * current) / 4) * Math.sqrt(2 / (Math.PI * k * r));
}
/** Source sample amplitude that gives `field` V/m at the probe for carrier `frequency`. */
export function sourceForProbeField(field: number, frequency: number) {
  const r = Math.hypot(PROBE.x - SOURCE.x, PROBE.y - SOURCE.y) * DX;
  return sourceForCurrent(field / lineSourceField(1, frequency, r));
}
export const PROBE_DISTANCE = Math.hypot(PROBE.x - SOURCE.x, PROBE.y - SOURCE.y) * DX;
export async function createField(
  canvas: HTMLCanvasElement,
  status: HTMLElement,
) {
  if (!navigator.gpu)
    throw Error(
      "WebGPU unavailable in this browser. Audio and the circuit remain available.",
    );
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No WebGPU adapter available.");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu")!;
  if (!context) throw Error("Could not create WebGPU canvas.");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const bytes = NX * NY * 16;
  const a = device.createBuffer({
    size: bytes,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });
  const b = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  // One 256-byte-aligned parameter block per step (dynamic offsets).
  const uniform = device.createBuffer({
    size: 256 * BATCH,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const probeBuffer = device.createBuffer({
    size: 4 * BATCH,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const probeRead = device.createBuffer({
    size: 4 * BATCH,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const layout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 16 },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });
  const module = device.createShaderModule({ code: shader });
  const info = await module.getCompilationInfo();
  if (info.messages.some((m) => m.type === "error"))
    throw Error(info.messages.map((m) => m.message).join("; "));
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout],
  });
  const h = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: "magnetic" },
    }),
    e = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: "electric" },
    });
  const group = (input: GPUBuffer, output: GPUBuffer) =>
    device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: output } },
        { binding: 2, resource: { buffer: uniform, size: 16 } },
        { binding: 3, resource: { buffer: probeBuffer } },
      ],
    });
  const hg = group(a, b),
    eg = group(b, a);
  const rm = device.createShaderModule({ code: renderShader });
  const rp = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: rm, entryPoint: "vs" },
    fragment: { module: rm, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const ru = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const rg = device.createBindGroup({
    layout: rp.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: a } },
      { binding: 1, resource: { buffer: ru } },
    ],
  });
  let time = 0,
    busy = false,
    alive = true,
    frame = 0;
  const params = new ArrayBuffer(256 * BATCH);
  const paramF = new Float32Array(params),
    paramU = new Uint32Array(params);
  device.lost.then((info) => {
    alive = false;
    status.textContent = "WebGPU stopped: " + info.message;
  });
  device.addEventListener("uncapturederror", (event) => {
    status.textContent = "WebGPU error: " + event.error.message;
    alive = false;
  });
  /** Encode `samples.length` (≤ BATCH) steps with the given source samples. */
  function advance(encoder: GPUCommandEncoder, samples: ArrayLike<number>, wall: Wall) {
    const steps = samples.length;
    for (let n = 0; n < steps; n++) {
      time += DT;
      paramF[n * 64] = samples[n];
      paramF[n * 64 + 1] = wall;
      paramU[n * 64 + 2] = n;
    }
    device.queue.writeBuffer(uniform, 0, params, 0, 256 * steps);
    const pass = encoder.beginComputePass();
    for (let n = 0; n < steps; n++) {
      pass.setPipeline(h);
      pass.setBindGroup(0, hg, [n * 256]);
      pass.dispatchWorkgroups(NX / 8, NY / 8);
      pass.setPipeline(e);
      pass.setBindGroup(0, eg, [n * 256]);
      pass.dispatchWorkgroups(NX / 8, NY / 8);
    }
    pass.end();
  }
  const zeros = new Float32Array(NX * NY * 4);
  function clear() {
    device.queue.writeBuffer(a, 0, zeros);
    device.queue.writeBuffer(b, 0, zeros);
    time = 0;
  }
  // Compare real GPU results against the independent CPU stencil before showing a validated status.
  const read = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const check = Float32Array.from({ length: 24 }, (_, n) =>
    Math.sin(2 * Math.PI * 900e3 * (n + 1) * DT),
  );
  const enc = device.createCommandEncoder();
  advance(enc, check, 1);
  enc.copyBufferToBuffer(a, 0, read, 0, bytes);
  enc.copyBufferToBuffer(probeBuffer, 0, probeRead, 0, 4 * 24);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const actual = new Float32Array(read.getMappedRange());
  let expected = new Float32Array(NX * NY * 4);
  for (let n = 0; n < 24; n++) expected = referenceStep(expected, check[n], 1);
  let error = 0;
  for (let i = 0; i < expected.length; i++)
    error = Math.max(error, Math.abs(actual[i] - expected[i]));
  read.unmap();
  read.destroy();
  if (error > 1e-5) throw Error("GPU/CPU stencil validation failed: " + error);
  clear();
  let probeValue = 0;
  const probeSingle = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  status.textContent = `WebGPU compute · ${NX} × ${NY} Yee grid · CPU agreement ${error.toExponential(1)}`;
  return {
    get time() {
      return time;
    },
    get probe() {
      return probeValue;
    },
    get alive() {
      return alive;
    },
    memoryBytes: 2 * bytes + 256 * BATCH + 8 * BATCH,
    reset() {
      if (!alive) return;
      clear();
    },
    /** Interactive display: advance `samples.length` steps (≤ BATCH) and render. */
    async draw(samples: ArrayLike<number>, wall: Wall, scale: number) {
      if (busy || !alive) return;
      busy = true;
      try {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(
          1,
          Math.round(bounds.width * Math.min(devicePixelRatio, 2)),
        );
        const height = Math.max(
          1,
          Math.round(bounds.height * Math.min(devicePixelRatio, 2)),
        );
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const encoder = device.createCommandEncoder();
        if (samples.length) advance(encoder, samples, wall);
        device.queue.writeBuffer(
          ru,
          0,
          new Float32Array([canvas.width, canvas.height, wall, scale]),
        );
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });
        pass.setPipeline(rp);
        pass.setBindGroup(0, rg);
        pass.draw(3);
        pass.end();
        const measure = frame++ % 30 === 0;
        if (measure)
          encoder.copyBufferToBuffer(
            a,
            (PROBE.y * NX + PROBE.x) * 16,
            probeSingle,
            0,
            16,
          );
        device.queue.submit([encoder.finish()]);
        if (measure) {
          await probeSingle.mapAsync(GPUMapMode.READ);
          probeValue = new Float32Array(probeSingle.getMappedRange())[0];
          probeSingle.unmap();
        } else await device.queue.onSubmittedWorkDone();
      } catch (error) {
        if (alive) status.textContent = "WebGPU stopped: " + String(error);
        alive = false;
      } finally {
        busy = false;
      }
    },
    /**
     * Slow mode: run the whole `samples` stream from an empty grid and return
     * E_z at the probe for every step. Steps are submitted in batches of
     * BATCH with a probe read-back per batch; `progress` reports steps done and
     * may return false to cancel.
     */
    async run(
      samples: Float32Array,
      wall: Wall,
      progress?: (done: number, total: number) => boolean | void,
    ) {
      if (!alive) throw Error("WebGPU device is not available.");
      while (busy) await new Promise((r) => setTimeout(r, 5));
      busy = true;
      try {
        clear();
        const out = new Float32Array(samples.length);
        for (let start = 0; start < samples.length; start += BATCH) {
          const chunk = samples.subarray(start, Math.min(start + BATCH, samples.length));
          const encoder = device.createCommandEncoder();
          advance(encoder, chunk, wall);
          encoder.copyBufferToBuffer(probeBuffer, 0, probeRead, 0, 4 * chunk.length);
          device.queue.submit([encoder.finish()]);
          await probeRead.mapAsync(GPUMapMode.READ, 0, 4 * chunk.length);
          out.set(new Float32Array(probeRead.getMappedRange(0, 4 * chunk.length)), start);
          probeRead.unmap();
          if (progress?.(start + chunk.length, samples.length) === false)
            throw Error("cancelled");
          if (!alive) throw Error("WebGPU device was lost during the run.");
        }
        return out;
      } finally {
        busy = false;
      }
    },
    dispose() {
      alive = false;
      device.destroy();
    },
  };
}
export type Field = Awaited<ReturnType<typeof createField>>;
