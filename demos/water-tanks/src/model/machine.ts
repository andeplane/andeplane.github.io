/**
 * The machine runs a scene: it keeps the input tanks at their set points while you play with
 * the sliders, then steps through the scene's phases (open these valves, wait until the water
 * settles) when you press Run. It knows nothing about rendering.
 */
import { Network, type Stop } from './network.ts';
import type { SceneDef } from './scenes.ts';

export type MachineState = 'preparing' | 'ready' | 'running' | 'done';

export interface Opening {
  link: string;
  stop?: Stop;
  /** Auxiliary links (make-up feeds, leaks) never hold a phase open. */
  aux?: boolean;
}

export interface PhaseDef {
  title: string;
  text: string;
  open: Opening[];
  /** A timed phase closes its valves after exactly this many seconds. */
  duration?: number;
}

export class Machine {
  readonly net: Network;
  state: MachineState = 'preparing';
  inputs: Record<string, number>;
  phase = -1;
  phaseTime = 0;
  private phases: PhaseDef[] = [];
  private current: Opening[] = [];
  timedClosed = false;
  /** Scratch value a scene may use for its own exact reference (e.g. ∫u dt). */
  aux = 0;
  aux2 = 0;
  /** Number of completed runs. */
  runs = 0;

  constructor(readonly scene: SceneDef) {
    this.net = new Network(scene.vessels, scene.links);
    this.inputs = Object.fromEntries(scene.inputs.map((i) => [i.key, i.value]));
    scene.configure?.(this.net, this.inputs);
    this.prepare();
  }

  setInput(key: string, value: number): void {
    this.inputs[key] = value;
    this.scene.configure?.(this.net, this.inputs);
    const def = this.scene.inputs.find((i) => i.key === key);
    if (def?.live && this.state === 'running') return;
    if (this.state !== 'running') this.prepare();
  }

  /** Open the set-up valves: fill inputs to their set points, empty the outputs. */
  prepare(): void {
    this.net.closeAll();
    this.phase = -1;
    this.state = 'preparing';
    this.current = this.scene.prepare(this.inputs);
    for (const o of this.current) this.net.open(o.link, o.stop);
  }

  run(): void {
    this.phases = this.scene.phases(this.inputs);
    this.aux = 0;
    this.aux2 = 0;
    // Make sure the set-up is finished first; phase -1 is the preparation.
    if (this.state !== 'preparing') this.prepare();
    this.state = 'running';
    this.phase = -1;
    this.phaseTime = 0;
  }

  reset(): void {
    this.prepare();
  }

  get phaseDef(): PhaseDef | undefined {
    return this.phase >= 0 ? this.phases[this.phase] : undefined;
  }

  private settled(): boolean {
    if (this.net.hasInflight()) return false;
    const pd = this.phaseDef;
    if (pd?.duration !== undefined && !this.timedClosed) return false;
    for (const o of this.current) {
      if (o.aux) continue;
      const l = this.net.link(o.link);
      if (l.open && !l.done) return false;
    }
    return true;
  }

  private enter(i: number): void {
    this.net.closeAll();
    this.phase = i;
    this.phaseTime = 0;
    this.timedClosed = false;
    if (i >= this.phases.length) {
      this.state = 'done';
      this.current = [];
      this.runs++;
      return;
    }
    this.current = this.phases[i].open;
    for (const o of this.current) this.net.open(o.link, o.stop);
  }

  /** Advance the hydraulics by dt seconds, splitting exactly at timer boundaries. */
  advance(dt: number): void {
    let left = dt;
    let guard = 0;
    while (left > 1e-12 && guard++ < 64) {
      const pd = this.state === 'running' ? this.phaseDef : undefined;
      let h = left;
      if (pd?.duration !== undefined && !this.timedClosed) {
        h = Math.min(h, pd.duration - this.phaseTime);
      }
      if (h > 0) {
        this.net.step(h, (sub) => this.scene.track?.(this, sub));
        this.phaseTime += h;
        left -= h;
      }
      if (pd?.duration !== undefined && !this.timedClosed && this.phaseTime >= pd.duration - 1e-12) {
        this.net.closeAll();
        this.timedClosed = true;
      }
      if (this.state === 'preparing' && this.settled()) {
        this.state = 'ready';
      } else if (this.state === 'running' && this.settled()) {
        this.enter(this.phase + 1);
      }
    }
  }

  reading(): number {
    const r = this.scene.result;
    return this.net.vessel(r.vessel).V / r.unit;
  }

  exact(): number {
    return this.scene.exact(this.inputs, this);
  }
}
