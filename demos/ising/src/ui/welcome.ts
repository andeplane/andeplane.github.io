/**
 * First-visit onboarding: a compact welcome card that says what this is and the one
 * thing to do first, then hands off to a spotlight on the temperature dock. Shown once
 * (localStorage) and reopenable from the ? chip. Deliberately a single card, not a
 * multi-step tour — the lab should teach itself once the reader finds the slider.
 */

const SEEN_KEY = 'ising-welcomed';

export function shouldWelcome(): boolean {
  return localStorage.getItem(SEEN_KEY) === null;
}

export function showWelcome(tc: number): Promise<void> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.id = 'welcome';
    dialog.innerHTML = `
      <h1>A phase transition you can hold</h1>
      <p class="welcome-lede">
        Every pixel is a tiny magnet, flipping millions of times a second on your GPU.
        They only talk to their neighbors — yet together they do something sharp and
        dramatic at one exact temperature.
      </p>
      <ol class="welcome-steps">
        <li>
          <i>🌡</i>
          <span><strong>Drag the temperature slider</strong> at the bottom of the
          screen. Go slowly through the marked T<sub>c</sub> = ${tc.toFixed(2)} and
          watch noise become order.</span>
        </li>
        <li>
          <i>❄</i>
          <span><strong>Quench</strong> for an instant deep-freeze, then reheat and
          melt it again.</span>
        </li>
        <li>
          <i>✏️</i>
          <span><strong>Draw on it</strong> — drag on the lattice to paint spins, and
          watch physics erode your art.</span>
        </li>
      </ol>
      <p class="welcome-note">
        The charts on the right are measured live from <em>your</em> run — park the
        slider at a few temperatures and your dots will land on a curve computed by
        hand in 1944.
      </p>
      <button type="button" class="welcome-go">Let’s go</button>
    `;
    // The flag is only stamped on an explicit dismissal. Stamping it on show would
    // let any unattended appearance (e.g. an auto-reload) permanently swallow the
    // onboarding for a user who never actually read it.
    const close = () => {
      localStorage.setItem(SEEN_KEY, '1');
      dialog.close();
      dialog.remove();
      resolve();
    };
    dialog.querySelector('.welcome-go')!.addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('cancel', () => {
      localStorage.setItem(SEEN_KEY, '1');
      dialog.remove();
      resolve();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * After the welcome closes, point at the dock until the user actually uses it.
 * Returns a function to dismiss the hint (call on first temperature interaction).
 */
export function spotlightDock(): () => void {
  const dock = document.getElementById('tempdock')!;
  dock.classList.add('spotlight');
  const hint = document.createElement('div');
  hint.id = 'dockhint';
  hint.innerHTML = 'drag the temperature <span class="dockhint-arrow">↓</span>';
  document.body.append(hint);
  let dismissed = false;
  return () => {
    if (dismissed) return;
    dismissed = true;
    dock.classList.remove('spotlight');
    hint.classList.add('leaving');
    setTimeout(() => hint.remove(), 400);
  };
}
