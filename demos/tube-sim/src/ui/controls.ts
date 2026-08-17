import {
  PISTON_MAX_VELOCITY,
  PULSE_MAX_DURATION,
  PULSE_MIN_DURATION,
} from '../sim/solver';
import type { ExcitationParams, HoleParams, TubeParams } from '../sim/types';

/**
 * A pulse crosses a 1 m tube in ~3 ms, so the interesting part of the event is
 * over in about 10 ms. Even 0.01× flashes past; the slowest settings are what
 * make the wave watchable, and 0.003× (≈1 s per length of tube) is the default.
 * The bottom of the ladder, 0.0001×, stretches that same trip to ~30 s — slow
 * enough to watch the wavefront cross the hole edge cell by cell.
 */
export const SPEED_OPTIONS = [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];
export const DEFAULT_SPEED = 0.003;

/** Shared by the speed buttons and the HUD so they never disagree. */
export function formatSpeed(v: number): string {
  if (v >= 0.1) return String(v);
  return v.toFixed(4).replace(/0+$/, '');
}

export interface ControlsHandlers {
  onExcitationChange(excitation: ExcitationParams): void;
  onTubeChange(tube: TubeParams): void;
  onStrike(): void;
  onPauseToggle(): void;
  onStep(): void;
  onReset(): void;
  onSpeedChange(speed: number): void;
  onParticlesToggle(show: boolean): void;
  onClearProbes(): void;
  onControlsToggle(open: boolean): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

/** `<label><span class="lbl">Name<em>value</em></span> …` — matches the static markup. */
function labelWithValue(name: string, value: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  const head = document.createElement('span');
  head.className = 'lbl';
  head.append(name, value);
  label.appendChild(head);
  return label;
}

export class Controls {
  private readonly holeList = $<HTMLDivElement>('hole-list');
  private readonly speedButtons = $<HTMLDivElement>('speed-buttons');
  private readonly pauseButton = $<HTMLButtonElement>('pause');

  constructor(
    private tube: TubeParams,
    private excitation: ExcitationParams,
    private handlers: ControlsHandlers,
  ) {
    this.wireStatic();
    this.buildSpeedButtons();
    this.renderHoles();
    this.syncReadouts();
  }

  /** Mirrors every slider into a physical number, so the knobs aren't opaque. */
  private syncReadouts(): void {
    const pulseMs =
      (PULSE_MIN_DURATION +
        this.excitation.pulseWidth * (PULSE_MAX_DURATION - PULSE_MIN_DURATION)) *
      1000;
    $('val-strength').textContent = `${(this.excitation.strength * PISTON_MAX_VELOCITY).toFixed(1)} m/s`;
    $('val-pulsewidth').textContent = `${pulseMs.toFixed(2)} ms`;
    $('val-length').textContent = `${Math.round(this.tube.length * 100)} cm`;
    $('val-diameter').textContent = `${Math.round(this.tube.diameter * 1000)} mm`;
  }

  setSpeed(speed: number): void {
    for (const btn of Array.from(this.speedButtons.children) as HTMLButtonElement[]) {
      btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
    }
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  setParticles(show: boolean): void {
    $<HTMLInputElement>('ctl-particles').checked = show;
  }

  private wireStatic(): void {
    $<HTMLInputElement>('ctl-strength').addEventListener('input', (e) => {
      this.excitation = { ...this.excitation, strength: Number((e.target as HTMLInputElement).value) };
      this.syncReadouts();
      this.handlers.onExcitationChange(this.excitation);
    });
    $<HTMLInputElement>('ctl-pulsewidth').addEventListener('input', (e) => {
      this.excitation = {
        ...this.excitation,
        pulseWidth: Number((e.target as HTMLInputElement).value),
      };
      this.syncReadouts();
      this.handlers.onExcitationChange(this.excitation);
    });
    $<HTMLInputElement>('ctl-length').addEventListener('input', (e) => {
      this.tube = { ...this.tube, length: Number((e.target as HTMLInputElement).value) };
      this.syncReadouts();
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLInputElement>('ctl-diameter').addEventListener('input', (e) => {
      this.tube = { ...this.tube, diameter: Number((e.target as HTMLInputElement).value) };
      this.syncReadouts();
      this.renderHoles(); // the hole-diameter range depends on the bore
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLButtonElement>('add-hole').addEventListener('click', () => {
      if (this.tube.holes.length >= 4) return;
      this.tube = { ...this.tube, holes: [...this.tube.holes, { position: 0.5, diameter: 0.04 }] };
      this.renderHoles();
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLInputElement>('ctl-particles').addEventListener('change', (e) => {
      this.handlers.onParticlesToggle((e.target as HTMLInputElement).checked);
    });
    $<HTMLButtonElement>('strike').addEventListener('click', () => this.handlers.onStrike());
    $<HTMLButtonElement>('pause').addEventListener('click', () => this.handlers.onPauseToggle());
    $<HTMLButtonElement>('step').addEventListener('click', () => this.handlers.onStep());
    $<HTMLButtonElement>('reset').addEventListener('click', () => this.handlers.onReset());
    $<HTMLButtonElement>('clear-probes').addEventListener('click', () => this.handlers.onClearProbes());
    $<HTMLButtonElement>('controls-open').addEventListener('click', () => this.handlers.onControlsToggle(true));
    $<HTMLButtonElement>('controls-close').addEventListener('click', () =>
      this.handlers.onControlsToggle(false),
    );
  }

  private buildSpeedButtons(): void {
    this.speedButtons.innerHTML = '';
    for (const speed of SPEED_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${formatSpeed(speed)}×`;
      btn.dataset.speed = String(speed);
      btn.addEventListener('click', () => this.handlers.onSpeedChange(speed));
      this.speedButtons.appendChild(btn);
    }
  }

  /** Rebuilds the hole rows. Call after tube.holes changes from any source (UI or drag). */
  syncTube(tube: TubeParams): void {
    this.tube = tube;
    this.renderHoles();
  }

  private renderHoles(): void {
    this.holeList.innerHTML = '';
    this.tube.holes.forEach((hole, index) => {
      this.holeList.appendChild(this.buildHoleRow(hole, index));
    });
  }

  private buildHoleRow(hole: HoleParams, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'hole-row';

    const head = document.createElement('div');
    head.className = 'hole-row-head';
    const title = document.createElement('span');
    title.textContent = `Hole ${index + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'remove';
    removeBtn.addEventListener('click', () => {
      this.tube = { ...this.tube, holes: this.tube.holes.filter((_, i) => i !== index) };
      this.renderHoles();
      this.handlers.onTubeChange(this.tube);
    });
    head.append(title, removeBtn);

    const posValue = document.createElement('em');
    const posLabel = labelWithValue('Position along tube', posValue);
    const posInput = document.createElement('input');
    posInput.type = 'range';
    posInput.min = '0.05';
    posInput.max = '0.95';
    posInput.step = '0.01';
    posInput.value = String(hole.position);
    const showPos = () => {
      posValue.textContent = `${Math.round(Number(posInput.value) * this.tube.length * 100)} cm`;
    };
    posInput.addEventListener('input', () => {
      showPos();
      this.updateHole(index, { position: Number(posInput.value) });
    });
    showPos();
    posLabel.appendChild(posInput);

    const diaValue = document.createElement('em');
    const diaLabel = labelWithValue('Diameter', diaValue);
    const diaInput = document.createElement('input');
    diaInput.type = 'range';
    diaInput.min = '0.01';
    diaInput.max = String(Math.max(0.012, this.tube.diameter * 0.9));
    diaInput.step = '0.002';
    diaInput.value = String(Math.min(hole.diameter, Number(diaInput.max)));
    const showDia = () => {
      diaValue.textContent = `${Math.round(Number(diaInput.value) * 1000)} mm`;
    };
    diaInput.addEventListener('input', () => {
      showDia();
      this.updateHole(index, { diameter: Number(diaInput.value) });
    });
    showDia();
    diaLabel.appendChild(diaInput);

    row.append(head, posLabel, diaLabel);
    return row;
  }

  private updateHole(index: number, patch: Partial<HoleParams>): void {
    const holes = this.tube.holes.map((h, i) => (i === index ? { ...h, ...patch } : h));
    this.tube = { ...this.tube, holes };
    this.handlers.onTubeChange(this.tube);
  }
}
