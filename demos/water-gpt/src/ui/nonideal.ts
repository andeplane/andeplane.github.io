/** Controls for the crossbar's non-idealities ("how well was the machine built"). */
import type { CrossbarSettings } from '../crossbar/tile.ts';

export const BITS = [null, 8, 6, 5, 4, 3] as const;
const LAMBDAS = [0, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2];

export interface NonIdealUi {
  get(): CrossbarSettings;
  set(s: CrossbarSettings): void;
}

export function buildNonIdeal(
  host: HTMLElement,
  opts: { title: string; caption: string; presets: { label: string; s: CrossbarSettings }[]; maxLambda: number },
  initial: CrossbarSettings,
  onChange: (s: CrossbarSettings) => void,
): NonIdealUi {
  let cur = { ...initial };
  host.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = opts.title;
  const cap = document.createElement('p');
  cap.className = 'ni-caption';
  cap.innerHTML = opts.caption;
  const rows = document.createElement('div');
  rows.className = 'ni-rows';
  host.append(h, cap, rows);

  const lambdas = LAMBDAS.filter((l) => l <= opts.maxLambda);

  function slider(label: string, n: number, fmt: (i: number) => string, get: () => number, set: (i: number) => void) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lab = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(n - 1);
    input.step = '1';
    input.setAttribute('aria-label', label);
    const sync = () => {
      input.value = String(get());
      out.textContent = fmt(get());
      input.style.setProperty('--fill', `${(get() / (n - 1)) * 100}%`);
    };
    input.addEventListener('input', () => {
      set(Number(input.value));
      sync();
      markPresets();
    });
    input.addEventListener('change', () => onChange({ ...cur }));
    row.append(lab, input);
    rows.append(row);
    return sync;
  }

  const syncBits = slider(
    'Valve resolution',
    BITS.length,
    (i) => (BITS[i] === null ? 'continuous' : `${BITS[i]} bit · ${1 << BITS[i]!} stops`),
    () => BITS.indexOf(cur.bits as (typeof BITS)[number]),
    (i) => (cur.bits = BITS[i]),
  );
  const NOISES = [0, 0.0025, 0.005, 0.01, 0.02, 0.04];
  const syncNoise = slider(
    'Valve setting error σ',
    NOISES.length,
    (i) => (NOISES[i] === 0 ? 'none' : `${(NOISES[i] * 100).toFixed(NOISES[i] < 0.01 ? 2 : 0)}% of full`),
    () => Math.max(0, NOISES.indexOf(cur.noise)),
    (i) => (cur.noise = NOISES[i]),
  );
  const syncLambda = slider(
    'Manifold resistance λ',
    lambdas.length,
    (i) => (lambdas[i] === 0 ? 'none' : `λ = ${lambdas[i].toExponential(0)}`),
    () => Math.max(0, lambdas.indexOf(cur.lambda)),
    (i) => (cur.lambda = lambdas[i]),
  );

  const presets = document.createElement('div');
  presets.className = 'presets';
  const pbs: HTMLButtonElement[] = [];
  for (const p of opts.presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      cur = { ...p.s, seed: cur.seed };
      syncAll();
      onChange({ ...cur });
    });
    pbs.push(b);
    presets.append(b);
  }
  host.append(presets);

  function markPresets() {
    opts.presets.forEach((p, i) => {
      const same = p.s.bits === cur.bits && p.s.noise === cur.noise && p.s.lambda === cur.lambda;
      pbs[i].setAttribute('aria-pressed', String(same));
    });
  }
  function syncAll() {
    syncBits();
    syncNoise();
    syncLambda();
    markPresets();
  }
  syncAll();
  return {
    get: () => ({ ...cur }),
    set: (s) => {
      cur = { ...s };
      syncAll();
    },
  };
}
