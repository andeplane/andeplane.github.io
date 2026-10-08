/**
 * The Ripple LLM: loads the bank of sculpted tanks, solves every floor's Helmholtz
 * equation in workers (the frequency-domain calibration), and runs the two
 * chapters over one shared 3D tank view.
 */
import bankJson from './data/tanks.json';
import modelJson from './data/model.json';
import { TankView } from './render/tankView.ts';
import { specOf, type BankMeta } from './sim/bank.ts';
import type { CalibRequest, CalibResult } from './sim/calib.worker.ts';
import { NX, NY } from './sim/tank.ts';
import { $, type Chapter, type Ctx, type ModelFile } from './app/common.ts';
import { Chapter1 } from './app/chapter1.ts';
import { Chapter2 } from './app/chapter2.ts';

const errlog = $('#errlog');
window.addEventListener('error', (e) => {
  errlog.textContent += `${e.message}\n`;
});
window.addEventListener('unhandledrejection', (e) => {
  errlog.textContent += `${String(e.reason)}\n`;
});

const bank = bankJson as BankMeta;
const model = modelJson as unknown as ModelFile;

async function main(): Promise<void> {
  const res = await fetch(new URL('./data/tanks.bin', import.meta.url));
  if (!res.ok) throw new Error(`tanks.bin: HTTP ${res.status}`);
  const words = new Uint16Array(await res.arrayBuffer());
  const specs = bank.tanks.map((m) => specOf(m, words));

  const canvas = $<HTMLCanvasElement>('#view');
  const view = new TankView(canvas, NX, NY);
  const listeners: ((i: number) => void)[] = [];
  const ctx: Ctx = {
    view,
    bank,
    specs,
    calib: bank.tanks.map(() => undefined),
    model,
    labels: $('#labels'),
    onCalibrated: (cb) => listeners.push(cb),
  };

  // Frequency-domain calibration: every floor's steady response, on a few workers.
  const nWorkers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const queues: CalibRequest['tanks'][] = Array.from({ length: nWorkers }, () => []);
  bank.tanks.forEach((meta, index) => queues[index % nWorkers].push({ index, meta }));
  const t0 = performance.now();
  let solved = 0;
  for (const q of queues) {
    const w = new Worker(new URL('./sim/calib.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<CalibResult>) => {
      ctx.calib[e.data.index] = e.data;
      solved++;
      if (solved === bank.tanks.length) {
        console.info(`[ripple-llm] solved ${solved} tanks in ${(performance.now() - t0).toFixed(0)} ms on ${nWorkers} workers`);
        w.terminate();
      }
      listeners.forEach((cb) => cb(e.data.index));
    };
    w.onerror = (e) => {
      errlog.textContent += `worker: ${e.message}\n`;
    };
    w.postMessage({ words, tanks: q } satisfies CalibRequest);
  }

  const ch1 = new Chapter1(ctx);
  const ch2 = new Chapter2(ctx);
  const chapters: Record<string, Chapter> = { '1': ch1, '2': ch2 };
  let current = '1';
  const fromHash = location.hash === '#llm' ? '2' : '1';

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapters button'));
  function select(ch: string): void {
    if (ch !== current) chapters[current].leave();
    current = ch;
    document.body.dataset.chapter = ch;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ch === ch)));
    history.replaceState(null, '', ch === '2' ? '#llm' : location.pathname + location.search);
    chapters[ch].enter();
    resize();
  }
  tabs.forEach((b) => b.addEventListener('click', () => select(b.dataset.ch!)));

  // Timeline footer.
  const timeline = $('#timeline');
  let timelineKey = '';
  function updateTimeline(): void {
    const t = chapters[current].timeline();
    const key = current + t.labels.map((l) => l.text).join('|');
    if (key !== timelineKey) {
      timelineKey = key;
      timeline.innerHTML = t.labels.map((l) => `<span class="${l.digital ? 'digital' : ''}">${l.text}</span>`).join('');
    }
    Array.from(timeline.children).forEach((el, i) => {
      el.classList.toggle('on', i === t.stage);
      el.classList.toggle('done', t.stage > i);
    });
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w > 760) {
      const left = document.querySelector<HTMLElement>(`#ch${current}-left`)!.getBoundingClientRect().width + 28;
      const right = document.querySelector<HTMLElement>(`#ch${current}-right`)!.getBoundingClientRect().width + 28;
      view.resize(w, h, left * 0.85, right * 0.85, w > 1180 ? 40 : 0);
    } else view.resize(w, h);
  }
  window.addEventListener('resize', resize);

  select(fromHash);
  $('#loading').classList.add('done');

  function frame(now: number): void {
    requestAnimationFrame(frame);
    chapters[current].frame(now);
    view.render();
    updateTimeline();
  }
  requestAnimationFrame(frame);

  // A small read-only hook for automated checks.
  (window as unknown as { __rippleLLM: unknown }).__rippleLLM = {
    get calibrated() {
      return ctx.calib.filter(Boolean).length;
    },
    get chapter() {
      return current;
    },
    ch1: () => ch1.snapshot(),
    ch2: () => ch2.snapshot(),
    select,
    ch1Select: (id: string) => ch1.select(id),
    ch1Send: (x: number[]) => {
      ch1.setInput(x);
      ch1.send();
    },
    ch2Hold: (on: boolean) => {
      ch2.hold = on;
    },
    ch2Start: (prompt: string, watch = true) => {
      ch2.setWatch(watch);
      ch2.start(prompt);
    },
  };
}

main().catch((e) => {
  errlog.textContent += `${String(e?.stack ?? e)}\n`;
  console.error(e);
});
