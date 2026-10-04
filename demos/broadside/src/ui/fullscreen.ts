import { icon } from "./icons";
import { Capacitor } from "@capacitor/core";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

/** Fullscreen the whole game: canvas, menus and touch controls stay together. */
export function installFullscreen(ui: HTMLElement, resize: () => void) {
  const doc = document as FullscreenDocument;
  const root = document.documentElement as FullscreenRoot;
  const appMode = matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
  const standalone = () => Capacitor.isNativePlatform() || appMode.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const active = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  const button = document.createElement("button");
  button.id = "game-fullscreen";
  button.className = "round";
  ui.append(button);

  const help = document.createElement("dialog");
  help.id = "fullscreen-help";
  help.setAttribute("aria-labelledby", "fullscreen-help-title");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  help.innerHTML = `<h2 id="fullscreen-help-title">A screen full of adventure</h2>
    ${ios ? `<p>Play without Safari’s bars:</p><ol><li>Tap <b>Share</b> in Safari.</li><li>Choose <b>Add to Home Screen</b> and keep <b>Open as Web App</b> turned on, if shown.</li><li>Open <b>Broadside</b> from your Home Screen.</li></ol>` : `<p>This browser could not enter fullscreen. Open the game directly in Safari, Chrome, Edge or Firefox and try the fullscreen button again.</p>`}
    <button class="primary" autofocus>Got it</button>`;
  ui.append(help);
  help.querySelector("button")!.onclick = () => help.close();
  // A modal must not also steer, jump or dismiss the underlying game.
  help.addEventListener("keydown", (event) => event.stopPropagation());
  help.addEventListener("click", (event) => {
    if (event.target === help) {
      const rect = help.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) help.close();
    }
  });

  const update = () => {
    const full = active();
    if (full && help.open) help.close();
    root.dataset.fullscreen = full ? "on" : standalone() ? "app" : "off";
    button.hidden = standalone() && !full;
    button.setAttribute("aria-label", full ? "Exit fullscreen" : "Enter fullscreen");
    button.setAttribute("aria-pressed", String(full));
    button.title = full ? "Exit fullscreen" : "Enter fullscreen";
    button.innerHTML = icon(full ? "fullscreenExit" : "fullscreen");
    requestAnimationFrame(resize);
  };
  button.onclick = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    button.disabled = true;
    const entering = !active();
    try {
      if (active()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (root.requestFullscreen) {
        const request = root.requestFullscreen({ navigationUI: "hide" });
        // Some embedded WebViews leave this promise pending indefinitely.
        await Promise.race([request, new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            if (!active()) help.showModal();
            resolve();
          }, 2500);
        })]);
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      } else help.showModal();
      if (entering && !active() && !help.open) help.showModal();
    } catch {
      // iPhone and embedded browsers can decline DOM fullscreen.
      // Never present a CSS-only stretch as hiding the browser's chrome.
      help.showModal();
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
    }
    update();
  };
  doc.addEventListener("fullscreenchange", update);
  doc.addEventListener("webkitfullscreenchange", update);
  appMode.addEventListener("change", update);
  update();
}
