import { icon } from "../ui/icons";
import { backButton, mainMenuActions, mapLabel, menuBrand, menuHeader } from "../ui/menuChrome";
import { pirateShipArt } from "../ui/worldArt";
import {
  OPERATORS, getOperator, getPack, packsFor,
  readMathProgress, saveMathProgress, trackFor, startVoyage, questionsFor,
  answerQuestion, goldTotal, pendingMathChests, bankedGold, cargoGold,
  type OperatorId, type Voyage, type Question, type AnswerResult,
} from "./academy";
import type { GoldCave } from "./goldCave";
import "./style.css";

type Screen = "home" | "operators" | "map" | "levels" | "question" | "reward" | "ship" | "unloading" | "complete" | "cave" | "settings";
const root = document.querySelector<HTMLDivElement>("#academy")!;
const canvas = document.querySelector<HTMLCanvasElement>("#treasure-scene")!;
const qa = import.meta.env.DEV && new URLSearchParams(location.search).get("qa") === "true";
let storage: Storage | undefined;
try { storage = qa ? sessionStorage : localStorage; } catch { /* Playing still works when storage is unavailable. */ }
const progress = readMathProgress(storage);
if (qa) {
  const fixtureCount = Math.max(0, Math.min(20, Number(new URLSearchParams(location.search).get("cargo")) || 0));
  if (fixtureCount && progress.chests === 0) {
    for (let i = 0; i < fixtureCount; i++) {
      const run = startVoyage(progress, "add-10", i + 1, 27 + i)!;
      for (const q of questionsFor("add-10", run.seed, run.questionSet)) answerQuestion(progress, "add-10", i + 1, q.answer);
    }
    saveMathProgress(progress, storage);
  }
}
let screen: Screen = "home", returnScreen: Screen = "home", caveReturn: Screen = "home";
let operator = progress.operator, packId = progress.pack, level = 1, page = 0;
let voyage: Voyage | null = null, question: Question | null = null, outcome: AnswerResult | null = null;
let answer = "", feedback = "", hinted = false, accepted = false, saveFailed = false;
let cave: GoldCave | null = null, sceneError = false, sceneLoading = false, revealReady = false, viewId = 0;
const art = (file: string, cls = "", alt = "") => `<img class="${cls}" src="${import.meta.env.BASE_URL}assets/map/${file}.webp" alt="${alt}" draggable="false" />`;
const format = (value: number) => value.toLocaleString("en-GB");
const compactGold = (value: number) => value < 10000 ? format(value) : new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const stars = (count: number) => `<span class="stars" aria-label="${count} stars">${[1, 2, 3].map((i) => `<span class="${i <= count ? "earned" : ""}">★</span>`).join("")}</span>`;
const lock = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>`;
const persist = () => { const saved = saveMathProgress(progress, storage); saveFailed = !qa && !saved; };
const selectedPack = () => getPack(packId);
const packTrail = () => trackFor(progress, packId);
const seed = () => {
  const value = new Uint32Array(1);
  try { return crypto.getRandomValues(value)[0]!; }
  catch { return Math.floor(Math.random() * 0x100000000); }
};
const coins = (count: number, spent = 0) => `<span class="hint-coins">${Array.from({ length: count }, (_, i) => `<i class="little-coin ${i < spent ? "spent" : ""}" aria-hidden="true"></i>`).join("")}${count === 0 ? "No coins" : ""}</span>`;

function header(): string {
  const backLabels: Partial<Record<Screen, string>> = {
    operators: "Home", map: "Operators", levels: "Islands", question: "Map", cave: "Map", settings: "Back", complete: "Map", reward: "Map", ship: "Map", unloading: "Map",
  };
  return menuHeader({
    className: "topbar",
    back: screen !== "home" ? backButton({ action: "back", destination: backLabels[screen] ?? "menu" }) : undefined,
    brand: menuBrand({ action: "home", title: "CAPTAIN CALCULUS", subtitle: "A PIRATE MATH ADVENTURE", className: "brand" }),
    actions: `<button class="round-button" data-action="ship" aria-label="Visit your ship, ${pendingMathChests(progress).length} chests aboard">${icon("ship")}</button><button class="gold-bank" data-action="cave" aria-label="Visit your cave, ${format(goldTotal(progress))} gold">${icon("chest")}<span>${compactGold(goldTotal(progress))}<small>gold</small></span></button><button class="round-button" data-action="settings" aria-label="Settings">${icon("wheel")}</button>`,
  });
}
function home(): string {
  const run = packTrail().runs[packTrail().cleared + 1];
  return `<section class="home-view"><div class="night-sky" aria-hidden="true"><div class="moon"></div><div class="moon-glimmer"></div><div class="ocean-lines"></div></div><div class="hero-ship" aria-hidden="true">${pirateShipArt("calculus")}</div><div class="home-copy"><span class="eyebrow">LITTLE SUMS. GRAND ADVENTURES.</span><h1>Captain<br /><span>Calculus</span></h1><p class="tagline">A clever captain. A sea of numbers.<br />A cave full of treasure.</p>${mainMenuActions([{ action: "play", label: "Play", icon: "play", primary: true }, { action: "settings", label: "Settings", icon: "wheel" }, { action: "cave", label: "Cave", icon: "chest" }])}${run?.solved ? `<button class="resume-button" data-action="resume">${icon("ship")} Resume ${getOperator(selectedPack().operator).name.toLowerCase()} · ${run.solved}/10 solved</button>` : ""}</div><div class="home-note"><span>10 right first time</span><i>◆</i><span>100 gold</span><i>◆</i><span>Endless adventures</span></div></section>`;
}
function operatorView(): string {
  return `<section class="operator-view"><div class="page-heading"><span class="eyebrow">FIRST, CHOOSE YOUR COURSE</span><h1>Which waters, Captain?</h1><p>Four ways to find the treasure. Choose what to practice.</p></div><div class="operator-grid">${OPERATORS.map((o, i) => {
    const cleared = packsFor(o.id).reduce((sum, p) => sum + (progress.tracks[p.id]?.cleared ?? 0), 0);
    return `<button class="operator-card" data-operator="${o.id}" style="--accent:${o.color}">${art(["first-sails", "pirate-waters", "whirlpool-straits", "glowing-deep"][i]!, "operator-island")}<span class="operator-symbol">${o.symbol}</span><h2>${o.name}</h2><p>${o.verb}</p><span class="example">${o.sample} = ?</span><span class="operator-footer">${cleared ? `${format(cleared)} levels explored` : "Set off on an adventure"} <span>→</span></span></button>`;
  }).join("")}</div><p class="small-note">Earn 100 gold for ten answers right first time. Hints are free.</p></section>`;
}
function mapView(): string {
  const op = getOperator(operator);
  return `<section class="map-view"><div class="page-heading"><span class="eyebrow">${op.symbol} ${op.name.toUpperCase()}</span><h1>Choose your difficulty</h1><p>Tap an island to choose a level.</p></div><div class="sea-chart"><svg class="chart-route" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true"><path class="route-wide" d="M85 440 C150 475 135 210 280 130 S400 490 500 325 S650 40 710 160 S775 430 890 340"/><path class="route-tall" d="M210 95 C900 100 800 190 430 200 S70 270 240 310 S950 380 770 420 S160 460 300 505"/></svg><span class="chart-sea-label" aria-hidden="true">THE SEA OF POSSIBILITIES</span>${packsFor(operator).map((p, i) => {
    const track = progress.tracks[p.id], cleared = track?.cleared ?? 0;
    return `<button class="map-island island-${i + 1}" data-pack="${p.id}" aria-label="${p.label}: ${p.description}">${art(p.island, "island-art")}${mapLabel({ className: "island-label", title: p.label, subtitle: p.name, detailHtml: cleared ? `${format(cleared)} levels sailed ${icon("flag")}` : `${p.example} = ?` })}</button>`;
  }).join("")}<button class="map-cave" data-action="cave" aria-label="Visit your own treasure cave">${art("treasure-cave")}<span>Your cave</span></button></div><div class="map-legend">${icon("compass")} All difficulties are open. Start where you feel ready.</div></section>`;
}
function levelsView(): string {
  const p = selectedPack(), op = getOperator(p.operator), track = packTrail();
  const next = track.cleared + 1, first = page * 12 + 1;
  return `<section class="levels-view"><div class="page-heading"><span class="eyebrow">${op.symbol} ${op.name.toUpperCase()} · ${p.label.toUpperCase()}</span><h1>${p.name}</h1><p>${p.description}</p></div><div class="level-board"><div class="level-illustration">${art(p.island)}<span class="island-caption">TEN PROBLEMS PER VOYAGE</span></div><div class="level-trail"><div class="trail-heading"><span>Levels ${format(first)}–${format(first + 11)}</span><span>${icon("chest")} 100 gold · no mistakes</span></div><div class="level-grid">${Array.from({ length: 12 }, (_, i) => {
    const n = first + i, locked = n > next, score = track.stars[n] ?? 0, partial = track.runs[n]?.solved;
    return `<button class="level-tile ${n === next ? "current" : ""} ${score ? "completed" : ""}" data-level="${n}" ${locked ? "disabled" : ""} aria-label="Level ${n}${locked ? ", locked" : score ? `, ${score} stars, replay` : partial ? `, resume, ${partial} of 10 solved` : ", start"}"><span class="tile-number" style="font-size:${Math.min(23, Math.max(8, Math.floor(74 / String(n).length)))}px">${n}</span>${locked ? lock : partial ? `<span class="tile-partial">${partial}/10</span>` : n === next ? `<span class="tile-flag">${icon("flag")}</span>` : ""}${stars(score)}</button>`;
  }).join("")}</div><div class="trail-pagination"><button class="text-button" data-action="prev-page" ${page === 0 ? "disabled" : ""}>‹ Earlier levels</button><button class="text-button" data-action="next-page" ${page >= Math.floor(track.cleared / 12) ? "disabled" : ""}>More adventures ›</button></div><button class="wood-button primary set-sail" data-level="${next}">${track.runs[next]?.solved ? "Continue" : "Set sail"} · Level ${format(next)} ${icon("ship")}</button><p class="small-note">The trail keeps going. There is always another voyage.</p></div></div></section>`;
}
function hintView(q: Question): string {
  if (q.operator === "add") return `<p>Put the two piles together. Count all the coins.</p><div class="hint-piles"><div><b>${q.left}</b>${coins(q.left)}</div><span>+</span><div><b>${q.right}</b>${coins(q.right)}</div></div>`;
  if (q.operator === "subtract" && q.left <= 20) return `<p>Start with ${q.left} coins. Cross out ${q.right}. Count what's left.</p>${coins(q.left, q.right)}`;
  if (q.operator === "subtract") {
    const parts = [Math.floor(q.right / 100) * 100, Math.floor(q.right % 100 / 10) * 10, q.right % 10].filter(Boolean);
    return `<p>Start at ${q.left}. Take away ${parts.join(", then ")}.<br />If you need to, trade one ten for ten ones.</p><div class="numberline"><b>${q.left}</b>${parts.map((n) => `<span><small>−${n}</small>←</span>`).join("")}<b>?</b></div>`;
  }
  const groups = q.operator === "multiply" ? q.left : q.right, amount = q.operator === "multiply" ? q.right : q.answer;
  return `<p>${q.operator === "multiply" ? `${groups} crews have ${amount} coins each. Count all their coins.` : `Share ${q.left} coins between ${groups} crews. Count one crew's coins.`}</p><div class="hint-groups">${Array.from({ length: groups }, (_, i) => `<div><small>Crew ${i + 1}</small>${coins(amount)}</div>`).join("")}</div>`;
}
function questionView(): string {
  const p = selectedPack(), op = getOperator(p.operator), q = question!, solved = voyage!.solved;
  const rewardAvailable = voyage!.mistakes === 0;
  const message = accepted ? outcome?.chestEarned ? "Ten right first time! You've earned 100 gold, Captain!" : outcome?.levelComplete ? "Voyage complete! Try the next level for 100 gold." : ["Aye, that's right!", "Clever sailing, Captain!", "Another treasure found!"][solved % 3] : feedback || "Take your time, Captain. You've got this.";
  return `<section class="question-view"><div class="voyage-status"><span>${op.symbol} ${op.name} <i>·</i> ${p.label}</span><b>Level ${format(level)}</b></div><div class="question-progress" aria-label="${solved} of 10 problems solved">${Array.from({ length: 10 }, (_, i) => `<span class="${i < solved ? "solved" : i === solved ? "active" : ""}">${i < solved ? "✓" : i + 1}</span>`).join("")}<span class="progress-chest">${icon("chest")}</span></div><div class="math-card ${accepted ? "correct" : feedback ? "try-again" : ""}"><div class="question-heading"><span class="eyebrow">${accepted && outcome?.levelComplete ? "VOYAGE COMPLETE" : `PROBLEM ${Math.min(solved + (accepted ? 0 : 1), 10)} OF 10`}</span><button class="hint-button" data-action="hint" aria-expanded="${hinted}" ${accepted ? "disabled" : ""}>${icon("compass")} ${hinted ? "Hide hint" : "A little help"}</button></div><div class="equation" aria-label="${q.left} ${op.name === "Addition" ? "plus" : op.name === "Subtraction" ? "minus" : op.name === "Multiplication" ? "times" : "divided by"} ${q.right} equals what?"><span class="term left-term">${q.left}</span><span class="equation-operator">${op.symbol}</span><span class="term right-term">${q.right}</span><span class="equals">=</span><output id="answer" class="answer-box ${answer ? "filled" : ""}" aria-label="Your answer" aria-live="polite">${answer || "?"}</output></div><p id="answer-feedback" class="answer-feedback ${accepted ? "success" : feedback ? "retry" : ""}" role="status">${message}</p><div class="hint-panel" ${hinted ? "" : "hidden"}>${hinted ? hintView(q) : ""}</div><div class="number-pad" aria-label="Number pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}" ${accepted ? "disabled" : ""}>${n}</button>`).join("")}<button class="key-clear" data-key="clear" aria-label="Clear answer" ${accepted ? "disabled" : ""}>Clear</button><button data-key="0" ${accepted ? "disabled" : ""}>0</button><button class="key-delete" data-key="delete" aria-label="Delete last digit" ${accepted ? "disabled" : ""}>⌫</button></div><button id="check-answer" class="wood-button primary check-answer" data-action="${accepted ? "continue" : "check"}" ${!accepted && !answer ? "disabled" : ""}>${accepted ? outcome?.chestEarned ? `Open your chest ${icon("chest")}` : outcome?.levelComplete ? `See your stars ${icon("star")}` : `Next problem ${icon("arrow")}` : `Check answer ${icon("arrow")}`}</button></div><div class="chest-distance">${icon("chest")}<span>${accepted && outcome?.chestEarned ? "100 gold earned!" : rewardAvailable ? "100 gold at stake · one mistake loses this reward" : "0 gold this level · keep practising for the next voyage"}</span><small>Keyboard: numbers & Enter</small></div></section>`;
}
function shipView(reward: boolean): string {
  const pending = pendingMathChests(progress);
  return `<section class="cave-view ship-view">
    <div class="cave-heading"><span class="eyebrow">ABOARD THE BLACK PEARL</span><h1>${reward ? "Treasure, Captain!" : "The treasure hold"}</h1><p>${pending.length} ${pending.length === 1 ? "open chest" : "open chests"} aboard · ${format(cargoGold(progress))} gold coming home</p>${reward && outcome ? stars(outcome.stars) : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} Boarding your ship…</div>
    ${sceneError ? `<div class="cave-fallback">${art("first-sails")}<p>Your chests are saved aboard. Try returning to the cave again.</p></div>` : ""}
    <div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${reward ? "+100 GOLD STOWED ABOARD" : "YOUR SAVED CARGO"}</span><strong>${format(cargoGold(progress))} <span>gold aboard</span></strong><p>${format(bankedGold(progress))} gold already in your cave</p></div><button class="wood-button primary" data-action="unload" ${!pending.length || sceneLoading ? "disabled" : ""}>Return to cave ${icon("chest")}</button><button class="text-button" data-action="${reward ? "reward-next" : "levels"}">${reward ? "Next voyage" : "Keep practising"} ${icon("ship")}</button></div>
  </section>`;
}
function caveView(unloading: boolean): string {
  const gold = bankedGold(progress);
  const status = cave?.unloading;
  const finished = unloading && revealReady;
  const pending = pendingMathChests(progress);
  const heading = unloading ? finished ? "Welcome home, Captain" : "Unloading the ship" : "The golden cave";
  const detail = unloading ? finished ? `${format(gold)} gold safely in your cave` : `Chest ${Math.min((status?.delivered ?? 0) + 1, status?.total ?? pending.length)} of ${status?.total ?? pending.length} · ${format(cargoGold(progress))} gold coming home` : "Explore your cave. Every coin was earned by your calculations.";
  const walkControls = `<div class="cave-walk-controls"><span class="cave-crosshair" aria-hidden="true">+</span><button id="math-cave-pad" aria-label="Move around the cave"><span id="math-cave-thumb"></span><small>Move</small></button><button id="math-cave-jump" aria-label="Jump">↑<small>Jump</small></button><button id="math-cave-inspect" class="text-button" data-action="cave-inspect" disabled>Inspect treasure</button></div>`;
  return `<section class="cave-view ${unloading ? "unloading-view" : "walking-view"}">
    <div class="cave-heading"><span class="eyebrow">${unloading ? "BRINGING YOUR FORTUNE HOME" : "YOUR SECRET PIRATE HIDEOUT"}</span><h1>${heading}</h1><p>${detail}</p></div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} Lighting the lanterns…</div>
    ${sceneError ? `<div class="cave-fallback">${art("treasure-cave")}<p>Your undelivered chests stay safely aboard. Return to try unloading them again.</p></div>` : ""}
    ${!unloading && !sceneError ? walkControls : ""}
    ${unloading ? `<div class="cave-bottom unload-status">${finished ? `<button class="wood-button primary" data-action="stay-cave">Explore your cave ${icon("chest")}</button>` : `<p>Any unopened chests stay safely aboard.</p>`}</div>` : `<div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">THE CAPTAIN'S BANKED GOLD</span><strong>${format(gold)} <span>gold</span></strong><p>${format(cargoGold(progress))} gold aboard · ${format(progress.solved)} problems solved</p></div><div class="cave-actions"><button class="round-button" data-action="cave-reset" aria-label="Return to the cave entrance">${icon("compass")}</button><button class="text-button" data-action="ship">Visit your ship ${icon("ship")}</button></div><p class="cave-controls"><span id="math-cave-room">Cave entrance</span> · WASD to walk · arrows or drag to look · Space to jump</p></div>`}
  </section>`;
}
function completeView(): string {
  return `<section class="complete-view"><span class="eyebrow">${selectedPack().name.toUpperCase()}</span><h1>Well sailed, Captain!</h1>${stars(outcome?.stars ?? 1)}<p>You solved all ten problems in level ${format(level)}.<br />No gold this time: a mistake forfeited the 100-gold reward.<br />The next voyage offers a fresh 100 gold.</p><div class="completion-ship" aria-hidden="true">${pirateShipArt("complete")}</div><button class="wood-button primary" data-action="reward-next">Next voyage ${icon("ship")}</button></section>`;
}
function settingsView(): string {
  return `<section class="settings-view"><div class="page-heading"><span class="eyebrow">THE CAPTAIN'S ORDERS</span><h1>Settings</h1></div><div class="settings-card"><div class="captains-guide"><h2>A little captain's guide</h2><p>Pick an operator, choose a difficulty island, and solve ten problems in each level. New levels keep appearing as you sail.</p><p>Each level offers a chest of 100 gold. Answer all ten problems correctly on your first try to earn it. The first wrong answer forfeits that level’s entire 100-gold reward. Earned chests collect aboard your ship. Return to the cave to pour them out one by one. Gold already in your cave stays safe.</p><p>Take your time and use the free hints before answering. After a mistake, keep practising to finish the level and unlock the next one. Leaving or closing the app does not restore the lost reward. A fresh voyage offers another chance to earn 100 gold.</p><div class="guide-footer">${icon("anchor")} ${saveFailed ? "This browser couldn't save. Keep this tab open to keep your progress." : "Your progress and gold are saved on this device."}</div></div></div></section>`;
}
function render(): void {
  root.dataset.screen = screen;
  root.dataset.operator = operator;
  root.innerHTML = `${header()}<main id="main-content">${{
    home, operators: operatorView, map: mapView, levels: levelsView, question: questionView,
    reward: () => shipView(true), ship: () => shipView(false), unloading: () => caveView(true), cave: () => caveView(false), complete: completeView, settings: settingsView,
  }[screen]()}</main>${saveFailed && screen !== "settings" ? `<div class="save-notice" role="status">Progress can't be saved in this browser. Keep this tab open.</div>` : ""}`;
  document.querySelector("#main-content")!.scrollTop = 0;
}
function show(next: Screen): void {
  viewId++;
  screen = next;
  if (!["cave", "reward", "ship", "unloading"].includes(next)) {
    cave?.pause(); canvas.hidden = true; sceneLoading = false;
  }
  render();
  if (next !== "question") document.querySelector<HTMLElement>("h1")?.setAttribute("tabindex", "-1");
}
async function showTreasure(request: "reward" | "ship" | "cave", unload = true): Promise<void> {
  sceneLoading = !cave; sceneError = false; revealReady = false;
  const next = request === "cave" && unload && pendingMathChests(progress).length ? "unloading" : request;
  show(next);
  const id = viewId;
  // Babylon must measure the displayed canvas, never the hidden 300×150 fallback.
  canvas.hidden = false;
  try {
    if (!cave) {
      const { GoldCave: Scene } = await import("./goldCave");
      if (id !== viewId) return;
      cave = new Scene(canvas, () => {
        if (!["reward", "ship", "unloading"].includes(screen)) return;
        revealReady = true; render();
      }, !qa, () => { persist(); if (screen === "unloading") render(); });
    }
    if (id !== viewId) return;
    if (next === "reward" || next === "ship") cave.showShip(progress, next === "reward");
    else cave.show(progress, next === "unloading");
    canvas.hidden = false;
    sceneLoading = false;
    render();
  } catch (error) {
    console.error("Captain Calculus treasure scene could not open", error);
    if (id !== viewId) return;
    sceneError = true; sceneLoading = false; revealReady = true;
    canvas.hidden = true; render();
  }
}
const showGold = (reward: boolean) => showTreasure(reward ? "reward" : "cave");
function openLevels(): void {
  operator = selectedPack().operator;
  page = Math.floor(packTrail().cleared / 12);
  show("levels");
}
function beginLevel(n: number): void {
  const run = startVoyage(progress, packId, n, seed());
  if (!run) return;
  voyage = run; level = n; outcome = null;
  progress.pack = packId; progress.operator = selectedPack().operator; operator = progress.operator;
  persist(); nextProblem();
}
function nextProblem(): void {
  answer = ""; feedback = ""; hinted = false; accepted = false; outcome = null;
  question = questionsFor(packId, voyage!.seed, voyage!.questionSet)[voyage!.solved]!;
  show("question");
}
function enterKey(key: string): void {
  if (screen !== "question" || accepted) return;
  if (key === "delete") answer = answer.slice(0, -1);
  else if (key === "clear") answer = "";
  else if (/^\d$/.test(key) && answer.length < 3) answer = answer === "0" ? key : answer + key;
  feedback = "";
  const output = root.querySelector<HTMLOutputElement>("#answer")!;
  output.textContent = answer || "?"; output.classList.toggle("filled", !!answer);
  root.querySelector<HTMLButtonElement>("#check-answer")!.disabled = !answer;
  const message = root.querySelector<HTMLElement>("#answer-feedback")!;
  message.textContent = "Take your time, Captain. You've got this."; message.classList.remove("retry");
  root.querySelector(".math-card")!.classList.remove("try-again");
}
function checkAnswer(): void {
  if (screen !== "question" || accepted || !answer) return;
  const firstMistake = voyage!.mistakes === 0;
  const result = answerQuestion(progress, packId, level, Number(answer));
  if (!result) return;
  persist();
  if (result.correct) { accepted = true; outcome = result; }
  else { feedback = firstMistake ? "Not quite. You lost this level’s 100 gold. Take your time and try again; hints are free." : "Not quite. Try a free hint and work it out. A new voyage offers another 100 gold."; answer = ""; }
  render();
}
function continueAfterAnswer(): void {
  if (!accepted || !outcome) return;
  if (outcome.chestEarned) { void showGold(true); }
  else if (outcome.levelComplete) show("complete");
  else nextProblem();
}
function nextVoyage(): void {
  if (screen === "reward" && !revealReady && !sceneError) return;
  if (outcome?.levelComplete) beginLevel(Math.max(level + 1, packTrail().cleared + 1));
  else if (voyage && packTrail().runs[level]) nextProblem();
  else openLevels();
}
function goBack(): void {
  if (screen === "home") return;
  if (screen === "operators") show("home");
  else if (screen === "map") show("operators");
  else if (screen === "levels") show("map");
  else if (screen === "settings") { const previous = returnScreen; if (["cave", "reward", "ship", "unloading"].includes(previous)) void showTreasure(previous === "reward" ? "reward" : previous === "ship" ? "ship" : "cave"); else show(previous); }
  else if (screen === "cave") { if (caveReturn === "question" && voyage && packTrail().runs[level] && !accepted) show("question"); else if (caveReturn === "home") show("home"); else openLevels(); }
  else openLevels();
}

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.dataset.operator) {
    operator = button.dataset.operator as OperatorId;
    progress.operator = operator;
    if (selectedPack().operator !== operator) packId = packsFor(operator)[0]!.id;
    progress.pack = packId; persist(); show("map"); return;
  }
  if (button.dataset.pack) { packId = button.dataset.pack; progress.pack = packId; persist(); openLevels(); return; }
  if (button.dataset.level) { beginLevel(Number(button.dataset.level)); return; }
  if (button.dataset.key) { enterKey(button.dataset.key); return; }
  switch (button.dataset.action) {
    case "home": show("home"); break;
    case "play": show("operators"); break;
    case "back": goBack(); break;
    case "settings":
      if (screen !== "settings") returnScreen = screen;
      show("settings"); break;
    case "cave": caveReturn = screen; void showGold(false); break;
    case "stay-cave": caveReturn = "levels"; void showTreasure("cave", false); break;
    case "ship": caveReturn = screen; void showTreasure("ship"); break;
    case "unload": caveReturn = "ship"; void showTreasure("cave"); break;
    case "cave-map": operator = selectedPack().operator; show("map"); break;
    case "cave-reset": cave?.resetCamera(); break;
    case "cave-inspect": cave?.inspect(); break;
    case "resume": beginLevel(packTrail().cleared + 1); break;
    case "prev-page": page = Math.max(0, page - 1); render(); break;
    case "next-page": page = Math.min(Math.floor(packTrail().cleared / 12), page + 1); render(); break;
    case "levels": openLevels(); break;
    case "hint": hinted = !hinted; render(); break;
    case "check": checkAnswer(); break;
    case "continue": continueAfterAnswer(); break;
    case "reward-next": nextVoyage(); break;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else goBack();
    return;
  }
  if (screen !== "question") return;
  if (/^\d$/.test(event.key)) { event.preventDefault(); enterKey(event.key); }
  else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); enterKey("delete"); }
  else if (event.key === "Enter") { event.preventDefault(); if (accepted) continueAfterAnswer(); else checkAnswer(); }
});
render();
if (qa) {
  const view = new URLSearchParams(location.search).get("view");
  if (view === "ship") void showTreasure("ship");
  else if (view === "unload") void showTreasure("cave");
}
