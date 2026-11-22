import { ISLAND_DESTINATIONS, ISLAND_PACKS, type IslandSettings } from "../src/game/landfall";
import type { LightSetting } from "../src/render/landfallSky";
import { icon } from "../src/ui/icons";
import "./studio.css";

interface StudioState {
  light: LightSetting;
  world: number;
  seed: number;
  settings: IslandSettings;
}

interface StudioActions {
  light(value: LightSetting): void;
  change(world: number, seed: number, settings: IslandSettings): void;
  walk(): void;
  chart(): void;
}

const ranges = [
  ["relief", "Mountain height"],
  ["beach", "Beach width"],
  ["vegetation", "Vegetation density"],
] as const;

const compass = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <circle cx="24" cy="24" r="17.5" stroke="currentColor" opacity=".75"/>
  <path d="M24 1.5 27.7 20.3 46.5 24 27.7 27.7 24 46.5 20.3 27.7 1.5 24 20.3 20.3Z" fill="currentColor"/>
  <path d="m24 4 0 20 3-3.1Zm19 20H24l3.1 3ZM24 43V24l-3.1 3Zm-19-19h19l-3-3.1Z" fill="#31504c"/>
  <circle cx="24" cy="24" r="2.4" fill="currentColor"/></svg>`;
const dice = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.7" transform="rotate(-8 12 12)"/><g fill="currentColor" transform="rotate(-8 12 12)"><circle cx="8" cy="8" r="1.45"/><circle cx="16" cy="8" r="1.45"/><circle cx="12" cy="12" r="1.45"/><circle cx="8" cy="16" r="1.45"/><circle cx="16" cy="16" r="1.45"/></g></svg>`;
const boat = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2-7 10h7V2Zm2 3v7h5l-5-7Z" fill="currentColor"/><path d="M2.5 15h19l-4.5 5H7l-4.5-5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

export function createStudio(initial: StudioState, actions: StudioActions) {
  let world = initial.world, seed = initial.seed;
  const settings = { ...initial.settings };
  const root = document.getElementById("studio")!;
  root.innerHTML = `
    <aside class="atlas-sheet" aria-label="Island generator">
      <header class="atlas-masthead">
        <span class="atlas-rose">${compass}</span>
        <div><span class="atlas-brand">Broadside</span><h1>Island Atlas</h1></div>
        <button type="button" class="atlas-fold" aria-expanded="false" aria-controls="atlas-options">Settings</button>
      </header>
      <div class="atlas-scroll" id="atlas-options">
        <label class="atlas-field"><span>Level pack</span><select name="world">${ISLAND_PACKS.map((p, i) => `<option value="${i}">${p}</option>`).join("")}</select></label>
        <div class="atlas-field"><label for="atlas-seed">Island seed</label>
          <div class="atlas-seed-row"><input id="atlas-seed" type="number" min="0" max="4294967295" step="1" inputmode="numeric" required>
            <button type="button" class="atlas-reroll" aria-label="Generate a new seed" title="Generate a new seed">${dice}</button></div></div>
        <label class="atlas-field"><span>Biome</span><select name="biome">
          <option value="tropical">Tropical</option><option value="temperate">Temperate</option>
          <option value="alpine">Alpine</option><option value="winter">Winter</option></select></label>
        <label class="atlas-field"><span>Lighting</span><select name="light">
          <option value="pack">Level pack lighting</option><option value="day">Daylight</option>
          <option value="sunset">Sunset</option><option value="night">Starry night</option></select></label>
        <div class="atlas-scales">${ranges.map(([key, label]) => `<div class="atlas-scale"><label for="atlas-${key}">${label}</label><output for="atlas-${key}"></output><input id="atlas-${key}" type="range" min="0" max="100" step="1"></div>`).join("")}</div>
        <fieldset class="atlas-settlement"><legend>Settlement</legend><div>${(["none","hamlet","village"] as const).map(s => `<label><input name="settlement" type="radio" value="${s}"><span>${s[0]!.toUpperCase() + s.slice(1)}</span></label>`).join("")}</div></fieldset>
      </div>
      <footer class="atlas-foot"><button type="button" class="atlas-walk" disabled>${boat}<span>Go ashore</span></button></footer>
    </aside>
    <div class="atlas-caption"><div><h2></h2><p></p></div><button class="atlas-map" type="button" aria-label="Treasure map" aria-haspopup="dialog" aria-keyshortcuts="M">${icon("map")} Map</button></div>
    <div class="atlas-camera-help"><span class="atlas-mouse-help">Drag to orbit · Scroll to zoom</span><span class="atlas-touch-help">Drag to orbit · Pinch to zoom</span></div>
  `;
  const el = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const foldButton = el<HTMLButtonElement>(".atlas-fold");
  const walkButton = el<HTMLButtonElement>(".atlas-walk");
  const mapButton = el<HTMLButtonElement>(".atlas-map");
  mapButton.onclick = actions.chart;
  const seedInput = el<HTMLInputElement>("#atlas-seed");
  const worldSelect = el<HTMLSelectElement>("select[name=world]");
  const biomeSelect = el<HTMLSelectElement>("select[name=biome]");
  const light = el<HTMLSelectElement>("select[name=light]");
  light.value = initial.light;
  light.onchange = () => actions.light(light.value as LightSetting);
  const caption = el<HTMLHeadingElement>(".atlas-caption h2");
  const details = el<HTMLParagraphElement>(".atlas-caption p");
  const compact = matchMedia("(max-width: 700px) and (orientation: portrait), (max-height: 520px)");
  const fold = (open: boolean) => {
    root.classList.toggle("atlas-open", open);
    foldButton.setAttribute("aria-expanded", String(open));
    foldButton.textContent = open ? "Done" : "Settings";
  };
  compact.addEventListener("change", () => fold(false));
  foldButton.onclick = () => fold(!root.classList.contains("atlas-open"));
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && compact.matches && root.classList.contains("atlas-open")) {
      fold(false);
      foldButton.focus();
    }
  });
  const updateCaption = () => {
    caption.textContent = ISLAND_DESTINATIONS[world]?.name ?? "Treasure Island";
    details.textContent = `${biomeSelect.selectedOptions[0]?.text ?? "Island"} · Seed ${seed}`;
  };
  const change = () => {
    updateCaption();
    actions.change(world, seed, { ...settings });
  };
  seedInput.value = String(seed);
  worldSelect.value = String(world);
  biomeSelect.value = settings.biome;
  worldSelect.onchange = () => { world = Number(worldSelect.value); change(); };
  biomeSelect.onchange = () => { settings.biome = biomeSelect.value as IslandSettings["biome"]; change(); };
  seedInput.onchange = () => {
    const next = seedInput.valueAsNumber;
    if (!seedInput.validity.valid || !Number.isSafeInteger(next)) {
      seedInput.reportValidity();
      return;
    }
    if (next !== seed) { seed = next; change(); }
  };
  seedInput.onkeydown = e => {
    if (e.key === "Enter" && seedInput.reportValidity()) seedInput.blur();
    if (e.key === "Escape") { seedInput.value = String(seed); seedInput.blur(); }
  };
  el<HTMLButtonElement>(".atlas-reroll").onclick = () => {
    seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    seedInput.value = String(seed);
    change();
  };
  for (const [key] of ranges) {
    const input = el<HTMLInputElement>(`#atlas-${key}`);
    const output = el<HTMLOutputElement>(`output[for=atlas-${key}]`);
    const readout = () => {
      output.value = `${input.value}%`;
      input.style.setProperty("--fill", output.value);
      input.setAttribute("aria-valuetext", output.value);
    };
    input.value = String(Math.round(settings[key] * 100));
    readout();
    input.oninput = readout;
    input.onchange = () => { settings[key] = Number(input.value) / 100; change(); };
  }
  root.querySelectorAll<HTMLInputElement>("input[name=settlement]").forEach(input => {
    input.checked = input.value === settings.settlement;
    input.onchange = () => {
      if (input.checked) { settings.settlement = input.value as IslandSettings["settlement"]; change(); }
    };
  });
  walkButton.onclick = () => {
    if (!seedInput.validity.valid) {
      if (compact.matches) fold(true);
      seedInput.focus();
      seedInput.reportValidity();
      return;
    }
    actions.walk();
  };
  updateCaption();
  return {
    hide() { root.hidden = true; document.body.classList.remove("atlas-overview"); fold(false); },
    show() { root.hidden = false; document.body.classList.add("atlas-overview"); },
    setReady(ready: boolean) { walkButton.disabled = mapButton.disabled = !ready; },
  };
}
