import { IDLE_INTENT, type ShipIntent } from "../sim/ships";

export type Action = "turnLeft" | "turnRight" | "sailUp" | "sailDown" | "firePort" | "fireStarboard" | "fireBoth";

export const KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  turnLeft: ["KeyA", "ArrowLeft"],
  turnRight: ["KeyD", "ArrowRight"],
  sailUp: ["KeyW", "ArrowUp"],
  sailDown: ["KeyS", "ArrowDown"],
  firePort: ["KeyQ", "KeyJ"],
  fireStarboard: ["KeyE", "KeyK"],
  fireBoth: ["Space"],
};

/** Standard-mapping gamepad buttons. */
export const PAD_BUTTONS: Readonly<Partial<Record<Action, readonly number[]>>> = {
  sailUp: [3, 12], // Y / dpad up
  sailDown: [0, 13], // A / dpad down
  firePort: [4, 6], // LB / LT
  fireStarboard: [5, 7], // RB / RT
};

/** Minimal view of a gamepad, so tests don't need the DOM. */
export interface PadState {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

const STICK_DEADZONE = 0.2;

/** Turns keys, pad and touch into ship intents. Edge-triggered sail changes. */
export class Controls {
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<Action>();
  private padActions = new Set<Action>();
  private padTurn = 0;
  private held = new Set<Action>();
  private readonly edges = new Set<Action>();

  keyDown(code: string): boolean {
    const known = this.actionsForKey(code).length > 0;
    this.keys.add(code);
    this.refresh();
    return known;
  }

  keyUp(code: string): void {
    this.keys.delete(code);
    this.refresh();
  }

  /** On-screen touch buttons. */
  setVirtual(action: Action, down: boolean): void {
    if (down) this.virtual.add(action);
    else this.virtual.delete(action);
    this.refresh();
  }

  setPad(pad: PadState | null): void {
    this.padActions = new Set();
    this.padTurn = 0;
    if (pad) {
      for (const [action, buttons] of Object.entries(PAD_BUTTONS) as [Action, readonly number[]][]) {
        if (buttons.some((b) => pad.buttons[b]?.pressed)) this.padActions.add(action);
      }
      const x = pad.axes[0] ?? 0;
      this.padTurn = Math.abs(x) < STICK_DEADZONE ? 0 : x;
    }
    this.refresh();
  }

  /** Release everything, e.g. when the window loses focus. */
  clear(): void {
    this.keys.clear();
    this.virtual.clear();
    this.padActions.clear();
    this.padTurn = 0;
    this.refresh();
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  /** Read and consume this frame's intent. */
  readIntent(): ShipIntent {
    const left = this.held.has("turnLeft") ? 1 : 0;
    const right = this.held.has("turnRight") ? 1 : 0;
    const keyTurn = right - left;
    const both = this.held.has("fireBoth");
    const intent: ShipIntent = {
      ...IDLE_INTENT,
      turn: keyTurn !== 0 ? keyTurn : this.padTurn,
      sailUp: this.edges.has("sailUp"),
      sailDown: this.edges.has("sailDown"),
      firePort: both || this.held.has("firePort"),
      fireStarboard: both || this.held.has("fireStarboard"),
    };
    this.edges.clear();
    return intent;
  }

  private actionsForKey(code: string): Action[] {
    return (Object.keys(KEY_BINDINGS) as Action[]).filter((a) => KEY_BINDINGS[a].includes(code));
  }

  private refresh(): void {
    const next = new Set<Action>([...this.virtual, ...this.padActions]);
    for (const code of this.keys) for (const a of this.actionsForKey(code)) next.add(a);
    for (const a of next) if (!this.held.has(a)) this.edges.add(a);
    this.held = next;
  }
}
