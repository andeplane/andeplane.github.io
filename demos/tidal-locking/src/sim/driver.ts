import type { SimParams } from '../physics/params.ts';
import type { Frame, FromWorker, ToWorker } from './protocol.ts';

/** Main-thread handle on the physics worker. */
export class SimDriver {
  private readonly worker: Worker;
  private latest: Frame | null = null;
  private onReady?: () => void;

  constructor(params: SimParams) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (message.type === 'frame') this.latest = message.frame;
      else if (message.type === 'ready') this.onReady?.();
    };
    this.send({ type: 'init', params });
  }

  /** The most recent snapshot, or null before the first one arrives. */
  get frame(): Frame | null {
    return this.latest;
  }

  ready(callback: () => void): void {
    this.onReady = callback;
  }

  reset(params: SimParams): void {
    this.latest = null;
    this.send({ type: 'reset', params });
  }

  setRunning(running: boolean): void {
    this.send({ type: 'running', running });
  }

  setSpeed(multiplier: number): void {
    this.send({ type: 'speed', multiplier });
  }

  setMaterial(stiffness: number, damping: number): void {
    this.send({ type: 'material', stiffness, damping });
  }

  private send(message: ToWorker): void {
    this.worker.postMessage(message);
  }
}
