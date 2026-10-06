/** Scheduling is independent of rendering; repeated taps never replace an active pour. */
export class CoinDebugQueue {
  readonly totals = [0, 0, 0, 0];
  pending = 0;
  active: { world: number; started: number } | null = null;
  error: string | null = null;
  enqueue(world: number): boolean {
    if (!Number.isInteger(world) || world < 0 || world > 3 || this.error ||
      this.totals[world]! + (this.pending + (this.active ? 1 : 0) + 1) * 1000 > 100_000) return false;
    this.pending++;
    return true;
  }
  start(world: number, now: number): boolean {
    if (this.active || !this.pending || this.error) return false;
    this.pending--; this.active = { world, started: now }; return true;
  }
  /** Background time is excluded explicitly, rather than filtering slow frames. */
  pause(now: number): void { if (this.active && this.pausedAt === null) this.pausedAt = now; }
  resume(now: number): void {
    if (this.active && this.pausedAt !== null) this.active.started += now - this.pausedAt;
    this.pausedAt = null;
  }
  private pausedAt: number | null = null;
  complete(now: number): { world: number; coins: number; seconds: number } | null {
    if (!this.active) return null;
    this.resume(now);
    const {world, started} = this.active;
    this.totals[world]! += 1000; this.active = null;
    return {world, coins:this.totals[world]!, seconds:(now-started)/1000};
  }
  fail(message: string): void { this.error = message; this.pending = 0; this.active = null; }
  get busy(): boolean { return this.pending > 0 || this.active !== null; }
}

export function coinDebugLocation(params: URLSearchParams): 'cave' | 'ship' | null {
  return params.has('debugcoins') ? (params.get('debugcoins') === 'ship' ? 'ship' : 'cave') : null;
}

/** Frame interval includes CPU scheduling/worker contention, not just scene.render(). */
export class CoinFrameSamples {
  private intervals: number[] = [];
  private renders: number[] = [];
  add(interval: number, render: number): void {
    if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(render) || render < 0) return;
    this.intervals.push(interval); this.renders.push(render);
    if (this.intervals.length > 120) { this.intervals.shift(); this.renders.shift(); }
  }
  reset(): void { this.intervals = []; this.renders = []; }
  get values() {
    if (!this.intervals.length) return {fps:0,p95:0,render:0};
    const sorted=[...this.intervals].sort((a,b)=>a-b);
    return {fps:1000/(this.intervals.reduce((a,b)=>a+b,0)/this.intervals.length),
      p95:sorted[Math.ceil(sorted.length*.95)-1]!, render:this.renders.reduce((a,b)=>a+b,0)/this.renders.length};
  }
}
