/**
 * The lumped hydraulic model: the source of truth for every level in the demo.
 *
 * Vessels hold volumes. Links move volume from a vessel (or the endless supply main) to one
 * or more targets (a splitter divides the flow by fixed fractions). Each link has a flow law:
 *
 *   torricelli  q = a·√(2 g h)     an orifice at the bottom of the source vessel
 *   rate        q = q₀             a supply tap (optionally throttled by its float valve)
 *   linear      q = k·V            a capillary leak: laminar, so flow ∝ head
 *   match       q = q(other link)  a float-valve make-up that replaces exactly what leaves
 *
 * Water leaving a spout is not teleported: it falls, and arrives in the target after the
 * ballistic fall time from the spout to the target's surface. That in-flight water is kept
 * as packets, so the levels you see rise when the jet lands, and volume is conserved exactly:
 * every drop that leaves a source is accounted for in some target (or the sump).
 *
 * Float valves (stops) close a link exactly at a set volume: the last substep is clipped so
 * the target ends on the set point to rounding error. That, plus conservation, is why the
 * computed answers are exact rather than "close": the dynamics only decide *when* the
 * machine settles, never *where*.
 */
import { heightOf, type VesselSpec } from './vessel.ts';

/** Gravity in world units per s². The particle renderer uses the same value. */
export const G = 6;
/** Integration substep. */
export const SUBSTEP = 1 / 480;

export type Law =
  | { kind: 'torricelli'; area: number }
  | { kind: 'rate'; q: number; throttle?: number }
  | { kind: 'linear'; k: number }
  | { kind: 'match'; link: string };

export interface Spout {
  x: number;
  y: number;
  /** Unit direction of the emerging jet. */
  dx: number;
  dy: number;
  /** Jet width at the spout. Speed = q / width (continuity). */
  width: number;
}

export interface Target {
  to: string;
  frac: number;
}

export interface LinkSpec {
  id: string;
  /** Vessel id, or 'supply' for the mains. */
  from: string;
  targets: Target[];
  law: Law;
  spout: Spout;
  /** Pipe route for drawing, from the outlet to the spout. */
  path: [number, number][];
  /** Where along `path` (index) the valve sits; default 1. */
  valveAt?: number;
  /** Deliver with no fall delay (water enters below the surface, e.g. a make-up feed). */
  immediate?: boolean;
  /** Spread the jet into a flat sheet (for the knife-edge splitter). */
  sheet?: boolean;
}

export interface Stop {
  vessel: string;
  V: number;
  /** 'up': close when the vessel (counting water already falling into it) reaches V.
   *  'down': close when the vessel has drained down to V. */
  dir: 'up' | 'down';
}

export interface VesselState {
  spec: VesselSpec;
  V: number;
}

export interface LinkState {
  spec: LinkSpec;
  open: boolean;
  done: boolean;
  stop?: Stop;
  /** Flow during the last substep. */
  q: number;
  /** Volume emitted since the renderer last took it. */
  emitted: number;
  /** Volume moved during the current substep (for 'match'). */
  dv: number;
}

interface Packet {
  t: number;
  to: string;
  dv: number;
  link: string;
}

const EPS = 1e-12;

export class Network {
  t = 0;
  readonly vessels = new Map<string, VesselState>();
  readonly links = new Map<string, LinkState>();
  private packets: Packet[] = [];
  private order: LinkState[] = [];

  constructor(vessels: VesselSpec[], links: LinkSpec[]) {
    for (const v of vessels) this.vessels.set(v.id, { spec: v, V: v.infinite ? (v.restVolume ?? 0) : 0 });
    for (const l of links) {
      this.links.set(l.id, { spec: l, open: false, done: false, q: 0, emitted: 0, dv: 0 });
    }
    // 'match' links read the flow of another link in the same substep, so they go last.
    this.order = [...this.links.values()].sort(
      (a, b) => Number(a.spec.law.kind === 'match') - Number(b.spec.law.kind === 'match'),
    );
  }

  vessel(id: string): VesselState {
    const v = this.vessels.get(id);
    if (!v) throw new Error(`no vessel ${id}`);
    return v;
  }

  link(id: string): LinkState {
    const l = this.links.get(id);
    if (!l) throw new Error(`no link ${id}`);
    return l;
  }

  level(id: string): number {
    const v = this.vessel(id);
    return heightOf(v.spec.profile, v.V);
  }

  inflight(id?: string): number {
    let s = 0;
    for (const p of this.packets) if (id === undefined || p.to === id) s += p.dv;
    return s;
  }

  hasInflight(): boolean {
    return this.packets.some((p) => !this.isInfinite(p.to));
  }

  committed(id: string): number {
    return this.vessel(id).V + this.inflight(id);
  }

  open(id: string, stop?: Stop): void {
    const l = this.link(id);
    l.open = true;
    l.done = false;
    l.stop = stop;
  }

  close(id: string): void {
    const l = this.link(id);
    l.open = false;
    l.stop = undefined;
    l.q = 0;
  }

  closeAll(): void {
    for (const id of this.links.keys()) this.close(id);
  }

  setVolume(id: string, V: number): void {
    this.vessel(id).V = V;
  }

  private isInfinite(id: string): boolean {
    return id === 'sump' || this.vessels.get(id)?.spec.infinite === true;
  }

  /** Spout exit speed for a given flow. */
  static speed(spec: LinkSpec, q: number): number {
    return Math.max(0.35, q / spec.spout.width);
  }

  /** Fall time from the spout to a target's surface. */
  fallTime(spec: LinkSpec, q: number, to: string): number {
    const target = this.vessels.get(to);
    let yt = 0.4;
    if (target) yt = target.spec.y0 + heightOf(target.spec.profile, target.V);
    const v = Network.speed(spec, q);
    const vy = v * spec.spout.dy;
    const drop = spec.spout.y - yt;
    if (drop <= 0) return 0;
    return (vy + Math.sqrt(vy * vy + 2 * G * drop)) / G;
  }

  /** Advance by dt seconds. `onSubstep` sees every internal substep length. */
  step(dt: number, onSubstep?: (h: number) => void): void {
    let left = dt;
    while (left > 1e-15) {
      const h = Math.min(SUBSTEP, left);
      this.substep(h);
      onSubstep?.(h);
      left -= h;
    }
  }

  private substep(h: number): void {
    for (const l of this.order) {
      l.dv = 0;
      l.q = 0;
      if (!l.open) continue;
      // `done` means "currently satisfied": the source is empty or the float valve is shut.
      // It is re-evaluated every substep, so a valve reopens if its vessel is disturbed.
      l.done = false;
      const s = l.spec;
      const src = s.from === 'supply' ? undefined : this.vessel(s.from);
      let roomUp = Infinity;
      let upFrac = 1;
      if (l.stop && l.stop.dir === 'up') {
        roomUp = l.stop.V - this.committed(l.stop.vessel);
        const t = s.targets.find((x) => x.to === l.stop!.vessel);
        upFrac = t ? t.frac : 1;
        if (roomUp <= EPS) {
          l.done = true;
          continue;
        }
      }
      let avail = Infinity;
      if (src && !src.spec.infinite) {
        avail = src.V;
        if (l.stop && l.stop.dir === 'down' && l.stop.vessel === s.from) avail = src.V - l.stop.V;
        if (avail <= EPS) {
          l.done = s.law.kind !== 'linear';
          continue;
        }
      }
      let q = 0;
      switch (s.law.kind) {
        case 'torricelli': {
          const head = src ? heightOf(src.spec.profile, src.V) : 0;
          q = s.law.area * Math.sqrt(2 * G * Math.max(0, head));
          break;
        }
        case 'rate': {
          q = s.law.q;
          if (s.law.throttle && roomUp < Infinity) {
            q *= Math.min(1, Math.max(0.1, roomUp / upFrac / s.law.throttle));
          }
          break;
        }
        case 'linear':
          q = s.law.k * (src ? src.V : 0);
          break;
        case 'match':
          q = this.link(s.law.link).dv / h;
          break;
      }
      let dv = q * h;
      if (dv <= 0) continue;
      let closesUp = false;
      if (roomUp < Infinity && dv * upFrac >= roomUp - EPS) {
        dv = roomUp / upFrac;
        closesUp = true;
      }
      if (src && !src.spec.infinite) {
        if (dv >= avail - EPS && s.law.kind !== 'linear') {
          // Finite-time emptying (Torricelli) or reaching the drain set point: land exactly.
          dv = avail;
          src.V = l.stop?.dir === 'down' ? l.stop.V : 0;
          l.done = true;
        } else {
          src.V -= Math.min(dv, avail);
        }
      }
      if (closesUp) l.done = true;
      l.dv = dv;
      l.q = dv / h;
      l.emitted += dv;
      for (const tg of s.targets) {
        const part = dv * tg.frac;
        if (part <= 0 || this.isInfinite(tg.to)) continue;
        if (s.immediate) {
          this.vessel(tg.to).V += part;
          continue;
        }
        const arrive = this.t + h + this.fallTime(s, q, tg.to);
        const last = this.lastPacket(s.id, tg.to);
        if (last && Math.abs(last.t - arrive) < 1 / 120) last.dv += part;
        else this.packets.push({ t: arrive, to: tg.to, dv: part, link: s.id });
      }
      // A float valve that has just shut leaves its vessel exactly on the set point.
      if (closesUp && l.stop) {
        const err = l.stop.V - this.committed(l.stop.vessel);
        const last = this.lastPacket(s.id, l.stop.vessel);
        if (last) last.dv += err;
        else this.vessel(l.stop.vessel).V += err;
      }
    }
    this.t += h;
    if (this.packets.length) {
      const keep: Packet[] = [];
      for (const p of this.packets) {
        if (p.t <= this.t + 1e-12) this.vessel(p.to).V += p.dv;
        else keep.push(p);
      }
      this.packets = keep;
    }
  }

  private lastPacket(link: string, to: string): Packet | undefined {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      if (p.link === link && p.to === to) return p;
    }
    return undefined;
  }

  /** Take the volume each link has emitted since the last call (for the particle spawner). */
  takeEmitted(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, l] of this.links) {
      if (l.emitted > 0) out.set(id, l.emitted);
      l.emitted = 0;
    }
    return out;
  }
}
