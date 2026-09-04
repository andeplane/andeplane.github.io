/** One-line auto-dismissing toast above the temperature dock. */

let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 6000): void {
  const el = document.getElementById('toast')!;
  el.textContent = message;
  el.hidden = false;
  el.classList.remove('leaving');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.add('leaving');
    timer = setTimeout(() => {
      el.hidden = true;
    }, 400);
  }, ms);
}
