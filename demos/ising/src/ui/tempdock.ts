/**
 * The hero temperature control: a wide gradient track docked bottom-center, with an
 * etched T_c tick that slides when the geometry changes, a soft snap onto T_c during
 * slow drags, and the quench button at its left end. This is the one control worth
 * building from scratch — everything the lab is about happens on this axis.
 */

export interface TempDockOptions {
  min: number;
  max: number;
  value: number;
  tc: number;
  onChange: (T: number) => void;
  onQuench: () => void;
}

export interface TempDock {
  /** Move the thumb without firing onChange (e.g. from URL state or a preset). */
  set(T: number, animate?: boolean): void;
  value(): number;
  setTc(tc: number): void;
  setFound(found: boolean): void;
  setQuenchLabel(label: string): void;
}

const SNAP_RANGE = 0.04;
const SLOW_DRAG_PX = 2.5;

export function createTempDock(root: HTMLElement, options: TempDockOptions): TempDock {
  const { min, max } = options;
  let T = options.value;
  let tc = options.tc;

  const quench = document.createElement('button');
  quench.className = 'td-quench';
  quench.type = 'button';
  quench.textContent = '❄ Quench';
  quench.addEventListener('click', options.onQuench);

  const slider = document.createElement('div');
  slider.className = 'td-slider';
  slider.tabIndex = 0;
  slider.setAttribute('role', 'slider');
  slider.setAttribute('aria-label', 'Temperature');
  slider.setAttribute('aria-valuemin', String(min));
  slider.setAttribute('aria-valuemax', String(max));

  const track = document.createElement('div');
  track.className = 'td-track';
  const tick = document.createElement('div');
  tick.className = 'td-tick';
  const tickLabel = document.createElement('span');
  tickLabel.className = 'td-tick-label';
  tick.append(tickLabel);
  const thumb = document.createElement('div');
  thumb.className = 'td-thumb';
  const bubble = document.createElement('output');
  bubble.className = 'td-bubble';

  slider.append(track, tick, thumb, bubble);
  root.append(quench, slider);

  const frac = (t: number) => (t - min) / (max - min);

  function render(animate = false): void {
    const f = frac(T) * 100;
    thumb.classList.toggle('animate', animate);
    bubble.classList.toggle('animate', animate);
    thumb.style.left = `${f}%`;
    bubble.style.left = `${f}%`;
    bubble.textContent = `T = ${T.toFixed(3)}`;
    const critical = Math.abs(T - tc) / tc < 0.01;
    bubble.classList.toggle('critical', critical);
    slider.setAttribute('aria-valuenow', T.toFixed(3));
  }

  function renderTick(): void {
    tick.style.left = `${frac(tc) * 100}%`;
    tickLabel.textContent = `T_c ${tc.toFixed(3)}`;
  }

  function apply(next: number, opts: { snap?: boolean; animate?: boolean } = {}): void {
    let v = Math.min(max, Math.max(min, next));
    if (opts.snap && Math.abs(v - tc) < SNAP_RANGE) v = tc;
    if (v === T) return;
    T = v;
    render(opts.animate ?? false);
    options.onChange(T);
  }

  let lastX = 0;
  slider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    slider.setPointerCapture(event.pointerId);
    lastX = event.clientX;
    const rect = slider.getBoundingClientRect();
    apply(min + ((event.clientX - rect.left) / rect.width) * (max - min), { snap: true });
    slider.classList.add('dragging');
  });
  slider.addEventListener('pointermove', (event) => {
    if (!slider.hasPointerCapture(event.pointerId)) return;
    const rect = slider.getBoundingClientRect();
    const raw = min + ((event.clientX - rect.left) / rect.width) * (max - min);
    // The magnet only grabs during slow drags, so a fast sweep glides through T_c.
    const slow = Math.abs(event.clientX - lastX) < SLOW_DRAG_PX;
    lastX = event.clientX;
    apply(raw, { snap: slow });
  });
  slider.addEventListener('pointerup', (event) => {
    if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
    slider.classList.remove('dragging');
  });

  tick.addEventListener('dblclick', () => apply(tc, { animate: true }));
  slider.addEventListener('dblclick', (event) => {
    const rect = slider.getBoundingClientRect();
    const raw = min + ((event.clientX - rect.left) / rect.width) * (max - min);
    if (Math.abs(raw - tc) < 0.12) apply(tc, { animate: true });
  });

  slider.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      apply(T + step);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      apply(T - step);
      event.preventDefault();
    }
  });

  render();
  renderTick();

  return {
    set(next, animate = false) {
      T = Math.min(max, Math.max(min, next));
      render(animate);
    },
    value: () => T,
    setTc(next) {
      tc = next;
      renderTick();
      render();
    },
    setFound(found) {
      tick.classList.toggle('found', found);
    },
    setQuenchLabel(label) {
      quench.textContent = label;
    },
  };
}
