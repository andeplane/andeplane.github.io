import { caveWalkable } from "./caveLayout";
export interface CaveObstacle {
  x: number;
  z: number;
  rx: number;
  rz: number;
  top: number;
}
export interface WalkIntent {
  forward: number;
  right: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
}
const KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
]);

/** Minecraft-style keys and an independent touch stick; movement never controls the ship. */
export class CaveWalkControls {
  private keys = new Set<string>();
  private touch = { forward: 0, right: 0 };
  private jumpQueued = false;
  private lastForward = -Infinity;
  private doubleSprint = false;
  keyDown(code: string, time: number): boolean {
    if (!KEYS.has(code)) return false;
    if (!this.keys.has(code)) {
      if (code === "Space") this.jumpQueued = true;
      if (code === "KeyW") {
        this.doubleSprint = time - this.lastForward < 280;
        this.lastForward = time;
      }
    }
    this.keys.add(code);
    return true;
  }
  keyUp(code: string): void {
    this.keys.delete(code);
    if (code === "KeyW") this.doubleSprint = false;
  }
  move(right: number, forward: number): void {
    const length = Math.max(1, Math.hypot(right, forward));
    this.touch = { right: right / length, forward: forward / length };
  }
  jump(): void {
    this.jumpQueued = true;
  }
  read(): WalkIntent {
    const down = (...keys: string[]) => keys.some((k) => this.keys.has(k));
    const intent = {
      forward:
        Number(down("KeyW", "ArrowUp")) -
        Number(down("KeyS", "ArrowDown")) +
        this.touch.forward,
      right:
        Number(down("KeyD", "ArrowRight")) -
        Number(down("KeyA", "ArrowLeft")) +
        this.touch.right,
      crouch: down("ShiftLeft", "ShiftRight"),
      sprint: this.doubleSprint || down("ControlLeft", "ControlRight"),
      jump: this.jumpQueued,
    };
    this.jumpQueued = false;
    return intent;
  }
  clear(): void {
    this.keys.clear();
    this.move(0, 0);
    this.jumpQueued = this.doubleSprint = false;
    this.lastForward = -Infinity;
  }
}

/** A small grounded character controller. Substeps stop sprinting through thin rocks. */
export class CaveWalker {
  x = 0;
  z = -10;
  feet = 0;
  yaw = 0;
  pitch = -0.06;
  verticalSpeed = 0;
  grounded = true;
  private eyeHeight = 1.7;
  private stride = 0;
  constructor(
    readonly obstacles: CaveObstacle[],
    private readonly floor: (x: number, z: number) => number,
    private readonly walkable = caveWalkable,
  ) {
    this.reset();
  }
  reset(): void {
    this.x = 0;
    this.z = -10;
    this.feet = this.floor(this.x, this.z);
    this.yaw = 0;
    this.pitch = -0.06;
    this.verticalSpeed = 0;
    this.grounded = true;
    this.eyeHeight = 1.7;
    this.stride = 0;
    this.resolve();
  }
  look(dx: number, dy: number): void {
    this.yaw = Math.atan2(
      Math.sin(this.yaw + dx * 0.003),
      Math.cos(this.yaw + dx * 0.003),
    );
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * 0.0028));
  }
  get eyeY(): number {
    return this.feet + this.eyeHeight;
  }
  get bob(): number {
    return this.grounded ? Math.sin(this.stride) * 0.022 : 0;
  }
  step(intent: WalkIntent, dt: number): void {
    const duration = Math.max(0, Math.min(0.1, dt));
    if (!duration) return;
    if (intent.jump && this.grounded) {
      this.verticalSpeed = 6.6;
      this.grounded = false;
    }
    const length = Math.max(1, Math.hypot(intent.forward, intent.right));
    const speed = intent.crouch ? 1.35 : intent.sprint ? 5.8 : 3.6;
    const f = intent.forward / length,
      r = intent.right / length;
    const dx = (Math.sin(this.yaw) * f + Math.cos(this.yaw) * r) * speed;
    const dz = (Math.cos(this.yaw) * f - Math.sin(this.yaw) * r) * speed;
    const steps = Math.max(1, Math.ceil(duration * 120)),
      h = duration / steps;
    for (let n = 0; n < steps; n++) {
      const previousX = this.x,
        previousZ = this.z;
      const nx = this.x + dx * h,
        nz = this.z + dz * h;
      if (this.walkable(nx, this.z)) this.x = nx;
      if (this.walkable(this.x, nz)) this.z = nz;
      this.resolve();
      if (!this.walkable(this.x, this.z)) {
        this.x = previousX;
        this.z = previousZ;
      }
      const ground = this.ground();
      if (this.grounded && Math.abs(this.feet - ground) <= 0.4) {
        this.feet = ground;
      } else {
        this.grounded = false;
        this.verticalSpeed -= 18 * h;
        this.feet += this.verticalSpeed * h;
        if (this.feet <= ground) {
          this.feet = ground;
          this.verticalSpeed = 0;
          this.grounded = true;
        }
      }
    }
    this.eyeHeight +=
      ((intent.crouch ? 1.18 : 1.7) - this.eyeHeight) *
      Math.min(1, duration * 14);
    this.stride += Math.hypot(dx, dz) * duration * 2.6;
  }
  private ground(): number {
    let height = this.floor(this.x, this.z);
    for (const o of this.obstacles)
      if (
        ((this.x - o.x) / o.rx) ** 2 + ((this.z - o.z) / o.rz) ** 2 < 1 &&
        o.top <= this.feet + 0.4
      )
        height = Math.max(height, o.top);
    return height;
  }
  private resolve(): void {
    for (let pass = 0; pass < 3; pass++) {
      for (const o of this.obstacles) {
        if (o.top <= this.feet + 0.4) continue;
        const rx = o.rx + 0.32,
          rz = o.rz + 0.32;
        const dx = (this.x - o.x) / rx,
          dz = (this.z - o.z) / rz;
        const d = Math.hypot(dx, dz);
        if (d >= 1) continue;
        this.x = o.x + (d > 0.0001 ? dx / d : 1) * rx;
        this.z = o.z + (d > 0.0001 ? dz / d : 0) * rz;
      }
    }
  }
}
