/** Building blocks for the overlay panels, so each one stays a few readable lines. */

import { el } from './dom.ts';

export function panel(...children: (Node | string)[]): HTMLElement {
  const node = el('div', 'panel');
  node.append(...children);
  return node;
}

export function title(text: string): HTMLElement {
  return el('h2', 'panel-title', text);
}

export function eyebrow(text: string): HTMLElement {
  return el('p', 'micro panel-eyebrow', text);
}

export function para(html: string): HTMLElement {
  const node = el('p', 'panel-text');
  node.innerHTML = html;
  return node;
}

export function row(...children: HTMLElement[]): HTMLElement {
  const node = el('div', 'panel-row');
  node.append(...children);
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'ghost' = 'ghost',
): HTMLButtonElement {
  const node = el('button', `panel-btn panel-btn--${variant}`, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** A labelled control line: text on the left, the control on the right. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const node = el('label', 'panel-field');
  const text = el('span', 'panel-field-text');
  text.append(el('span', 'panel-field-label', label));
  if (hint) text.append(el('span', 'panel-field-hint', hint));
  node.append(text, control);
  return node;
}

/**
 * The same line, but for a control made of several buttons. It cannot be a `<label>`:
 * clicking the label text would fire the first button in the group.
 */
export function fieldGroup(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const node = el('div', 'panel-field');
  const text = el('span', 'panel-field-text');
  text.append(el('span', 'panel-field-label', label));
  if (hint) text.append(el('span', 'panel-field-hint', hint));
  node.append(text, control);
  return node;
}

export function toggle(checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const wrap = el('span', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, el('span', 'switch-track'));
  return wrap;
}

export function select(
  options: { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const node = el('select', 'panel-select');
  for (const option of options) {
    const opt = el('option', undefined, option.label);
    opt.value = option.value;
    node.append(opt);
  }
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
}
