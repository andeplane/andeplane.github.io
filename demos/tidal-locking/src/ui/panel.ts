/** Small builders for the control panel and the live readouts. */

export function section(parent: HTMLElement, title: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'group';
  const h = document.createElement('h2');
  h.textContent = title;
  box.append(h);
  parent.append(box);
  return box;
}

export interface SliderOptions {
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Map the raw slider position to the real value; use for log-scale controls. */
  scale?: 'linear' | 'log';
  format: (v: number) => string;
  hint?: string;
  onChange: (value: number) => void;
}

export function slider(parent: HTMLElement, label: string, options: SliderOptions): {
  set(value: number): void;
} {
  const wrap = document.createElement('label');
  wrap.className = 'control';

  const head = document.createElement('span');
  head.className = 'control-head';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('output');
  head.append(name, value);

  const input = document.createElement('input');
  input.type = 'range';
  const log = options.scale === 'log';
  const toRaw = (v: number) => (log ? Math.log10(Math.max(v, 1e-12)) : v);
  const toValue = (r: number) => (log ? Math.pow(10, r) : r);
  input.min = String(toRaw(options.min));
  input.max = String(toRaw(options.max));
  input.step = String(options.step ?? (log ? 0.01 : (options.max - options.min) / 200));
  input.value = String(toRaw(options.value));

  const render = (v: number) => {
    value.textContent = options.format(v);
  };
  render(options.value);

  input.addEventListener('input', () => {
    const v = toValue(Number(input.value));
    render(v);
    options.onChange(v);
  });

  wrap.append(head, input);
  if (options.hint) {
    const hint = document.createElement('small');
    hint.textContent = options.hint;
    wrap.append(hint);
  }
  parent.append(wrap);

  return {
    set(v: number) {
      input.value = String(toRaw(v));
      render(v);
    },
  };
}

/**
 * A two-option segmented control.
 *
 * Used for choices that change what you are looking at rather than a detail of it: a
 * checkbox buried in a list is the wrong weight for those, and gets missed.
 */
export function segmented<T extends string>(
  parent: HTMLElement,
  label: string,
  options: { value: T; label: string; hint?: string }[],
  initial: T,
  onChange: (value: T) => void,
): void {
  const wrap = document.createElement('div');
  wrap.className = 'control';

  const head = document.createElement('span');
  head.className = 'control-head';
  head.textContent = label;

  const row = document.createElement('div');
  row.className = 'segmented';
  const hint = document.createElement('small');

  const buttons = options.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      hint.textContent = option.hint ?? '';
      onChange(option.value);
    });
    button.setAttribute('aria-pressed', String(option.value === initial));
    if (option.value === initial) hint.textContent = option.hint ?? '';
    row.append(button);
    return button;
  });

  wrap.append(head, row, hint);
  parent.append(wrap);
}

export function toggle(
  parent: HTMLElement,
  label: string,
  value: boolean,
  onChange: (value: boolean) => void,
): void {
  const wrap = document.createElement('label');
  wrap.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  parent.append(wrap);
}

export function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', onClick);
  parent.append(el);
  return el;
}

/** A table of live numbers. Values are only written when the text actually changes. */
export class Readouts {
  private readonly cells = new Map<string, HTMLElement>();
  private readonly last = new Map<string, string>();

  constructor(private readonly root: HTMLElement) {}

  add(key: string, label: string, hint?: string): void {
    const row = document.createElement('div');
    row.className = 'readout';
    const name = document.createElement('span');
    name.textContent = label;
    if (hint) name.title = hint;
    const value = document.createElement('strong');
    value.textContent = '—';
    row.append(name, value);
    this.root.append(row);
    this.cells.set(key, value);
  }

  set(key: string, text: string, tone?: 'good' | 'plain'): void {
    if (this.last.get(key) === text) return;
    this.last.set(key, text);
    const cell = this.cells.get(key);
    if (!cell) return;
    cell.textContent = text;
    cell.dataset.tone = tone ?? 'plain';
  }
}
