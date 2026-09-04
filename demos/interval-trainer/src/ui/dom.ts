/** Small DOM helpers. The app builds its markup by hand; these keep that readable. */

export function qs<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Centre of an element as a fraction of the viewport — what the wave field wants. */
export function viewportFraction(node: Element): { fx: number; fy: number } {
  const rect = node.getBoundingClientRect();
  return {
    fx: (rect.left + rect.width / 2) / window.innerWidth,
    fy: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

/** Re-trigger a CSS animation on an element that may already be mid-animation. */
export function restartAnimation(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth; // force reflow so the class re-add is seen as a change
  node.classList.add(className);
}
