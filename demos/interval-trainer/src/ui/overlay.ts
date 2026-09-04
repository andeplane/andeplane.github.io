/**
 * One modal surface, reused for the menu, the tutorial, settings, the highscore board and
 * the end-of-game card. Having a single overlay means only one thing can ever be in front
 * of the game, and only one place needs to get focus handling right.
 */

export interface OverlayOptions {
  /** Backdrop click and Escape close it. Off for the game-over card. */
  dismissible?: boolean;
  onDismiss?: () => void;
}

export class Overlay {
  private options: OverlayOptions = {};

  constructor(
    private readonly root: HTMLElement,
    private readonly card: HTMLElement,
  ) {
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) this.dismiss();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.visible) {
        event.preventDefault();
        this.dismiss();
      }
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(content: HTMLElement, options: OverlayOptions = {}): void {
    this.options = options;
    this.card.replaceChildren(content);
    this.root.hidden = false;
    this.root.classList.add('is-open');
    // Focus the card so Escape works and screen readers land inside the dialog.
    this.card.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    this.card.replaceChildren();
  }

  private dismiss(): void {
    if (this.options.dismissible === false) return;
    const onDismiss = this.options.onDismiss;
    this.hide();
    onDismiss?.();
  }
}
