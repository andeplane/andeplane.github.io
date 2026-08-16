import type { ExcitationParams, HoleParams, TubeParams } from '../sim/types';

export const SPEED_OPTIONS = [0.01, 0.03, 0.1, 0.3, 1];

export interface ControlsHandlers {
  onExcitationChange(excitation: ExcitationParams): void;
  onTubeChange(tube: TubeParams): void;
  onStrike(): void;
  onPauseToggle(): void;
  onStep(): void;
  onReset(): void;
  onSpeedChange(speed: number): void;
  onControlsToggle(open: boolean): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

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
  }

  setSpeed(speed: number): void {
    for (const btn of Array.from(this.speedButtons.children) as HTMLButtonElement[]) {
      btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
    }
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  private wireStatic(): void {
    $<HTMLInputElement>('ctl-strength').addEventListener('input', (e) => {
      this.excitation = { ...this.excitation, strength: Number((e.target as HTMLInputElement).value) };
      this.handlers.onExcitationChange(this.excitation);
    });
    $<HTMLInputElement>('ctl-pulsewidth').addEventListener('input', (e) => {
      this.excitation = {
        ...this.excitation,
        pulseWidth: Number((e.target as HTMLInputElement).value),
      };
      this.handlers.onExcitationChange(this.excitation);
    });
    $<HTMLInputElement>('ctl-length').addEventListener('input', (e) => {
      this.tube = { ...this.tube, length: Number((e.target as HTMLInputElement).value) };
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLInputElement>('ctl-diameter').addEventListener('input', (e) => {
      this.tube = { ...this.tube, diameter: Number((e.target as HTMLInputElement).value) };
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLButtonElement>('add-hole').addEventListener('click', () => {
      if (this.tube.holes.length >= 4) return;
      this.tube = { ...this.tube, holes: [...this.tube.holes, { position: 0.5, diameter: 0.04 }] };
      this.renderHoles();
      this.handlers.onTubeChange(this.tube);
    });
    $<HTMLButtonElement>('strike').addEventListener('click', () => this.handlers.onStrike());
    $<HTMLButtonElement>('pause').addEventListener('click', () => this.handlers.onPauseToggle());
    $<HTMLButtonElement>('step').addEventListener('click', () => this.handlers.onStep());
    $<HTMLButtonElement>('reset').addEventListener('click', () => this.handlers.onReset());
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
      btn.textContent = `${speed}×`;
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

    const posLabel = document.createElement('label');
    posLabel.textContent = 'Position along tube';
    const posInput = document.createElement('input');
    posInput.type = 'range';
    posInput.min = '0.05';
    posInput.max = '0.95';
    posInput.step = '0.01';
    posInput.value = String(hole.position);
    posInput.addEventListener('input', () => {
      this.updateHole(index, { position: Number(posInput.value) });
    });
    posLabel.appendChild(posInput);

    const diaLabel = document.createElement('label');
    diaLabel.textContent = 'Diameter';
    const diaInput = document.createElement('input');
    diaInput.type = 'range';
    diaInput.min = '0.01';
    diaInput.max = String(Math.max(0.01, this.tube.diameter * 0.9));
    diaInput.step = '0.002';
    diaInput.value = String(hole.diameter);
    diaInput.addEventListener('input', () => {
      this.updateHole(index, { diameter: Number(diaInput.value) });
    });
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
