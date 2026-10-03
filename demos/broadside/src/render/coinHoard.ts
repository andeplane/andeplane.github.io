import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Progress } from "../game/progress";
import { worldGold } from "../game/rewards";
import { GOLD_AREAS, COIN_POSE_STRIDE, COIN_RADIUS, COIN_THICKNESS } from "../game/goldAreas";
import { loadGoldLayout, saveGoldLayout } from "../game/goldLayout";
import { caveFloor } from "../input/caveLayout";
import { doubloonMaterial, doubloonMesh } from "./coin";

interface Bank {
  mesh: Mesh; proxy: Mesh; count: number; loaded: number;
  poses: Float32Array; matrices: Float32Array; heights: Map<string, number>;
  peak: number; basePeak: number; version: number; depositFrom: number;
  requested: boolean; depositing: boolean; ready: boolean; spawned: number; resting: number;
  worker: Worker | null; previousFrame: Float32Array; frameAge: number;
  frameUploaded: boolean;
}
const GRID = .22;
export class CoinHoard {
  private banks: Bank[];
  private scale = Vector3.One();
  private rotation = Quaternion.Identity();
  private lastRotation = Quaternion.Identity();
  private position = Vector3.Zero();
  private matrix = Matrix.Identity();
  constructor(scene: Scene, private persistent = true, private changed: () => void = () => {}) {
    const material = doubloonMaterial(scene);
    this.banks = GOLD_AREAS.map((area) => {
      const mesh = doubloonMesh(scene, `${area.name} settled gold coins`);
      mesh.material = material; mesh.position.set(area.x, 0, area.z); mesh.isPickable = false; mesh.setEnabled(false);
      const proxy = MeshBuilder.CreateSphere(`${area.name} gold bank inspection`, { diameter: 2, segments: 12 }, scene);
      proxy.visibility = 0; proxy.metadata = { relicIndex: 0, goldWorld: area.world }; proxy.setEnabled(false);
      return { mesh, proxy, count: 0, loaded: 0, poses: new Float32Array(), matrices: new Float32Array(), heights: new Map(), peak: 0, basePeak: 0, version: 0, depositFrom: 0, requested: false, depositing: false, ready: false, spawned: 0, resting: 0, worker: null, previousFrame: new Float32Array(), frameAge: 0, frameUploaded: false };
    });
  }
  refresh(progress: Progress, depositWorld: number | null = null): void {
    this.banks.forEach((bank, world) => {
      const count = worldGold(progress, world);
      if (count === bank.count) return;
      // Keep the in-memory settled bank too: private browsing may block the cache.
      const carry = depositWorld === world && bank.ready && !bank.worker && bank.loaded === count - 1000
        ? bank.poses.slice() : null;
      const version = ++bank.version;
      bank.worker?.terminate(); bank.worker = null;
      bank.count = count; bank.depositing = depositWorld === world; bank.ready = false; bank.requested = false; bank.spawned = 0;
      bank.depositFrom = bank.depositing ? count - 1000 : count;
      if (!count) { bank.mesh.setEnabled(false); bank.proxy.setEnabled(false); bank.loaded = 0; bank.heights.clear(); return; }
      void (carry ? Promise.resolve(carry) : loadGoldLayout(world, bank.depositFrom, this.persistent)).then((poses) => {
        if (version !== bank.version) return;
        bank.poses = new Float32Array(count * COIN_POSE_STRIDE); bank.poses.set(poses);
        bank.loaded = count; bank.matrices = new Float32Array(count * 16);
        const colors = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          if (i < bank.depositFrom) this.compose(bank, i);
          const shade = .72 + ((i * .6180339) % 1) * .28;
          colors.set([shade, shade * .97, shade * .91, 1], i * 4);
        }
        bank.mesh.thinInstanceSetBuffer("matrix", bank.matrices, 16, !bank.depositing);
        bank.mesh.thinInstanceSetBuffer("color", colors, 4, true);
        bank.mesh.thinInstanceCount = bank.depositFrom;
        bank.mesh.setEnabled(bank.depositFrom > 0);
        this.rebuildHeight(bank, world, bank.depositFrom);
        bank.basePeak = bank.peak; bank.ready = true;
        this.changed();
        if (bank.requested) this.runPhysics(bank, world);
      }).catch((error) => console.error("Gold bank:", error));
    });
  }
  private rebuildHeight(bank: Bank, world: number, count: number): void {
    const area = GOLD_AREAS[world]!, poses = bank.poses;
    bank.peak = 0; bank.heights.clear();
    for (let i = 0; i < count; i++) {
      const p = i * COIN_POSE_STRIDE, x = poses[p]!, y = poses[p + 1]!, z = poses[p + 2]!;
      const normalY = 1 - 2 * (poses[p + 3]! ** 2 + poses[p + 5]! ** 2);
      const top = y + Math.sqrt(Math.max(0, 1 - normalY * normalY)) * COIN_RADIUS + Math.abs(normalY) * COIN_THICKNESS / 2;
      bank.peak = Math.max(bank.peak, top);
      const gx = Math.round(x / GRID), gz = Math.round(z / GRID);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const key = `${gx + dx}:${gz + dz}`;
        bank.heights.set(key, Math.max(bank.heights.get(key) ?? -1, top));
      }
    }
    bank.proxy.position.set(area.x, bank.peak * .45, area.z);
    bank.proxy.scaling.set(area.radius, Math.max(.45, bank.peak * .55), area.radius);
    bank.proxy.setEnabled(count > 0);
    if (count) bank.mesh.thinInstanceRefreshBoundingInfo();
  }
  startPour(world: number): void {
    const bank = this.banks[world]!;
    if (!bank.depositing || bank.worker) return;
    bank.requested = true;
    if (bank.ready) this.runPhysics(bank, world);
  }
  private runPhysics(bank: Bank, world: number): void {
    if (bank.worker || !bank.depositing) return;
    const worker = new Worker(new URL("../game/goldPhysics.worker.ts", import.meta.url), { type: "module" });
    bank.worker = worker; bank.mesh.alwaysSelectAsActiveMesh = true;
    const finish = async () => {
      bank.depositing = false; bank.requested = false;
      bank.mesh.thinInstanceCount = bank.count;
      for (let i = bank.depositFrom; i < bank.count; i++) this.compose(bank, i);
      // A static GPU instance buffer: no per-frame updates once the coins rest.
      bank.mesh.thinInstanceSetBuffer("matrix", bank.matrices, 16, true);
      bank.mesh.alwaysSelectAsActiveMesh = false;
      this.rebuildHeight(bank, world, bank.count);
      this.changed();
      await saveGoldLayout(world, bank.poses, this.persistent);
    };
    const fail = () => {
      if (bank.worker !== worker) return;
      worker.terminate(); bank.worker = null;
      // Offline physics poses also make the collection available if a worker cannot start.
      void loadGoldLayout(world, bank.count, this.persistent).then(poses => {bank.poses = poses; return finish();}).catch(console.error);
    };
    worker.onerror = fail;
    worker.onmessage = (event: MessageEvent<{ poses: Float32Array; done: boolean; resting: number; error?: string }>) => {
      if (bank.worker !== worker) return;
      if (event.data.error) { console.error(event.data.error); fail(); return; }
      const { poses, done, resting } = event.data;
      bank.resting = resting;
      bank.previousFrame = bank.poses.slice(bank.depositFrom * COIN_POSE_STRIDE, (bank.depositFrom + bank.spawned) * COIN_POSE_STRIDE);
      bank.poses.set(poses, bank.depositFrom * COIN_POSE_STRIDE);
      bank.spawned = poses.length / COIN_POSE_STRIDE; bank.frameAge = 0; bank.frameUploaded = false;
      bank.mesh.setEnabled(true); bank.mesh.thinInstanceCount = bank.depositFrom + bank.spawned;
      if (done) {
        worker.terminate(); bank.worker = null;
        void finish().catch(error => console.error("Saving gold bank:", error));
      }
    };
    worker.postMessage({world, previous: bank.poses.slice(0, bank.depositFrom * COIN_POSE_STRIDE)});
  }
  private compose(bank: Bank, coin: number, blend = 1): void {
    const i = coin * COIN_POSE_STRIDE, p = bank.poses, old = bank.previousFrame, j = (coin - bank.depositFrom) * COIN_POSE_STRIDE;
    this.position.set(p[i]!, p[i + 1]!, p[i + 2]!);
    this.rotation.set(p[i + 3]!, p[i + 4]!, p[i + 5]!, p[i + 6]!);
    if (blend < 1 && j >= 0 && j + COIN_POSE_STRIDE <= old.length) {
      this.position.set(old[j]! + (p[i]! - old[j]!) * blend, old[j + 1]! + (p[i + 1]! - old[j + 1]!) * blend, old[j + 2]! + (p[i + 2]! - old[j + 2]!) * blend);
      this.lastRotation.set(old[j + 3]!,old[j + 4]!,old[j + 5]!,old[j + 6]!);
      Quaternion.SlerpToRef(this.lastRotation,this.rotation,blend,this.rotation);
    }
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.matrix);
    this.matrix.copyToArray(bank.matrices, coin * 16);
  }
  animate(dt: number, _reduced = false): void {
    for (const bank of this.banks) {
      if (!bank.worker || bank.frameUploaded) continue;
      bank.frameAge += dt;
      const blend = Math.min(1, bank.frameAge * 30);
      for (let i = bank.depositFrom; i < bank.depositFrom + bank.spawned; i++) this.compose(bank, i, blend);
      // Earlier deposits never move. Upload only the new chest, even in a
      // 10,000-coin bank; leave its existing GPU matrices untouched.
      bank.mesh.thinInstancePartialBufferUpdate("matrix", bank.spawned, bank.depositFrom);
      bank.frameUploaded = blend === 1;
    }
  }
  /** Leaving the reward screen never loses its deposit; the worker finishes in the background. */
  finishPours(): void { this.banks.forEach((bank, world) => { if (bank.depositing) this.startPour(world); }); }
  pouring(world: number) { const bank = this.banks[world]!; return { ready: bank.ready, spawned: bank.spawned, done: !bank.depositing, chestY: bank.basePeak + 3, active: !!bank.worker }; }
  center(world: number): Vector3 { const a = GOLD_AREAS[world]!; return new Vector3(a.x, this.banks[world]!.peak * .45 + .2, a.z); }
  span(world: number) { return { height: Math.max(.8, this.banks[world]!.peak), width: GOLD_AREAS[world]!.radius * 2 }; }
  get counts(): number[] { return this.banks.map((b) => b.mesh.isEnabled() ? b.mesh.thinInstanceCount : 0); }
  get restingCounts(): number[] { return this.banks.map(b => b.depositing ? b.depositFrom + b.resting : b.loaded); }
  get physicsActive(): boolean { return this.banks.some(b => !!b.worker); }
  walkHeight(x: number, z: number): number {
    let height = caveFloor(x, z);
    this.banks.forEach((bank, world) => {
      const a = GOLD_AREAS[world]!, gx = Math.round((x - a.x) / GRID), gz = Math.round((z - a.z) / GRID);
      height = Math.max(height, bank.heights.get(`${gx}:${gz}`) ?? -1);
    });
    return height;
  }
}
