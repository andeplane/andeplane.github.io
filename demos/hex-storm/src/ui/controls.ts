/** Small DOM helpers for the control panel. */

export interface SliderOpts {
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  log?: boolean;
  format?: (v: number) => string;
  onInput: (v: number) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

export function slider(o: SliderOpts): { el: HTMLElement; set: (v: number) => void } {
  const valueEl = h('span');
  const input = h('input', { type: 'range' }) as HTMLInputElement;
  const toSlider = (v: number) => (o.log ? Math.log(v) : v);
  const fromSlider = (s: number) => (o.log ? Math.exp(s) : s);
  input.min = String(toSlider(o.min));
  input.max = String(toSlider(o.max));
  input.step = o.log ? '0.001' : String(o.step);
  const fmt = o.format ?? ((v: number) => v.toFixed(2));
  const set = (v: number) => {
    input.value = String(toSlider(v));
    valueEl.textContent = fmt(v);
  };
  set(o.value);
  input.addEventListener('input', () => {
    const v = fromSlider(Number(input.value));
    valueEl.textContent = fmt(v);
    o.onInput(v);
  });
  const el = h(
    'div',
    { class: 'control' },
    h('div', { class: 'head' }, h('span', {}, o.label), valueEl),
    input,
    ...(o.help ? [h('div', { class: 'help' }, o.help)] : []),
  );
  return { el, set };
}

export function segmented(
  labels: string[],
  initial: number,
  onChange: (i: number) => void,
): { el: HTMLElement; set: (i: number) => void } {
  const buttons = labels.map((l, i) => {
    const b = h('button', { type: 'button' }, l);
    b.addEventListener('click', () => {
      set(i);
      onChange(i);
    });
    return b;
  });
  const set = (i: number) => buttons.forEach((b, j) => b.classList.toggle('active', i === j));
  set(initial);
  return { el: h('div', { class: 'seg' }, ...buttons), set };
}

export function checkbox(label: string, initial: boolean, onChange: (v: boolean) => void): { el: HTMLElement; set: (v: boolean) => void } {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  return { el: h('label', { class: 'check' }, input, label), set: (v) => (input.checked = v) };
}
