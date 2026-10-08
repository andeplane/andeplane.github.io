/**
 * Chapter 2: a tiny character-level language model whose every multiply–add is
 * done by sculpted tanks.
 *
 * For each letter: the three previous letters are looked up in the embedding table
 * (digital), layer 1's eight tanks map the 15 embedding numbers plus a constant 1
 * to 31 pre-activations, tanh is applied (digital), layer 2's sixteen tanks map the
 * 31 hidden values plus a 1 to 27 letter scores, softmax turns the scores into
 * probabilities and a letter is sampled (digital).
 *
 * Which tank result drives the model: the steady-state (frequency-domain) solve of
 * every tank's floor, computed in workers when the page loads. One tank at a time
 * is also run in the time domain in the 3D view, with the same inputs, and its
 * lock-in reading is compared with that steady state.
 */
import * as THREE from 'three';
import { AMBER, BLUE, CYAN, type PortVisual } from '../render/tankView.ts';
import { OMEGA, PERIOD, SETTLE_STEPS, WaveTank } from '../sim/tank.ts';
import { gauss, mulberry32 } from '../sim/rng.ts';
import {
  agreement,
  allTiles,
  argmax,
  CTX,
  contextOf,
  digitalMul,
  EMB,
  encode,
  forward,
  GAIN,
  HID,
  kl,
  TILE,
  VOCAB,
  waterMul,
  type Agreement,
  type Step,
  type Tile,
} from '../model/llm.ts';
import { $, sci, stepsFor, sub, tagPool, type Chapter, type Ctx } from './common.ts';
import { TankHall } from './hall.ts';

type Stage = 'idle' | 'embed' | 'layer1' | 'tanh' | 'layer2' | 'sample';
const STAGES: Stage[] = ['embed', 'layer1', 'tanh', 'layer2', 'sample'];
const NOISE = [0, 0.01, 0.03, 0.1, 0.3, 1];
const LISTEN = 4 * PERIOD;
const MAX_LETTERS = 14;
const GOLD = new THREE.Color(0xf2c46d);

interface Token {
  ctx: number[];
  water: Step;
  exact: Step;
  ch: number;
  /** Layer-2 tile shown in 3D for this letter. */
  tile: number;
}

const letter = (id: number) => (id === 0 ? '·' : VOCAB[id]);
const say = (id: number) => (id === 0 ? 'end' : VOCAB[id]);

export class Chapter2 implements Chapter {
  private readonly ctx: Ctx;
  private readonly tiles: Tile[];
  private readonly bankIdx: number[];
  private hall: TankHall | null = null;
  private ready = false;
  private stage: Stage = 'idle';
  private stageAt = 0;
  private generating = false;
  private prefix: number[] = [];
  private generated: number[] = [];
  private token: Token | null = null;
  private noiseIdx = 0;
  private rand = mulberry32(11);
  private watch = true;
  private session = { n: 0, same: 0 };
  private stats: Agreement | null = null;
  private readonly tags;
  private hallTime = 0;
  private active = false;
  /** Freeze the letter-by-letter stages (the tanks keep rippling); for screenshots. */
  hold = false;

  // Visible tank (time domain).
  private visTile = -1;
  private tank: WaveTank | null = null;
  private visX: Float64Array<ArrayBufferLike> = new Float64Array(TILE);
  private changedAt = 0;
  private ring = new Float32Array(LISTEN * TILE);
  private ringT = new Int32Array(LISTEN);
  private visReading: Float64Array | null = null;
  private readonly disp = new Float64Array(TILE);

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.tiles = allTiles(ctx.model.weights);
    this.bankIdx = this.tiles.map((t) => ctx.bank.tanks.findIndex((m) => m.layer === t.layer && m.r === t.r && m.c === t.c));
    this.tags = tagPool(ctx.labels);
    const genBtn = $<HTMLButtonElement>('#gen');
    genBtn.disabled = true;
    $('#prompt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.generate();
    });
    const prompt = $<HTMLInputElement>('#prompt');
    prompt.addEventListener('input', () => {
      const clean = prompt.value.toLowerCase().replace(/[^a-z]/g, '');
      if (clean !== prompt.value) prompt.value = clean;
      if (!this.generating) this.preview();
    });
    $<HTMLInputElement>('#watch').addEventListener('change', (e) => (this.watch = (e.target as HTMLInputElement).checked));
    const noise = $<HTMLInputElement>('#noise');
    noise.max = String(NOISE.length - 1);
    noise.addEventListener('input', () => {
      this.noiseIdx = Number(noise.value);
      $('#noise-val').textContent = String(NOISE[this.noiseIdx]);
      this.computeStats();
    });
    ctx.onCalibrated(() => this.checkReady());
    this.checkReady();
  }

  private get specs() {
    return this.bankIdx.map((i) => this.ctx.specs[i]);
  }

  private checkReady(): void {
    const done = this.bankIdx.filter((i) => this.ctx.calib[i]).length;
    $('#status2').textContent = done < this.tiles.length ? `solving tanks · ${done}/${this.tiles.length}` : this.generating ? 'generating' : 'ready';
    if (this.ready || done < this.tiles.length) return;
    this.ready = true;
    $<HTMLButtonElement>('#gen').disabled = false;
    this.hall = new TankHall($('#hall'), this.tiles, this.specs, (k) => this.showTile(k));
    this.computeStats();
    this.preview();
  }

  private Tre() {
    return this.bankIdx.map((i) => this.ctx.calib[i]!.Tre);
  }

  private waterMul() {
    const s = NOISE[this.noiseIdx];
    const rand = this.rand;
    return waterMul(this.ctx.model.weights, this.tiles, this.Tre(), s > 0 ? () => s * gauss(rand) : undefined);
  }

  private computeStats(): void {
    if (!this.ready) return;
    const s = NOISE[this.noiseIdx];
    const rand = mulberry32(5);
    const t0 = performance.now();
    this.stats = agreement(
      this.ctx.model.weights,
      this.ctx.model.testNames,
      waterMul(this.ctx.model.weights, this.tiles, this.Tre(), s > 0 ? () => s * gauss(rand) : undefined),
    );
    const a = this.stats;
    console.info(
      `[ripple-llm] agreement σ=${s}: top-1 ${(a.top1 * 100).toFixed(2)}% over ${a.n}, KL ${a.kl.toExponential(2)}, loss water ${a.lossWater.toFixed(4)} exact ${a.lossExact.toFixed(4)} (${(performance.now() - t0).toFixed(0)} ms)`,
    );
    $('#agree').textContent = `${(a.top1 * 100).toFixed(1)}%`;
    $('#bar-agree').style.width = `${a.top1 * 100}%`;
    $('#kl').textContent = `${sci(a.kl)} nats`;
    $('#agree-note').innerHTML =
      s === 0
        ? `${a.n.toLocaleString('en')} next-letter predictions on ${this.ctx.model.testNames.length} names the model never saw, water against the same model in exact arithmetic. With no noise, the only difference is each floor's design residual (about 10⁻⁵ of an entry). Cross-entropy: water ${a.lossWater.toFixed(4)}, exact ${a.lossExact.toFixed(4)} nats/letter.`
        : `With Gaussian noise σ = ${s} on every probe reading (in units of the scores), as a real lock-in would have. Cross-entropy: water ${a.lossWater.toFixed(3)}, exact ${a.lossExact.toFixed(3)} nats/letter.`;
  }

  // ------------------------------------------------------------------ tokens

  private makeToken(ids: number[]): Token {
    const w = this.ctx.model.weights;
    const ctx = contextOf(ids);
    const water = forward(w, ctx, this.waterMul());
    const exact = forward(w, ctx, digitalMul(w));
    let u = Math.random();
    let ch = 0;
    for (; ch < water.probs.length - 1; ch++) if ((u -= water.probs[ch]) <= 0) break;
    // Show the layer-2 tank that pushed the chosen letter's score up the most.
    const r = Math.floor(ch / TILE);
    const Tre = this.Tre();
    let best = -1;
    let bestV = -Infinity;
    this.tiles.forEach((t, k) => {
      if (t.layer !== 2 || t.r !== r) return;
      let s = 0;
      for (let j = 0; j < t.cols; j++) s += Tre[k][ch - r * TILE][j] * water.x2[t.c * TILE + j];
      if (s > bestV) {
        bestV = s;
        best = k;
      }
    });
    return { ctx, water, exact, ch, tile: best };
  }

  private tileInput(k: number, tok: Token): Float64Array {
    const t = this.tiles[k];
    const src = t.layer === 1 ? tok.water.x1 : tok.water.x2;
    const x = new Float64Array(TILE);
    for (let j = 0; j < t.cols; j++) x[j] = src[t.c * TILE + j];
    return x;
  }

  private driveHall(tok: Token): void {
    if (!this.hall) return;
    this.tiles.forEach((_, k) => this.hall!.setDrive(k, this.ctx.calib[this.bankIdx[k]]?.thumbs, this.tileInput(k, tok)));
  }

  /** Before generating: show the model's view of the prompt as it stands. */
  private preview(): void {
    if (!this.ready) return;
    this.prefix = [];
    this.generated = [];
    const ids = encode($<HTMLInputElement>('#prompt').value);
    this.token = this.makeToken(ids);
    this.driveHall(this.token);
    this.showTile(this.token.tile);
    this.drawProbs();
    this.renderTokenLine(true);
    this.renderOutput();
  }

  private showTile(k: number): void {
    if (!this.token) return;
    this.setVisible(k, this.tileInput(k, this.token));
  }

  private setVisible(k: number, x: Float64Array): void {
    const spec = this.specs[k];
    if (k !== this.visTile || !this.tank) {
      this.visTile = k;
      this.tank = new WaveTank(spec);
      if (this.active) this.ctx.view.setTank(spec);
      this.ring.fill(0);
    }
    this.visX = x;
    for (let j = 0; j < TILE; j++) this.tank.amp[j] = x[j];
    this.changedAt = this.tank.time;
    this.visReading = null;
    if (this.hall) this.hall.shown = k;
    this.renderVisibleNote();
  }

  private generate(): void {
    if (!this.ready) return;
    this.prefix = encode($<HTMLInputElement>('#prompt').value);
    this.generated = [];
    this.generating = true;
    $<HTMLButtonElement>('#gen').disabled = true;
    this.nextToken();
  }

  private nextToken(): void {
    this.token = this.makeToken([...this.prefix, ...this.generated]);
    this.stage = 'embed';
    this.stageAt = performance.now();
    this.renderOutput();
    this.drawProbs();
  }

  private finishToken(): void {
    const tok = this.token!;
    this.session.n++;
    if (argmax(tok.water.probs) === argmax(tok.exact.probs)) this.session.same++;
    $('#session').textContent = `${this.session.same} / ${this.session.n} same top choice`;
    if (tok.ch !== 0) this.generated.push(tok.ch);
    this.renderOutput();
    if (tok.ch === 0 || this.generated.length >= MAX_LETTERS) {
      this.generating = false;
      this.stage = 'idle';
      $<HTMLButtonElement>('#gen').disabled = false;
      $('#status2').textContent = 'ready';
      this.renderOutput();
      const name = Array.from([...this.prefix, ...this.generated], (i) => VOCAB[i]).join('');
      const li = document.createElement('li');
      li.textContent = name;
      const hist = $('#history');
      hist.prepend(li);
      while (hist.children.length > 8) hist.lastElementChild!.remove();
      console.info(`[ripple-llm] generated "${name}"`);
      return;
    }
    this.nextToken();
  }

  // ------------------------------------------------------------------ rendering

  private renderOutput(): void {
    const out = $('#output');
    const tok = this.token;
    const p = this.prefix.length || this.generating ? this.prefix : encode($<HTMLInputElement>('#prompt').value);
    let html = `<span class="p">${p.map((i) => VOCAB[i]).join('')}</span>`;
    this.generated.forEach((id) => (html += `<span class="g">${VOCAB[id]}</span>`));
    if (!this.generating && this.generated.length && tok?.ch === 0) html += '<span class="end">.</span>';
    if (this.generating) html += '<span class="caret"></span>';
    // Keep earlier letters' animation from restarting: only rebuild when it changed.
    if (out.dataset.html !== html) {
      out.dataset.html = html;
      out.innerHTML = html;
    }
  }

  private renderTokenLine(preview = false): void {
    const tok = this.token;
    const el = $('#token-line');
    if (!tok) return;
    const ctxStr = tok.ctx.map(letter).join('');
    const tw = argmax(tok.water.probs);
    const te = argmax(tok.exact.probs);
    const k = kl(tok.exact.probs, tok.water.probs);
    const same = tw === te;
    const pick = preview ? '' : ` · sampled <b>${say(tok.ch)}</b>`;
    el.innerHTML = `after “${ctxStr}”: top choice water <b>${say(tw)}</b> ${(tok.water.probs[tw] * 100).toFixed(1)}%, exact <b>${say(te)}</b> ${(tok.exact.probs[te] * 100).toFixed(1)}% ${same ? '✓' : '✗'} · KL ${sci(k)}${pick}`;
  }

  private renderVisibleNote(): void {
    const el = $('#visible-note');
    const k = this.visTile;
    if (k < 0) return;
    const t = this.tiles[k];
    const rows =
      t.layer === 2
        ? `scores for ${letter(t.r * TILE)}–${letter(t.r * TILE + t.rows - 1)}`
        : `pre-activations ${t.r * TILE + 1}–${t.r * TILE + t.rows}`;
    const ins = t.layer === 2 ? `hidden ${t.c * TILE + 1}–${Math.min(HID, t.c * TILE + t.cols)}` : `embedding numbers ${t.c * TILE + 1}–${Math.min(CTX * EMB, t.c * TILE + t.cols)}`;
    const bias = t.c * TILE + t.cols > (t.layer === 1 ? CTX * EMB : HID) ? ' and the bias' : '';
    let check = 'settling in the time domain…';
    if (this.visReading) {
      const T = this.Tre()[k];
      let e = 0;
      for (let i = 0; i < t.rows; i++) {
        let s = 0;
        for (let j = 0; j < t.cols; j++) s += T[i][j] * this.visX[j];
        e = Math.max(e, Math.abs(this.visReading[i] - s / GAIN));
      }
      check = `its time-domain lock-in reading matches the steady-state solve to ${sci(e)}`;
    } else if (!this.watch && this.generating) check = 'fast mode: not waiting for it to settle';
    el.innerHTML = `<b>In 3D:</b> layer ${t.layer} tank (${t.r + 1}, ${t.c + 1}), ${rows} from ${ins}${bias}; ${check}.`;
  }

  private drawProbs(): void {
    const cv = $<HTMLCanvasElement>('#probs');
    const g = cv.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const tok = this.token;
    if (!tok) return;
    const order = [...Array(26).keys()].map((i) => i + 1).concat([0]);
    const pad = 8;
    const bw = (w - 2 * pad) / order.length;
    const top = 10;
    const base = h - 20;
    const pmax = Math.max(0.25, ...tok.water.probs, ...tok.exact.probs);
    const y = (p: number) => base - ((base - top) * p) / pmax;
    const reveal = this.stage === 'sample' || this.stage === 'idle';
    const sampled = reveal && this.generating ? tok.ch : -1;
    g.font = '11px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    order.forEach((id, k) => {
      const x = pad + k * bw;
      const pw = tok.water.probs[id];
      const pe = tok.exact.probs[id];
      const isPick = id === sampled;
      g.fillStyle = isPick ? 'rgba(102,224,255,0.95)' : 'rgba(102,224,255,0.55)';
      g.globalAlpha = reveal || !this.generating ? 1 : 0.2;
      g.fillRect(x + 1.5, y(pw), bw - 3, base - y(pw));
      g.globalAlpha = 1;
      g.fillStyle = '#f2c46d';
      g.fillRect(x + 0.5, y(pe) - 1, bw - 1, 2);
      g.fillStyle = isPick ? '#f2c46d' : '#8d99ab';
      g.fillText(letter(id), x + bw / 2, h - 6);
    });
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.moveTo(pad, base + 0.5);
    g.lineTo(w - pad, base + 0.5);
    g.stroke();
  }

  // ------------------------------------------------------------------ loop

  private stageDuration(s: Stage): number {
    const fast = !this.watch;
    switch (s) {
      case 'embed':
        return fast ? 60 : 260;
      case 'layer1':
        return fast ? 140 : 650;
      case 'tanh':
        return fast ? 60 : 220;
      case 'layer2':
        return fast ? 160 : 500;
      case 'sample':
        return fast ? 120 : 520;
      default:
        return 0;
    }
  }

  enter(): void {
    this.active = true;
    this.ctx.view.setPlaque('THE RIPPLE LLM', 'chapter two · twenty-four tanks, one tiny language model');
    this.ctx.view.setHeightScale(0.042);
    if (this.tank) this.ctx.view.setTank(this.tank.spec);
    if (this.ready && !this.token) this.preview();
    this.drawProbs();
  }

  leave(): void {
    this.active = false;
    this.tags.begin();
    this.tags.end();
  }

  private record(): void {
    const t = this.tank!;
    const slot = t.time % LISTEN;
    this.ringT[slot] = t.time;
    for (let i = 0; i < TILE; i++) this.ring[slot * TILE + i] = t.u[t.probes[i]];
  }

  private lockIn(): Float64Array {
    const out = new Float64Array(TILE);
    for (let s = 0; s < LISTEN; s++) {
      const c = Math.cos(OMEGA * this.ringT[s]);
      for (let i = 0; i < TILE; i++) out[i] += this.ring[s * TILE + i] * c;
    }
    return out.map((v) => (2 * v) / LISTEN / GAIN);
  }

  private last = 0;

  frame(now: number): void {
    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    // Stage machine.
    if (this.generating && this.token && !this.hold) {
      const tok = this.token;
      const elapsed = now - this.stageAt;
      const settled = !!this.visReading;
      let done = elapsed >= this.stageDuration(this.stage);
      if (this.stage === 'layer2' && this.watch && !settled) done = false;
      if (done) {
        const i = STAGES.indexOf(this.stage);
        if (this.stage === 'sample') {
          this.finishToken();
        } else {
          this.stage = STAGES[i + 1];
          this.stageAt = now;
          if (this.stage === 'layer1') this.driveHall(tok);
          if (this.stage === 'layer2') this.setVisible(tok.tile, this.tileInput(tok.tile, tok));
          if (this.stage === 'sample') {
            this.drawProbs();
            this.renderTokenLine();
          }
        }
      }
      if (this.generating) $('#status2').textContent = `generating · letter ${this.generated.length + 1}`;
    }

    // Visible tank: stroboscope while a letter is being computed, real time otherwise.
    const t = this.tank;
    if (t) {
      const busy = this.generating && (this.stage === 'layer2' || (!this.watch && this.stage !== 'idle'));
      const since = t.time - this.changedAt;
      const strobe = busy || (since < SETTLE_STEPS + LISTEN && !this.visReading);
      const n = strobe ? stepsFor(60 * (2 * PERIOD + 1), dt, PERIOD, true) : stepsFor(60, dt, PERIOD);
      for (let k = 0; k < n; k++) {
        t.step();
        this.record();
        if (!this.visReading && t.time - this.changedAt >= SETTLE_STEPS + LISTEN) {
          this.visReading = this.lockIn();
          this.renderVisibleNote();
        }
      }
    }

    // Hall activity follows the stages.
    if (this.hall) {
      const s = this.generating ? this.stage : 'idle';
      this.tiles.forEach((tile, k) => {
        let target = 0.55;
        if (s === 'embed') target = 0.08;
        else if (s === 'layer1') target = tile.layer === 1 ? 1 : 0.05;
        else if (s === 'tanh') target = tile.layer === 1 ? 0.45 : 0.05;
        else if (s === 'layer2' || s === 'sample') target = tile.layer === 2 ? 1 : 0.3;
        this.hall!.activity[k] += (target - this.hall!.activity[k]) * 0.15;
      });
      this.hallTime += 1;
      this.hall.draw(this.hallTime);
    }
    this.updateScene();
  }

  private updateScene(): void {
    const view = this.ctx.view;
    const t = this.tank;
    if (!t) return;
    const tile = this.tiles[this.visTile];
    const phase = Math.cos(OMEGA * t.time) * t.envelope(t.time);
    const pv: PortVisual[] = [];
    for (let j = 0; j < TILE; j++) {
      const a = t.amp[j];
      this.disp[j] = a * phase;
      pv.push({ level: Math.min(1, Math.abs(a)), color: a < 0 ? BLUE : AMBER, used: j < tile.cols });
    }
    view.setPaddles(this.disp, pv);
    const r = this.visReading;
    const qv: PortVisual[] = [];
    for (let i = 0; i < TILE; i++) {
      const v = r ? r[i] : 0;
      qv.push({
        level: r ? Math.min(1, 0.25 + Math.abs(v) * 0.3) : 0.2,
        color: r ? (v < 0 ? BLUE : GOLD) : CYAN,
        used: i < tile.rows,
      });
    }
    view.setProbes(qv);
    view.setHeights(t.u);

    this.tags.begin();
    const inName = (j: number) => {
      const g = tile.c * TILE + j;
      if (tile.layer === 1) return g === CTX * EMB ? '1' : `e${sub(g + 1)}`;
      return g === HID ? '1' : `h${sub(g + 1)}`;
    };
    for (let j = 0; j < tile.cols; j++) {
      const s = view.project(view.paddleWorld(j).add(new THREE.Vector3(-0.02, 0.08, 0)));
      const a = t.amp[j];
      this.tags.put(s.x, s.y, `${inName(j)} ${a.toFixed(2).replace('-', '−')}`, a < 0 ? 'neg' : '');
    }
    for (let i = 0; i < tile.rows; i++) {
      const s = view.project(view.probeWorld(i).add(new THREE.Vector3(0.06, 0.02, 0)));
      const g = tile.r * TILE + i;
      const name = tile.layer === 2 ? `“${letter(g)}”` : `z${sub(g + 1)}`;
      const v = r?.[i];
      this.tags.put(s.x, s.y, v === undefined ? name : `${name} ${v.toFixed(2).replace('-', '−')}`, `probe ${v === undefined ? '' : v < 0 ? 'neg' : 'pos'}`);
    }
    this.tags.end();
  }

  timeline() {
    return {
      labels: [
        { text: 'Embed', digital: true },
        { text: 'Layer 1 · 8 tanks' },
        { text: 'tanh', digital: true },
        { text: 'Layer 2 · 16 tanks' },
        { text: 'Softmax · sample', digital: true },
      ],
      stage: this.generating ? STAGES.indexOf(this.stage) : -1,
    };
  }

  snapshot() {
    return {
      ready: this.ready,
      generating: this.generating,
      stage: this.stage,
      text: [...this.prefix, ...this.generated].map((i) => VOCAB[i]).join(''),
      stats: this.stats,
      session: { ...this.session },
      visTile: this.visTile >= 0 ? this.ctx.bank.tanks[this.bankIdx[this.visTile]].id : null,
      visReading: this.visReading ? Array.from(this.visReading) : null,
      history: Array.from(document.querySelectorAll('#history li'), (li) => li.textContent),
    };
  }

  setWatch(on: boolean): void {
    this.watch = on;
    $<HTMLInputElement>('#watch').checked = on;
  }

  start(prompt: string): void {
    $<HTMLInputElement>('#prompt').value = prompt;
    this.generate();
  }
}
