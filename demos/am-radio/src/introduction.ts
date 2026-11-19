/** Native dialog supplies focus trapping, Escape dismissal and inert background content. */
export function setupIntroduction(startListening: () => void) {
  const dialog = document.createElement("dialog");
  dialog.className = "welcome";
  dialog.setAttribute("aria-labelledby", "welcome-title");
  dialog.setAttribute("aria-describedby", "welcome-purpose");
  dialog.innerHTML = `
    <div class="welcome-top"><span class="eyebrow">WELCOME TO AM RADIO LAB</span><button type="button" class="welcome-close" aria-label="Close introduction">×</button></div>
    <h2 id="welcome-title" tabindex="-1">How does a radio work?</h2>
    <p id="welcome-purpose">Five virtual stations are broadcasting at once. How can a few electrical components pick out one voice or song? This lab lets you hear the answer—and follow the signal from the transmitter's current, through the electromagnetic field and a wire antenna, into the circuit that produces the sound.</p>
    <div class="welcome-path" aria-label="Signal path"><span>Modulated field</span><b>→</b><span>Dipole antenna</span><b>→</b><span>Tuned circuit</span><b>→</b><span>Recovered sound</span></div>
    <ol class="welcome-steps">
      <li><b>Listen.</b><p>Start with a real 1933 radio speech. The other stations carry piano, bells and a test tone.</p></li>
      <li><b>Move the plates.</b><p>Their separation changes capacitance and resonance. Sweep the tuning and hear a different station emerge.</p></li>
      <li><b>Break the chain.</b><p>Turn the antenna away from the field, or disconnect the diode. Watch the scopes explain what disappears and where.</p></li>
    </ol>
    <div class="welcome-models"><h3>What is being simulated?</h3><p><b>The radio you hear:</b> five transmitters radiate modulated plane waves along a one-dimensional Maxwell grid; the field at the receiver induces charge on a 2 m dipole whose port is solved from its geometry; that port drives a coupled tank, diode, detector and amplifier. The measured 8 Ω voltage makes the sound.</p><p><b>The waves you can explore:</b> a WebGPU solution of Maxwell's equations in two dimensions, with a screen for reflection and diffraction. Its slow mode feeds the same antenna and receiver from the 2D field, thousands of times slower than real time.</p><p><b>What is still an approximation</b> is labelled where it appears: an antenna port evaluated at the band centre, a one-dimensional path, a piecewise-linear diode, an ideal amplifier and a resistor for a speaker.</p></div>
    <p class="welcome-theory">No radio knowledge needed. The theory and history below the bench build up the explanation.</p>
    <div class="welcome-actions"><button type="button" class="primary" id="welcome-listen">▶ Start listening</button><button type="button" id="welcome-explore">Explore the bench</button></div>`;
  document.body.append(dialog);
  const opener = document.querySelector<HTMLButtonElement>("#about-lab")!;
  const show = () => {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("#welcome-title")!.focus();
  };
  const dismiss = () => dialog.close();
  opener.addEventListener("click", show);
  dialog.querySelector(".welcome-close")!.addEventListener("click", dismiss);
  dialog.querySelector("#welcome-explore")!.addEventListener("click", dismiss);
  dialog.querySelector("#welcome-listen")!.addEventListener("click", () => {
    dismiss();
    startListening();
  });
  dialog.addEventListener("close", () => {
    try {
      sessionStorage.setItem("am-radio-introduction-seen", "1");
    } catch {
      /* Browsing with storage disabled still works. */
    }
    opener.focus({ preventScroll: true });
  });
  let seen = false;
  try {
    seen = sessionStorage.getItem("am-radio-introduction-seen") === "1";
  } catch {
    /* Show the introduction without persistence. */
  }
  if (!seen) show();
}
