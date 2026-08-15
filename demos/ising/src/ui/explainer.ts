import { PAPER } from './paper.ts';

/**
 * The "How does it work?" modal.
 *
 * KaTeX and its web fonts are a few hundred kilobytes, so both the library and the
 * typeset paper are built on first open rather than at start-up. The page already asks
 * the visitor to wait for several megabytes of planetary imagery; there is no reason to
 * add a typesetting engine to that queue for a panel most people will never open.
 */
export function createExplainer(): { open(): Promise<void> } {
  let dialog: HTMLDialogElement | null = null;
  let building: Promise<HTMLDialogElement> | null = null;

  async function build(): Promise<HTMLDialogElement> {
    const [katex] = await Promise.all([
      import('katex').then((m) => m.default),
      import('katex/dist/katex.min.css'),
    ]);

    const el = document.createElement('dialog');
    el.id = 'explainer';

    const close = document.createElement('button');
    close.className = 'explainer-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => el.close());

    const article = document.createElement('article');
    // Display maths is substituted before inline, so that its delimiters cannot be
    // mistaken for two adjacent inline spans.
    article.innerHTML = PAPER.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
      katex.renderToString(tex, { displayMode: true, throwOnError: false }),
    ).replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
      katex.renderToString(tex, { displayMode: false, throwOnError: false }),
    );

    el.append(close, article);
    // The dialog fills the viewport, so a click landing on it rather than on the article
    // is a click on the backdrop.
    el.addEventListener('click', (event) => {
      if (event.target === el) el.close();
    });
    document.body.append(el);
    return el;
  }

  return {
    async open() {
      building ??= build();
      try {
        dialog = await building;
      } catch {
        // A failed lazy import (offline, chunk 404) must not be cached forever —
        // clear it so the next click retries the load.
        building = null;
        return;
      }
      if (!dialog.open) dialog.showModal();
      // showModal moves focus to the first focusable child, and the browser scrolls it
      // into view -- which lands the reader in the middle of the paper. Reset on the
      // next frame, once that has happened.
      const article = dialog.querySelector('article');
      requestAnimationFrame(() => article?.scrollTo(0, 0));
    },
  };
}
