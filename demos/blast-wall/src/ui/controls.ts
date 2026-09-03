/**
 * The control panel, built from a declarative list.
 *
 * Twenty-odd sliders written out as markup would be twenty-odd chances to mistype a
 * label; this is the same information as data, and every control knows how to read and
 * write the one field it owns.
 */

export interface Slider {
  kind: 'slider';
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  /** Slider position → value, for parameters that want a log-ish feel. */
  log?: boolean;
  get: () => number;
  set: (v: number) => void;
  format?: (v: number) => string;
}

export interface Choice {
  kind: 'choice';
  label: string;
  options: { value: string; label: string }[];
  get: () => string;
  set: (v: string) => void;
}

export interface Toggle {
  kind: 'toggle';
  label: string;
  get: () => boolean;
  set: (v: boolean) => void;
}

export interface Button {
  kind: 'button';
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export type Control = Slider | Choice | Toggle | Button;

export interface Group {
  title: string;
  /** Groups start collapsed unless they are the ones you reach for first. */
  open?: boolean;
  controls: Control[];
}

export class Panel {
  private readonly refresh: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    groups: Group[],
  ) {
    for (const g of groups) this.addGroup(g);
  }

  /** Pull every control back into line with the state it reads. */
  sync(): void {
    for (const f of this.refresh) f();
  }

  private addGroup(g: Group): void {
    const details = document.createElement('details');
    details.className = 'group';
    details.open = g.open ?? false;
    const summary = document.createElement('summary');
    summary.textContent = g.title;
    details.append(summary);
    const body = document.createElement('div');
    body.className = 'group-body';
    details.append(body);
    for (const c of g.controls) body.append(this.build(c));
    this.host.append(details);
  }

  private build(c: Control): HTMLElement {
    switch (c.kind) {
      case 'slider':
        return this.slider(c);
      case 'choice':
        return this.choice(c);
      case 'toggle':
        return this.toggle(c);
      case 'button':
        return this.button(c);
    }
  }

  private slider(c: Slider): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row slider';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.label;
    const value = document.createElement('span');
    value.className = 'value';
    const input = document.createElement('input');
    input.type = 'range';
    const toPos = (v: number) =>
      c.log
        ? (Math.log(Math.max(v, 1e-9) / c.min) / Math.log(c.max / c.min)) * 1000
        : v;
    const fromPos = (p: number) =>
      c.log ? c.min * Math.pow(c.max / c.min, p / 1000) : p;
    input.min = String(c.log ? 0 : c.min);
    input.max = String(c.log ? 1000 : c.max);
    input.step = String(c.log ? 1 : c.step);

    const show = () => {
      const v = c.get();
      value.textContent = c.format ? c.format(v) : `${round(v, c.step)}${c.unit ?? ''}`;
    };
    const pull = () => {
      input.value = String(toPos(c.get()));
      show();
    };
    input.addEventListener('input', () => {
      c.set(fromPos(Number(input.value)));
      show();
    });
    pull();
    this.refresh.push(pull);
    row.append(name, input, value);
    return row;
  }

  private choice(c: Choice): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row choice';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.label;
    const select = document.createElement('select');
    for (const o of c.options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.append(opt);
    }
    const pull = () => {
      select.value = c.get();
    };
    select.addEventListener('change', () => c.set(select.value));
    pull();
    this.refresh.push(pull);
    row.append(name, select);
    return row;
  }

  private toggle(c: Toggle): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row toggle';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    const pull = () => {
      input.checked = c.get();
    };
    input.addEventListener('change', () => c.set(input.checked));
    pull();
    this.refresh.push(pull);
    row.append(name, input);
    return row;
  }

  private button(c: Button): HTMLElement {
    const b = document.createElement('button');
    b.className = c.primary ? 'btn primary' : 'btn';
    b.textContent = c.label;
    b.addEventListener('click', c.onClick);
    return b;
  }
}

function round(v: number, step: number): string {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step || 1)));
  return v.toFixed(Math.min(decimals, 4));
}
