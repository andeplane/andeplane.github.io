import { Engine } from "@babylonjs/core/Engines/engine.js";
import "@babylonjs/core/Culling/ray.js";
import { TreasureCave } from "../render/cave";
import { configureTextureQuality, displayRenderScale } from "../render/quality";
import { CaveWalkControls } from "../input/caveWalk";
import { CaveGesture } from "../input/caveGesture";
import { readProgress } from "../game/progress";
import { OPERATORS, bankGold, goldTotal, type MathProgress } from "./academy";

/** The same textured, walkable Broadside cave, with an independent math bank. */
export class GoldCave {
  private readonly engine: Engine;
  private readonly cave: TreasureCave;
  private readonly controls = new CaveWalkControls();
  private readonly gesture = new CaveGesture();
  // No storage argument: never read the sailing game's progress.
  private readonly collection = readProgress();
  private active = false;
  private reward = false;
  private rewardGold = 0;
  private reported = false;
  private padPointer: number | null = null;
  private hudAge = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onReady: () => void, persistent = true) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
    configureTextureQuality(this.engine);
    this.cave = new TreasureCave(this.engine, persistent, "captain-calculus.coin-poses", OPERATORS.map((o) => o.name));
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.visualViewport?.addEventListener("resize", () => this.resize());
    document.addEventListener("keydown", (event) => {
      if (!this.active || this.reward || event.metaKey || event.altKey) return;
      if (this.controls.keyDown(event.code, performance.now())) event.preventDefault();
      if (event.code === "KeyE") this.inspect();
    });
    document.addEventListener("keyup", (event) => this.controls.keyUp(event.code));
    window.addEventListener("blur", () => this.clearControls());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.clearControls(); });

    canvas.addEventListener("pointerdown", (event) => {
      if (!this.active || this.reward) return;
      this.gesture.down(event.pointerId, event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.active || this.reward) return;
      if (document.pointerLockElement === canvas) {
        this.cave.look(event.movementX, event.movementY); return;
      }
      const action = this.gesture.move(event.pointerId, event.clientX, event.clientY);
      if (action?.type === "look") this.cave.look(action.dx, action.dy);
      if (action?.type === "pinch") this.cave.pinch(action.ratio);
    });
    canvas.addEventListener("pointerup", (event) => {
      const action = this.gesture.up(event.pointerId, event.clientX, event.clientY);
      if (!this.active || this.reward || action?.type !== "tap") return;
      const rect = canvas.getBoundingClientRect();
      const selected = this.cave.pick(action.x - rect.left, action.y - rect.top);
      if (selected !== null) this.cave.select(selected);
      else if (event.pointerType === "mouse" && !this.cave.inspecting) {
        try { void canvas.requestPointerLock()?.catch(() => {}); } catch { /* Drag and arrow keys still work. */ }
      }
    });
    canvas.addEventListener("pointercancel", (event) => this.gesture.cancel(event.pointerId));
    canvas.addEventListener("wheel", (event) => {
      if (!this.active || this.reward) return;
      event.preventDefault(); this.cave.zoom(event.deltaY);
    }, { passive: false });

    document.addEventListener("pointerdown", (event) => {
      if (!this.active || this.reward) return;
      const target = event.target as HTMLElement;
      if (target.closest("#math-cave-jump")) { this.controls.jump(); event.preventDefault(); }
      const pad = target.closest<HTMLElement>("#math-cave-pad");
      if (!pad) return;
      this.padPointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      this.movePad(event.clientX, event.clientY);
      event.preventDefault();
    });
    document.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.padPointer) this.movePad(event.clientX, event.clientY);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.padPointer) return;
      this.padPointer = null; this.controls.move(0, 0); this.drawPad(0, 0);
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);

    this.engine.runRenderLoop(() => {
      if (!this.active || document.hidden) return;
      const dt = Math.min(.1, this.engine.getDeltaTime() / 1000);
      if (!this.reward) {
        const look = this.controls.readLook();
        this.cave.look(look.right * 500 * dt, look.down * 450 * dt);
        this.cave.walk(this.controls.read(), dt);
      }
      this.cave.render(dt, this.reward);
      if (this.reward && this.cave.depositComplete && !this.reported) {
        this.reported = true; this.onReady();
      }
      this.hudAge += dt;
      if (this.hudAge > .15) { this.updateHud(); this.hudAge = 0; }
      canvas.dataset.cavePosition = [this.cave.walker.x, this.cave.walker.eyeY, this.cave.walker.z].map((n) => n.toFixed(2)).join(",");
      canvas.dataset.coinCounts = this.cave.coinCounts.join(",");
      canvas.dataset.restingCoins = this.cave.restingCoinCounts.join(",");
      canvas.dataset.goldPhysics = String(this.cave.goldPhysicsActive);
      canvas.dataset.audio = "disabled";
    });
  }

  show(progress: MathProgress, reward: boolean): void {
    this.active = true; this.reward = reward; this.clearControls(); this.resize();
    const gold = goldTotal(progress), banks = bankGold(progress);
    if (reward && gold !== this.rewardGold) {
      this.rewardGold = gold; this.reported = false;
      this.cave.endReveal();
      const world = OPERATORS.findIndex((o) => o.id === progress.operator);
      this.cave.refresh(this.collection, world, banks);
      this.cave.beginReveal(0, world);
    } else if (!reward) {
      this.cave.endReveal();
      this.cave.refresh(this.collection, null, banks);
      this.cave.enter();
    } else if (this.reported) queueMicrotask(this.onReady);
  }
  pause(): void {
    this.active = false; this.clearControls();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  resetCamera(): void { this.cave.enter(); }
  inspect(): void {
    if (this.cave.inspecting) this.cave.overview();
    else { const nearby = this.cave.nearby; if (nearby !== null) this.cave.select(nearby); }
    this.updateHud();
  }
  private clearControls(): void {
    this.controls.clear(); this.gesture.clear(); this.padPointer = null; this.drawPad(0, 0);
  }
  private resize(): void {
    this.engine.setHardwareScalingLevel(displayRenderScale(innerWidth, innerHeight, devicePixelRatio, this.engine.getCaps().maxTextureSize));
    this.engine.resize(); this.cave?.resize();
  }
  private movePad(x: number, y: number): void {
    const pad = document.querySelector<HTMLElement>("#math-cave-pad");
    if (!pad) return;
    const rect = pad.getBoundingClientRect(), radius = rect.width * .38;
    const right = (x - rect.left - rect.width / 2) / radius;
    const forward = (rect.top + rect.height / 2 - y) / radius;
    const length = Math.max(1, Math.hypot(right, forward));
    this.controls.move(right, forward); this.drawPad(right / length, -forward / length);
  }
  private drawPad(x: number, y: number): void {
    const thumb = document.querySelector<HTMLElement>("#math-cave-thumb");
    if (thumb) thumb.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
  }
  private updateHud(): void {
    const root = document.querySelector<HTMLElement>("#academy")!;
    root.dataset.caveView = this.cave.inspecting ? "inspect" : "walk";
    const room = document.querySelector<HTMLElement>("#math-cave-room");
    if (room) room.textContent = this.cave.room;
    const button = document.querySelector<HTMLButtonElement>("#math-cave-inspect");
    if (button) {
      button.disabled = !this.cave.inspecting && this.cave.nearby === null;
      button.textContent = this.cave.inspecting ? "Back to exploring" : "Inspect treasure";
    }
  }
}
