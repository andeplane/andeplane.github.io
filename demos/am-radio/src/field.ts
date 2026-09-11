/// <reference types="@webgpu/types" />
// TMz Yee scheme; magnetic components are stored as Z0 H (same units as E).
export const NX = 256,
  NY = 128,
  DX = 5,
  COURANT = 0.45,
  DT = (COURANT * DX) / 299792458;
const shader = `
struct Params { time:f32, frequency:f32, amplitude:f32, wall:f32 };
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(2) var<uniform> p:Params;
fn damping(x:u32,y:u32)->f32 {let edge=f32(min(min(x,255u-x),min(y,127u-y)));let q=max(0.,1.-edge/16.);return exp(-.06*q*q);}
@compute @workgroup_size(8,8) fn magnetic(@builtin(global_invocation_id) id:vec3u){
 let x=id.x;let y=id.y;if(x>=256u||y>=128u){return;}let i=y*256u+x;
 let a=src[i];let right=src[y*256u+min(x+1u,255u)].x;let up=src[min(y+1u,127u)*256u+x].x;
 dst[i]=vec4f(a.x,(a.y-.45*(up-a.x))*damping(x,y),(a.z+.45*(right-a.x))*damping(x,y),0.);
}
@compute @workgroup_size(8,8) fn electric(@builtin(global_invocation_id) id:vec3u){
 let x=id.x;let y=id.y;if(x>=256u||y>=128u){return;}let i=y*256u+x;let a=src[i];
 let left=src[y*256u+select(x-1u,0u,x==0u)].z;let down=src[select(y-1u,0u,y==0u)*256u+x].y;
 var e=(a.x+.45*(a.z-left-a.y+down))*damping(x,y);
 if(x==32u&&y==64u){let ramp=min(1.,p.time/0.000001);e+=p.amplitude*ramp*sin(6.28318530718*p.frequency*p.time);}
 let wall=p.wall>.5 && x>=144u&&x<=146u&&(y<54u||y>74u);
 if(x==0u||x==255u||y==0u||y==127u||wall){e=0.;}
 dst[i]=vec4f(e,a.y,a.z,0.);
}`;
const renderShader = `
@group(0) @binding(0) var<storage,read> field:array<vec4f>;
@group(0) @binding(1) var<uniform> params:vec4f;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {var pos=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(pos[i],0.,1.);}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let x=min(u32(pos.x/params.x*256.),255u);let y=min(u32(pos.y/params.y*128.),127u);let v=field[y*256u+x].x;
 var c=mix(vec3f(.045,.085,.105),select(vec3f(.75,.48,.3),vec3f(.3,.9,.77),v>0.),clamp(abs(v)*24.,0.,1.));
 if(params.z>.5&&x>=144u&&x<=146u&&(y<54u||y>74u)){c=vec3f(.6,.66,.64);}
 if(abs(i32(x)-32)<=1&&abs(i32(y)-64)<=1){c=vec3f(.98,.88,.6);}
 if(abs(i32(x)-210)<=2&&abs(i32(y)-64)<=2&&(abs(i32(x)-210)==2||abs(i32(y)-64)==2)){c=vec3f(.95);}
 return vec4f(c,1.);
}`;
export function referenceStep(
  a: Float32Array,
  time: number,
  frequency: number,
  amplitude: number,
  wall: boolean,
) {
  const b = new Float32Array(a.length),
    out = new Float32Array(a.length);
  const damp = (x: number, y: number) =>
    Math.exp(
      -0.06 * Math.max(0, 1 - Math.min(x, 255 - x, y, 127 - y) / 16) ** 2,
    );
  for (let y = 0; y < NY; y++)
    for (let x = 0; x < NX; x++) {
      const i = (y * NX + x) * 4;
      b[i] = a[i];
      b[i + 1] =
        (a[i + 1] - 0.45 * (a[(Math.min(y + 1, 127) * NX + x) * 4] - a[i])) *
        damp(x, y);
      b[i + 2] =
        (a[i + 2] + 0.45 * (a[(y * NX + Math.min(x + 1, 255)) * 4] - a[i])) *
        damp(x, y);
    }
  for (let y = 0; y < NY; y++)
    for (let x = 0; x < NX; x++) {
      const i = (y * NX + x) * 4;
      let e =
        (b[i] +
          0.45 *
            (b[i + 2] -
              b[(y * NX + Math.max(0, x - 1)) * 4 + 2] -
              b[i + 1] +
              b[(Math.max(0, y - 1) * NX + x) * 4 + 1])) *
        damp(x, y);
      if (x === 32 && y === 64)
        e +=
          amplitude *
          Math.min(1, time / 1e-6) *
          Math.sin(2 * Math.PI * frequency * time);
      if (
        x === 0 ||
        x === 255 ||
        y === 0 ||
        y === 127 ||
        (wall && x >= 144 && x <= 146 && (y < 54 || y > 74))
      )
        e = 0;
      out[i] = e;
      out[i + 1] = b[i + 1];
      out[i + 2] = b[i + 2];
    }
  return out;
}
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
  const uniform = device.createBuffer({
    size: 64 * 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
  const params = new Float32Array(64 * 64);
  device.lost.then((info) => {
    alive = false;
    status.textContent = "WebGPU stopped: " + info.message;
  });
  device.addEventListener("uncapturederror", (event) => {
    status.textContent = "WebGPU error: " + event.error.message;
    alive = false;
  });
  function advance(
    encoder: GPUCommandEncoder,
    steps: number,
    f: number,
    amp: number,
    wall: boolean,
  ) {
    for (let n = 0; n < steps; n++) {
      time += DT;
      params.set([time, f, amp, wall ? 1 : 0], n * 64);
    }
    device.queue.writeBuffer(uniform, 0, params);
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
  // Compare real GPU results against the independent CPU stencil before showing a validated status.
  const read = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const enc = device.createCommandEncoder();
  advance(enc, 24, 900000, 1, false);
  enc.copyBufferToBuffer(a, 0, read, 0, bytes);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const actual = new Float32Array(read.getMappedRange());
  let expected = new Float32Array(NX * NY * 4);
  for (let n = 1; n <= 24; n++)
    expected = referenceStep(expected, n * DT, 900000, 1, false);
  let error = 0;
  for (let i = 0; i < expected.length; i++)
    error = Math.max(error, Math.abs(actual[i] - expected[i]));
  read.unmap();
  read.destroy();
  if (error > 1e-5) throw Error("GPU/CPU stencil validation failed: " + error);
  const zeros = new Float32Array(NX * NY * 4);
  device.queue.writeBuffer(a, 0, zeros);
  device.queue.writeBuffer(b, 0, zeros);
  time = 0;
  const probe = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  let probeValue = 0;
  status.textContent = `WebGPU compute · 256 × 128 Yee grid · CPU agreement ${error.toExponential(1)}`;
  return {
    get time() {
      return time;
    },
    get probe() {
      return probeValue;
    },
    reset() {
      if (!alive) return;
      device.queue.writeBuffer(a, 0, zeros);
      device.queue.writeBuffer(b, 0, zeros);
      time = 0;
    },
    async draw(
      running: boolean,
      frequency: number,
      amplitude: number,
      wall: boolean,
    ) {
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
        if (running) advance(encoder, 16, frequency, amplitude, wall);
        device.queue.writeBuffer(
          ru,
          0,
          new Float32Array([canvas.width, canvas.height, wall ? 1 : 0, 0]),
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
          encoder.copyBufferToBuffer(a, (64 * NX + 210) * 16, probe, 0, 16);
        device.queue.submit([encoder.finish()]);
        if (measure) {
          await probe.mapAsync(GPUMapMode.READ);
          probeValue = new Float32Array(probe.getMappedRange())[0];
          probe.unmap();
        } else await device.queue.onSubmittedWorkDone();
      } catch (error) {
        if (alive) status.textContent = "WebGPU stopped: " + String(error);
        alive = false;
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
