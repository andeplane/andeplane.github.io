/**
 * Buffers, pipelines and the per-frame dispatch for the GPU solver.
 *
 * The whole model lives in three arenas so the shaders stay within WebGPU's guaranteed
 * eight storage buffers per stage; `layout.ts` decides where everything sits, and the
 * offsets ride along in the uniform block, so there is only one place a mistake can be
 * made. The renderer binds the same arenas, which is why deformed positions never make a
 * round trip through the CPU.
 */

import type { Mesh } from '../model/mesh.ts';
import { buildAdjacency } from '../model/mesh.ts';
import type { Materials } from '../physics/materials.ts';
import type { F32, U32 } from '../model/types.ts';
import type { WorldOptions } from '../physics/world.ts';
import { boxStiffness, maxElementFrequency } from '../physics/element.ts';
import { buildNodeLoads } from '../physics/load.ts';
import type { Charge } from '../physics/blast.ts';
import { layoutFor, OFFSET_FIELDS, PARAMS_BYTES, TRACE_SAMPLES, type Layout } from './layout.ts';
import { simShader } from './shaders/sim.wgsl.ts';

export interface Stats {
  /** Fraction of joints fully cracked. */
  cracked: number;
  maxSpeed: number;
  /** Fraction of nodes moving faster than 0.5 m/s. */
  flying: number;
  /** Interleaved (time, displacement) pairs for the probe node. */
  trace: Float32Array;
}

export class GpuSolver {
  readonly device: GPUDevice;
  readonly mesh: Mesh;
  readonly layout: Layout;
  readonly params: GPUBuffer;
  readonly u32: GPUBuffer;
  readonly ro: GPUBuffer;
  readonly rw: GPUBuffer;

  private readonly bindGroup: GPUBindGroup;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private readonly paramBytes = new ArrayBuffer(PARAMS_BYTES);
  private readonly paramF32 = new Float32Array(this.paramBytes);
  private readonly paramU32 = new Uint32Array(this.paramBytes);
  /** The read-only arena, kept CPU-side so loads and K can be patched in place. */
  private readonly roData: F32;

  materials: Materials;
  world: WorldOptions;
  charge: Charge;
  dt = 1e-5;
  /** Simulated time, mirrored on the CPU so the UI can read it without a readback. */
  time = 0;
  nodeMass: number;
  /** The density the mesh's nodal masses were baked at, so a change can be rescaled. */
  private readonly buildDensity: number;
  /** Live nodal inverse masses, rescaled whenever the density changes. */
  private readonly invMass: F32;
  /** The node whose displacement history the d(t) plot shows. */
  readonly probeNode: number;
  private staging: GPUBuffer | null = null;
  private statsPending = false;

  constructor(
    device: GPUDevice,
    mesh: Mesh,
    materials: Materials,
    world: WorldOptions,
    charge: Charge,
  ) {
    this.device = device;
    this.mesh = mesh;
    this.materials = materials;
    this.world = world;
    this.charge = charge;
    this.layout = layoutFor(mesh);
    this.nodeMass = (materials.density * mesh.dx * mesh.dy * mesh.dz) / 8;
    this.buildDensity = materials.density;
    this.invMass = Float32Array.from(mesh.invMass);
    this.probeNode = findProbeNode(mesh);

    const L = this.layout;
    const adj = buildAdjacency(mesh);

    const u32Data = new Uint32Array(L.u32Size);
    u32Data.set(mesh.elements, L.off.elements);
    u32Data.set(mesh.pairs, L.off.pairs);
    u32Data.set(Uint32Array.from(mesh.pairAxis), L.off.pairAxis);
    u32Data.set(adj.elemStart, L.off.elemStart);
    u32Data.set(adj.elemData, L.off.elemData);
    u32Data.set(adj.pairStart, L.off.pairStart);
    u32Data.set(adj.pairData, L.off.pairData);
    for (let u = 0; u < L.u; u++) {
      u32Data[L.off.unitRange + u * 2] = mesh.unitNodeStart[u];
      u32Data[L.off.unitRange + u * 2 + 1] = mesh.unitNodeEnd[u];
    }
    u32Data.set(mesh.nodeUnit, L.off.nodeUnit);

    this.roData = new Float32Array(L.roSize);
    this.roData.set(mesh.x0, L.off.x0);
    this.roData.set(mesh.invMass, L.off.invMass);
    this.roData.set(mesh.pairArea, L.off.pairArea);
    this.roData.set(mesh.unitScale, L.off.unitScale);

    this.params = device.createBuffer({
      label: 'sim params',
      size: PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.u32 = makeBuffer(device, 'sim u32', u32Data);
    this.ro = device.createBuffer({
      label: 'sim ro',
      size: L.roSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.rw = device.createBuffer({
      label: 'sim rw',
      size: L.rwSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const module = device.createShaderModule({ label: 'sim', code: simShader });
    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    this.pipelines = {};
    for (const entry of ['elementForces', 'jointForces', 'integrate', 'advanceClock', 'unitCentroids']) {
      this.pipelines[entry] = device.createComputePipeline({
        label: entry,
        layout: pl,
        compute: { module, entryPoint: entry },
      });
    }
    this.bindGroup = device.createBindGroup({
      label: 'sim',
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.u32 } },
        { binding: 2, resource: { buffer: this.ro } },
        { binding: 3, resource: { buffer: this.rw } },
      ],
    });

    this.updateMaterials(materials);
    this.updateLoad(charge);
    this.flushReadOnly();
    this.reset(false);
  }

  /**
   * Critical time step, measured rather than estimated.
   *
   * Which of element, joint or ground governs depends on the mesh and on parameters the
   * user is free to drag around, so all three are measured and the smallest wins. The
   * textbook L/c estimate is only approximate for a hex, and being wrong here does not
   * degrade gracefully — it detonates.
   */
  criticalStep(K: F32): number {
    const m = this.mesh;
    const wElem = maxElementFrequency(K, this.nodeMass);
    let kMax = 0;
    for (let p = 0; p < m.pairCount; p++) {
      kMax = Math.max(kMax, Math.max(this.materials.kn, this.materials.ks) * m.pairArea[p]);
    }
    let invMassMax = 0;
    for (let i = 0; i < m.pairCount * 2; i++) {
      invMassMax = Math.max(invMassMax, this.invMass[m.pairs[i]]);
    }
    const wJoint = Math.sqrt(kMax * 2 * invMassMax);
    return 2 / Math.max(wElem, wJoint, this.world.groundOmega, 1e-6);
  }

  updateMaterials(materials: Materials): void {
    this.materials = materials;
    this.nodeMass = (materials.density * this.mesh.dx * this.mesh.dy * this.mesh.dz) / 8;

    // The mesh baked its nodal masses at the density it was built with, so a density
    // change has to move them too. Mass is linear in density, so rescale rather than
    // re-mesh. Skipping this is not cosmetic: dt is recomputed from the new density
    // while the actual masses stay put, so dragging the slider upward walks the step
    // straight past the stability limit and the whole model goes to NaN.
    const ratio = this.buildDensity / materials.density;
    for (let i = 0; i < this.invMass.length; i++) this.invMass[i] = this.mesh.invMass[i] * ratio;
    this.roData.set(this.invMass, this.layout.off.invMass);
    this.device.queue.writeBuffer(this.ro, this.layout.off.invMass * 4, this.invMass);

    const K = boxStiffness(this.mesh.dx, this.mesh.dy, this.mesh.dz, materials.E, materials.nu);
    this.roData.set(K, this.layout.off.K);
    this.device.queue.writeBuffer(this.ro, this.layout.off.K * 4, K);
    this.dt = this.criticalStep(K) * this.world.safety;
    this.writeParams();
  }

  updateLoad(charge: Charge): void {
    this.charge = charge;
    const load = buildNodeLoads(this.mesh, charge);
    this.roData.set(load.dir, this.layout.off.loadDir);
    this.roData.set(load.pulse, this.layout.off.loadPulse);
    this.device.queue.writeBuffer(this.ro, this.layout.off.loadDir * 4, load.dir);
    this.device.queue.writeBuffer(this.ro, this.layout.off.loadPulse * 4, load.pulse);
  }

  /**
   * Back to an undamaged wall, standing under its own weight, at rest.
   *
   * The undeformed mesh is not equilibrium: switch gravity on at t = 0 and the wall
   * starts oscillating about its settled position, and since the blast arrives a few
   * milliseconds later — comparable to the wall's own fundamental period — it would
   * arrive while the wall is still ringing from being stood up. It also matters for
   * strength, because joint shear capacity is c + σ·tanφ and the σ in that expression is
   * self-weight: about 50 kPa at the base of a 2.7 m wall, worth ~9 % of the shear
   * capacity, which ought to be present and steady rather than vibrating.
   *
   * So relax first: the same explicit kernels, heavily damped, with the blast switched
   * off, until the motion dies. Dynamic relaxation reaches the same static state as an
   * implicit solve here, using machinery that already exists, because at self-weight the
   * joints are all in compression and nothing has cracked — there is no softening for a
   * Newton method to be needed for.
   */
  reset(settle = true): void {
    const L = this.layout;
    const rw = new Float32Array(L.rwSize);
    rw.set(this.mesh.x0, L.off.x);
    for (let e = 0; e < L.e; e++) rw[L.off.quat + e * 4 + 3] = 1; // identity rotation
    this.device.queue.writeBuffer(this.rw, 0, rw);
    this.time = 0;
    // Settling is thousands of steps, so it is not run while a geometry slider is being
    // dragged — a rebuild lands every frame there. Firing the charge settles first.
    if (!settle) return;

    this.settle();

    // Keep where the wall settled to; drop the velocity, the clock and the trace, so the
    // event starts from rest at t = 0. writeBuffer is ordered against the submit above.
    this.device.queue.writeBuffer(this.rw, L.off.vel * 4, new Float32Array(L.n * 3));
    this.device.queue.writeBuffer(this.rw, L.off.clock * 4, new Float32Array(4));
    this.device.queue.writeBuffer(this.rw, L.off.trace * 4, new Float32Array(TRACE_SAMPLES * 2));
    // encodeSteps advanced the mirror clock through the relaxation run; the GPU's own
    // clock was just zeroed, and these two have to agree or the shock sphere is drawn
    // for a time the solver is not at.
    this.time = 0;
  }

  private writeParams(relax = false): void {
    const f = this.paramF32;
    const u = this.paramU32;
    const m = this.materials;
    f[0] = this.dt;
    f[1] = this.world.gravity;
    // Relaxation runs heavily damped with the blast switched off: a viscous crawl down
    // to static equilibrium, using the same kernels rather than a second solver.
    f[2] = relax ? this.relax().damping : m.damping;
    f[17] = relax ? 0 : 1;
    f[3] = m.dif;
    f[4] = m.kn;
    f[5] = m.ks;
    f[6] = m.ft;
    f[7] = m.gf;
    f[8] = m.cohesion;
    f[9] = m.tanPhi;
    f[10] = m.fc;
    f[11] = this.mesh.spec.joint;
    f[12] = this.world.groundOmega;
    f[13] = this.world.groundFriction;
    f[14] = this.mesh.dx;
    f[15] = this.mesh.dy;
    f[16] = this.mesh.dz;
    u[20] = this.layout.n;
    u[21] = this.layout.e;
    u[22] = this.layout.p;
    u[23] = this.layout.u;
    OFFSET_FIELDS.forEach((name, i) => {
      u[24 + i] = this.layout.off[name];
    });
    const tail = 24 + OFFSET_FIELDS.length;
    u[tail] = this.probeNode;
    // Aim the trace at roughly a full ring over the length of a blast event, so the
    // curve is dense without the recording kernel running every single step. Guarded
    // because the tests evaluate forces with dt = 0, which would otherwise land a
    // non-finite stride in a Uint32Array — silently zero, and a modulo by zero in WGSL.
    const stride = Math.round(0.35 / this.dt / TRACE_SAMPLES);
    u[tail + 1] = Number.isFinite(stride) ? Math.max(1, stride) : 1;
    u[tail + 2] = TRACE_SAMPLES;
    this.device.queue.writeBuffer(this.params, 0, this.paramBytes);
  }

  /** Advance the simulation by `count` steps inside one compute pass. */
  encodeSteps(encoder: GPUCommandEncoder, count: number): void {
    if (count <= 0) return;
    const pass = encoder.beginComputePass({ label: 'sim' });
    pass.setBindGroup(0, this.bindGroup);
    const eg = groups(this.layout.e);
    const pg = groups(this.layout.p);
    const ng = groups(this.layout.n);
    for (let i = 0; i < count; i++) {
      pass.setPipeline(this.pipelines.elementForces);
      pass.dispatchWorkgroups(eg);
      pass.setPipeline(this.pipelines.jointForces);
      pass.dispatchWorkgroups(pg);
      pass.setPipeline(this.pipelines.integrate);
      pass.dispatchWorkgroups(ng);
      pass.setPipeline(this.pipelines.advanceClock);
      pass.dispatchWorkgroups(1);
    }
    pass.end();
    this.time += count * this.dt;
  }

  /** Refresh the per-unit centroids the renderer shrinks bricks around. */
  encodeCentroids(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass({ label: 'centroids' });
    pass.setBindGroup(0, this.bindGroup);
    pass.setPipeline(this.pipelines.unitCentroids);
    pass.dispatchWorkgroups(groups(this.layout.u));
    pass.end();
  }

  /**
   * Read back the joint damage and node speeds so the HUD can report real numbers.
   *
   * Called a few times a second, not every frame: it is the only place the CPU looks at
   * the solver's state, and "34 % of joints cracked" is worth one small copy.
   */
  async readStats(): Promise<Stats | null> {
    if (this.statsPending) return null;
    this.statsPending = true;
    const L = this.layout;
    const damageBytes = L.p * 4;
    const scalarBytes = L.n * 2 * 4;
    const clockBytes = 16;
    const traceBytes = TRACE_SAMPLES * 2 * 4;
    if (!this.staging) {
      this.staging = this.device.createBuffer({
        label: 'stats staging',
        size: damageBytes + scalarBytes + clockBytes + traceBytes,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.rw, L.off.pairDamage * 4, this.staging, 0, damageBytes);
    encoder.copyBufferToBuffer(this.rw, L.off.nodeScalar * 4, this.staging, damageBytes, scalarBytes);
    encoder.copyBufferToBuffer(this.rw, L.off.clock * 4, this.staging, damageBytes + scalarBytes, clockBytes);
    encoder.copyBufferToBuffer(
      this.rw,
      L.off.trace * 4,
      this.staging,
      damageBytes + scalarBytes + clockBytes,
      traceBytes,
    );
    this.device.queue.submit([encoder.finish()]);
    try {
      await this.staging.mapAsync(GPUMapMode.READ);
      const view = new Float32Array(this.staging.getMappedRange().slice(0));
      this.staging.unmap();
      let cracked = 0;
      for (let i = 0; i < L.p; i++) if (view[i] > 0.999) cracked++;
      let maxSpeed = 0;
      let flying = 0;
      const base = L.p;
      for (let i = 0; i < L.n; i++) {
        const s = view[base + i * 2 + 1];
        if (s > maxSpeed) maxSpeed = s;
        if (s > 0.5) flying++;
      }
      // The trace ring: (t, d) pairs the solver wrote on its own clock.
      const traceBase = L.p + L.n * 2 + 4;
      const samples = Math.min(view[L.p + L.n * 2 + 2] | 0, TRACE_SAMPLES);
      return {
        cracked: cracked / Math.max(L.p, 1),
        maxSpeed,
        flying: flying / Math.max(L.n, 1),
        trace: view.subarray(traceBase, traceBase + samples * 2),
      };
    } catch {
      return null;
    } finally {
      this.statsPending = false;
    }
  }

  /**
   * Run `count` steps now, optionally with a different time step.
   *
   * `dt = 0` evaluates forces without moving anything, which is how the self-test reads a
   * joint's traction–separation curve: put the bricks where you want them, step once,
   * read the force back.
   */
  run(count: number, dtOverride?: number): void {
    const saved = this.dt;
    if (dtOverride !== undefined) {
      this.dt = dtOverride;
      this.writeParams();
    }
    const encoder = this.device.createCommandEncoder({ label: 'run' });
    this.encodeSteps(encoder, count);
    this.device.queue.submit([encoder.finish()]);
    if (dtOverride !== undefined) {
      this.dt = saved;
      this.writeParams();
    }
  }

  /**
   * One batch of self-weight relaxation: viscously damped stepping with the blast off,
   * ending at rest.
   *
   * This gets the wall most of the way to equilibrium and no further — see the note on
   * `relaxSchedule` for why, and what it would take to close the gap.
   */
  settle(): void {
    this.writeParams(true);
    const encoder = this.device.createCommandEncoder({ label: 'settle' });
    this.encodeSteps(encoder, this.relax().steps);
    this.device.queue.submit([encoder.finish()]);
    this.writeParams();
    this.device.queue.writeBuffer(
      this.rw,
      this.layout.off.vel * 4,
      new Float32Array(this.layout.n * 3),
    );
  }

  /** Damping, duration and reset interval for the self-weight relaxation run. */
  private relax(): { damping: number; steps: number } {
    return relaxSchedule(
      this.mesh.lattice.height,
      this.mesh.lattice.wall * this.mesh.dz,
      this.materials.E,
      this.materials.density,
      this.dt,
    );
  }

  /** Overwrite one named region of the read-write arena. */
  writeRegion(name: string, data: F32): void {
    this.device.queue.writeBuffer(this.rw, this.layout.off[name] * 4, data);
  }

  /** Read one named region of the read-write arena back to the CPU. */
  async readRegion(name: string, floats: number): Promise<Float32Array> {
    const bytes = floats * 4;
    const staging = this.device.createBuffer({
      label: `read ${name}`,
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.rw, this.layout.off[name] * 4, staging, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    return out;
  }

  destroy(): void {
    this.staging?.destroy();
    this.params.destroy();
    this.u32.destroy();
    this.ro.destroy();
    this.rw.destroy();
  }

  /** Push the read-only arena after a constructor-time edit. */
  flushReadOnly(): void {
    this.device.queue.writeBuffer(this.ro, 0, this.roData);
  }
}

/**
 * Where to put the displacement gauge: the middle of the loaded face.
 *
 * A real blast test puts a transducer at mid-span, because that is where a one-way
 * spanning panel moves most and where the textbook single-degree-of-freedom solution
 * applies. Taking a maximum over the whole façade instead would track whichever brick
 * happens to be flying fastest, which is a different and much less readable quantity.
 */
function findProbeNode(mesh: Mesh): number {
  const targetX = mesh.lattice.length / 2;
  const targetY = mesh.lattice.height / 2;
  let best = 0;
  let bestD = Infinity;
  for (let n = 0; n < mesh.nodeCount; n++) {
    if (mesh.x0[n * 3 + 2] > 1e-6) continue; // the outer face of the loaded wall
    const d = Math.hypot(mesh.x0[n * 3] - targetX, mesh.x0[n * 3 + 1] - targetY);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * How long to relax for, and how hard to damp, from an estimate of the wall's own
 * fundamental frequency.
 *
 * A fixed per-step damping fraction is the obvious thing and the wrong one: on a tall
 * wall it lands at ten-plus times critical, and an over-damped structure does not settle
 * quickly, it CREEPS. The first version left a 2 m wall six percent short of carrying its
 * own weight — visibly nothing, but the equilibrium check caught it.
 *
 * So aim at critical damping for the first mode, α = 2ω₁, and run for a few periods of
 * it. ω₁ is the cantilever estimate 3.516/H² · √(EI/m̄), which for a wall of thickness t
 * reduces to 3.516/H² · t·√(E/12ρ). A wall held top and bottom is stiffer than that, so
 * the estimate errs toward relaxing for too long, which is the harmless direction.
 *
 * ponytail: this reaches about 85 % of exact equilibrium and then stops improving. The
 * remainder is a standing wave in the stiff axial modes that carry the self-weight:
 * mass-proportional damping gives ζ = α/2ω, so it barely touches them, and turning α up
 * far enough to catch them either exceeds the stability limit or makes the low modes
 * creep instead. The textbook answer is kinetic damping — dump the velocity each time the
 * kinetic energy peaks — which kills every mode regardless of frequency. Resetting at a
 * FIXED interval instead was tried and is worse than useless: at an arbitrary phase it
 * leaves the wall pinned at high potential energy, and at short intervals it diverges.
 * Doing it properly needs a kinetic-energy reduction on the GPU to find the peaks.
 */
function relaxSchedule(
  height: number,
  thickness: number,
  E: number,
  density: number,
  dt: number,
): { damping: number; steps: number } {
  const omega =
    (3.516 / Math.max(height * height, 1e-6)) * thickness * Math.sqrt(E / (12 * density));
  const w = Math.max(omega, 1);
  const period = (2 * Math.PI) / w;
  return {
    // Light viscous damping on top of the kinetic resets: enough to take the edge off the
    // fundamental, nowhere near enough to make it creep.
    damping: 2 * w,
    steps: Math.min(40000, Math.max(2000, Math.ceil((2.5 * period) / dt))),
  };
}

function groups(count: number): number {
  return Math.max(1, Math.ceil(count / 64));
}

function makeBuffer(device: GPUDevice, label: string, data: U32): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: Math.max(4, data.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}
