/**
 * Chapter 1: one sculpted tank computes y = W·x.
 *
 * The run you watch is the time-domain solver from still water: wave-makers start,
 * the fronts cross the floor in slow motion, the tank is fast-forwarded through
 * its settling with a stroboscope (41 steps per frame, so the waves appear to
 * crawl at 1/20 of a period per frame), then each probe's lock-in amplifier
 * listens for four whole periods and the in-phase amplitude is the answer.
 */
import { AMBER, BLUE, CYAN, type PortVisual } from '../render/tankView.ts';
import { inPhase } from '../sim/helmholtz.ts';
import { OMEGA, PERIOD, SETTLE_STEPS, WaveTank } from '../sim/tank.ts';
import { TARGETS, type Target } from '../model/targets.ts';
import { $, fmt, sci, stepsFor, sub, tagPool, type Chapter, type Ctx } from './common.ts';
import * as THREE from 'three';

type Phase = 'idle' | 'calm' | 'start' | 'travel' | 'settle' | 'listen' | 'answer';

const TRAVEL_END = 300;
const LISTEN = 4 * PERIOD;
const GOLD = new THREE.Color(0xf2c46d);

export class Chapter1 implements Chapter {
  private readonly ctx: Ctx;
  private targetIdx = 0;
  private x: number[] = [];
  private tank!: WaveTank;
  private phase: Phase = 'idle';
  private calmFrames = 0;
  /** Live lock-in over the last LISTEN steps (sliding), for the converging readout. */
  private ring: Float32Array = new Float32Array(0);
  private ringT: Int32Array = new Int32Array(LISTEN);
  private reading: Float64Array | null = null;
  private final: Float64Array | null = null;
  private runX: number[] = [];
  private readonly tags;
  private readonly answersEl = $('#answers');
  private rows: { water: HTMLElement; exact: HTMLElement; bar: HTMLElement; fill: HTMLElement; mark: HTMLElement }[] = [];
  private readonly disp = new Float64Array(8);
  runs = 0;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.tags = tagPool(ctx.labels);
    const chips = $('#targets');
    TARGETS.forEach((t, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = t.name;
      b.addEventListener('click', () => this.selectTarget(k, true));
      chips.appendChild(b);
    });
    $('#send').addEventListener('click', () => this.send());
    $('#shuffle').addEventListener('click', () => {
      this.x = this.x.map(() => Math.round((Math.random() * 2 - 1) * 20) / 20);
      this.renderInputs();
      this.send();
    });
    ctx.onCalibrated((i) => {
      if (i === this.bankIndex()) this.renderFd();
    });
    this.selectTarget(0, false);
  }

  private get target(): Target {
    return TARGETS[this.targetIdx];
  }

  private bankIndex(): number {
    return this.ctx.bank.tanks.findIndex((t) => t.id === this.target.id);
  }

  private selectTarget(k: number, run: boolean): void {
    this.targetIdx = k;
    const t = this.target;
    document.querySelectorAll('#targets button').forEach((b, i) => b.setAttribute('aria-checked', String(i === k)));
    $('#target-blurb').textContent = t.blurb;
    this.x = t.examples[1].slice();
    const spec = this.ctx.specs[this.bankIndex()];
    this.tank = new WaveTank(spec);
    this.ring = new Float32Array(LISTEN * t.W.length);
    this.final = null;
    this.reading = null;
    this.phase = 'idle';
    this.ctx.view.setTank(spec);
    this.renderMatrix();
    this.renderInputs();
    this.buildAnswers();
    this.renderFd();
    if (run) this.send();
  }

  private renderMatrix(): void {
    const W = this.target.W;
    const m = $('#matrix');
    m.style.gridTemplateColumns = `repeat(${W[0].length}, auto)`;
    m.innerHTML = W.flat()
      .map((v) => `<span class="${v === 0 ? 'zero' : ''}">${v === 0 ? '0' : fmt(v, 2).replace('+', '')}</span>`)
      .join('');
  }

  private renderInputs(): void {
    const box = $('#xin');
    box.innerHTML = '';
    this.x.forEach((v, j) => {
      const row = document.createElement('div');
      row.className = 'slider';
      row.innerHTML = `<label for="x${j}">x${sub(j + 1)}</label><input id="x${j}" type="range" min="-1" max="1" step="0.05" value="${v}"><output></output>`;
      const input = row.querySelector('input')!;
      const out = row.querySelector('output')!;
      const show = () => {
        out.textContent = fmt(this.x[j], 2);
        out.classList.toggle('neg', this.x[j] < 0);
      };
      input.addEventListener('input', () => {
        this.x[j] = Number(input.value);
        show();
        this.renderVec();
        this.renderAnswers();
      });
      input.addEventListener('change', () => this.send());
      show();
      box.appendChild(row);
    });
    this.renderVec();
  }

  private renderVec(): void {
    const v = $('#xvec');
    v.innerHTML = this.x.map((a) => `<span class="${a < 0 ? 'neg' : ''}">${fmt(a, 2).replace('+', '')}</span>`).join('');
  }

  private exact(x = this.x): number[] {
    return this.target.W.map((row) => row.reduce((s, w, j) => s + w * x[j], 0));
  }

  private buildAnswers(): void {
    this.answersEl.innerHTML = '';
    this.rows = this.target.W.map((_, i) => {
      const r = document.createElement('div');
      r.className = 'ans';
      r.innerHTML = `<span class="name">y${sub(i + 1)}</span><span class="val water pending">·</span><span class="val exact"></span><div class="bar"><i></i><b></b></div>`;
      this.answersEl.appendChild(r);
      const [water, exact] = Array.from(r.querySelectorAll<HTMLElement>('.val'));
      const bar = r.querySelector<HTMLElement>('.bar')!;
      return { water, exact, bar, fill: bar.querySelector('i')!, mark: bar.querySelector('b')! };
    });
    this.renderAnswers();
  }

  private renderAnswers(): void {
    const ex = this.exact();
    const runEx = this.exact(this.runX);
    const stale = this.x.some((v, j) => v !== this.runX[j]);
    const shown = this.final ?? this.reading;
    const scale = Math.max(1, ...ex.map(Math.abs), ...(shown ? Array.from(shown, Math.abs) : [])) * 1.1;
    const pos = (v: number) => 50 + (50 * v) / scale;
    this.rows.forEach((r, i) => {
      r.exact.textContent = fmt(ex[i]);
      r.mark.style.left = `${pos(ex[i])}%`;
      const w = shown && !stale ? shown[i] : null;
      r.water.textContent = w === null ? '·' : fmt(w);
      r.water.classList.toggle('pending', w === null || this.final === null);
      const a = w === null ? 50 : pos(w);
      r.fill.style.left = `${Math.min(50, a)}%`;
      r.fill.style.width = `${Math.abs(a - 50)}%`;
    });
    const err = $('#err1');
    if (this.final && !stale) {
      const e = Math.max(...this.final.map((v, i) => Math.abs(v - runEx[i])));
      const norm = Math.max(1e-9, Math.hypot(...runEx));
      err.innerHTML = `Largest error <b>${sci(e)}</b>, ${((100 * e) / norm).toPrecision(2)}% of |W·x|, after ${SETTLE_STEPS.toLocaleString('en')} time steps`;
    } else if (stale && this.final) {
      err.innerHTML = 'Input changed. Release the slider or press <b>Send waves</b>.';
    } else if (this.phase !== 'idle') {
      err.textContent = this.phase === 'listen' ? 'Lock-in amplifiers listening…' : 'Waves still settling: the live reading is not the answer yet.';
    }
  }

  private renderFd(): void {
    const c = this.ctx.calib[this.bankIndex()];
    const el = $('#fd1');
    if (!c) {
      el.textContent = 'Solving this floor’s Helmholtz equation…';
      return;
    }
    const W = this.target.W;
    let e = 0;
    W.forEach((row, i) => row.forEach((w, j) => (e = Math.max(e, Math.abs(c.Tre[i][j] / this.ctx.bank.gain - w)))));
    const fd = inPhase(c.Tre.map((r) => Float64Array.from(r)), this.x);
    el.innerHTML = `Frequency-domain check: solving the Helmholtz equation for this floor gives Re T/G = W to within ${sci(e)} per entry, and predicts y = (${Array.from(fd, (v) => (v / this.ctx.bank.gain).toFixed(3)).join(', ')}) for this x.`;
  }

  send(): void {
    this.runX = this.x.slice();
    this.final = null;
    this.reading = null;
    this.phase = this.tank.energy() > 1e-3 ? 'calm' : 'start';
    this.calmFrames = 0;
    this.renderAnswers();
    this.renderFd();
  }

  enter(): void {
    this.ctx.view.setTank(this.ctx.specs[this.bankIndex()]);
    this.ctx.view.setPlaque('THE RIPPLE LLM', 'chapter one · a sculpted floor that multiplies');
    this.ctx.view.setHeightScale(0.06);
    if (this.runs === 0 && this.phase === 'idle') this.send();
  }

  leave(): void {
    this.tags.begin();
    this.tags.end();
  }

  private record(): void {
    const t = this.tank;
    const M = t.probes.length;
    const slot = t.time % LISTEN;
    this.ringT[slot] = t.time;
    for (let i = 0; i < M; i++) this.ring[slot * M + i] = t.u[t.probes[i]];
  }

  /** Lock-in over the ring buffer: the last four periods of probe signal. */
  private lockIn(): Float64Array {
    const M = this.tank.probes.length;
    const out = new Float64Array(M);
    for (let s = 0; s < LISTEN; s++) {
      const c = Math.cos(OMEGA * this.ringT[s]);
      for (let i = 0; i < M; i++) out[i] += this.ring[s * M + i] * c;
    }
    const g = this.ctx.bank.gain;
    return out.map((v) => (2 * v) / LISTEN / g);
  }

  private stepN(n: number): void {
    for (let k = 0; k < n; k++) {
      this.tank.step(this.phase !== 'calm');
      this.record();
    }
  }

  private last = 0;

  frame(now: number): void {
    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    const t = this.tank;
    switch (this.phase) {
      case 'calm':
        t.extraDamping = 0.06;
        this.stepN(stepsFor(240, dt, PERIOD));
        if ((this.calmFrames += dt) > 0.8 || t.energy() < 1e-3) this.phase = 'start';
        break;
      case 'start':
        t.extraDamping = 0;
        t.reset();
        this.ring.fill(0);
        t.amp.fill(0);
        this.runX.forEach((v, j) => (t.amp[j] = v));
        this.phase = 'travel';
        this.runs++;
        break;
      case 'travel':
        this.stepN(stepsFor(120, dt, PERIOD));
        if (t.time >= TRAVEL_END) this.phase = 'settle';
        break;
      case 'settle':
        // Stroboscope: two periods and one step per frame (at 60 frames per second).
        this.stepN(stepsFor(60 * (2 * PERIOD + 1), dt, PERIOD, true));
        if (t.time >= SETTLE_STEPS) this.phase = 'listen';
        break;
      case 'listen':
        this.stepN(stepsFor(120, dt, PERIOD));
        if (t.time >= SETTLE_STEPS + LISTEN) {
          this.final = this.lockIn();
          this.phase = 'answer';
          console.info(
            `[ripple-llm] ${this.target.id} x=(${this.runX.join(', ')}) water=(${Array.from(this.final, (v) => v.toFixed(4)).join(', ')}) exact=(${this.exact(this.runX).map((v) => v.toFixed(4)).join(', ')})`,
          );
        }
        break;
      case 'answer':
      case 'idle':
        this.stepN(stepsFor(60, dt, PERIOD));
        break;
    }
    if (this.phase === 'travel' || this.phase === 'settle' || this.phase === 'listen') this.reading = this.lockIn();
    this.renderAnswers();
    this.updateStatus();
    this.updateScene();
  }

  private updateStatus(): void {
    const s = $('#status1');
    const p = $('#progress1').firstElementChild as HTMLElement;
    const total = SETTLE_STEPS + LISTEN;
    const labels: Record<Phase, string> = {
      idle: 'ready',
      calm: 'calming the water',
      start: 'calming the water',
      travel: 'waves crossing · slow motion',
      settle: 'settling · stroboscope',
      listen: 'lock-in listening',
      answer: 'answer',
    };
    s.textContent = `${labels[this.phase]}${this.phase === 'travel' || this.phase === 'settle' ? ` · step ${this.tank.time}` : ''}`;
    const frac = this.phase === 'answer' ? 1 : this.phase === 'idle' || this.phase === 'calm' || this.phase === 'start' ? 0 : this.tank.time / total;
    p.style.width = `${(frac * 100).toFixed(1)}%`;
  }

  private updateScene(): void {
    const view = this.ctx.view;
    const t = this.tank;
    const phase = Math.cos(OMEGA * t.time) * t.envelope(t.time);
    const driving = this.phase !== 'calm' && this.phase !== 'start';
    const N = t.spec.paddles.length;
    const pv: PortVisual[] = [];
    for (let j = 0; j < N; j++) {
      const a = driving ? t.amp[j] : 0;
      this.disp[j] = a * phase;
      pv.push({ level: Math.min(1, Math.abs(a)), color: a < 0 ? BLUE : AMBER, used: true });
    }
    view.setPaddles(this.disp, pv);
    const shown = this.final ?? this.reading;
    const qv: PortVisual[] = t.spec.probes.map((_, i) => {
      if (this.final) {
        const v = this.final[i];
        return { level: Math.min(1, 0.3 + Math.abs(v) * 0.6), color: v < 0 ? BLUE : GOLD, used: true };
      }
      const v = shown ? Math.abs(shown[i]) : 0;
      return { level: Math.min(1, v * 0.7), color: CYAN, used: true };
    });
    view.setProbes(qv);
    view.setHeights(t.u);

    this.tags.begin();
    for (let j = 0; j < N; j++) {
      const s = view.project(view.paddleWorld(j).add(new THREE.Vector3(-0.02, 0.1, 0)));
      const a = this.runX[j] ?? this.x[j];
      this.tags.put(s.x, s.y, `x${sub(j + 1)} ${fmt(a, 2)}`, a < 0 ? 'neg' : a === 0 ? 'off' : '');
    }
    t.spec.probes.forEach((_, i) => {
      const s = view.project(view.probeWorld(i).add(new THREE.Vector3(0.06, 0.02, 0)));
      const v = this.final?.[i];
      this.tags.put(s.x, s.y, v === undefined ? `y${sub(i + 1)}` : `y${sub(i + 1)} ${fmt(v, 3)}`, `probe ${v === undefined ? '' : v < 0 ? 'neg' : 'pos'}`);
    });
    this.tags.end();
  }

  timeline() {
    const order: Phase[] = ['start', 'travel', 'settle', 'listen', 'answer'];
    let stage = order.indexOf(this.phase);
    if (this.phase === 'calm') stage = 0;
    return {
      labels: [{ text: 'Wave-makers start' }, { text: 'Waves cross the floor' }, { text: 'Settling · stroboscope' }, { text: 'Lock-in listens' }, { text: 'Answer' }],
      stage,
    };
  }

  /** Read-only state for automated checks. */
  snapshot() {
    return {
      target: this.target.id,
      phase: this.phase,
      x: this.runX.slice(),
      water: this.final ? Array.from(this.final) : null,
      exact: this.exact(this.runX),
      runs: this.runs,
    };
  }

  setInput(x: number[]): void {
    this.x = x.slice();
    this.renderInputs();
  }

  select(id: string): void {
    this.selectTarget(TARGETS.findIndex((t) => t.id === id), false);
  }
}
