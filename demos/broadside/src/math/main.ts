import { difficultyMap } from "../ui/difficultyMap";
import { installPrivacy } from "../ui/privacy";
import { installMenuPreview } from "../ui/menuPreview";
import { icon } from "../ui/icons";
import { backButton, mapLabel, menuHeader } from "../ui/menuChrome";
import { pirateShipArt } from "../ui/worldArt";
import { homeMenu } from "../ui/homeMenu";
import { worldFor } from "./worlds";
import { expeditionTrail, extendTrailWindow, initialTrailWindow, REGION_HEIGHT, LEVELS_PER_REGION, type TrailWindow } from "../ui/expeditionTrail";
import { mountMapPan, type MapCamera, type MapPanController } from "../ui/mapPan";
import {
  OPERATORS, getOperator, getPack, packsFor,
  readMathProgress, saveMathProgress, trackFor, startVoyage, questionsFor,
  answerQuestion, goldTotal, pendingMathChests, bankedGold, cargoGold,
  type OperatorId, type Voyage, type Question, type AnswerResult,
} from "./academy";
import type { GoldCave } from "./goldCave";
import "./style.css";

type Screen = "home" | "operators" | "map" | "levels" | "question" | "reward" | "ship" | "unloading" | "complete" | "cave" | "settings";
installMenuPreview();
installPrivacy();
const root = document.querySelector<HTMLDivElement>("#academy")!;
const canvas = document.querySelector<HTMLCanvasElement>("#treasure-scene")!;
const qa = import.meta.env.DEV && new URLSearchParams(location.search).get("qa") === "true";
let storage: Storage | undefined;
try { storage = qa ? new URLSearchParams(location.search).get("fresh") === "1" ? undefined : sessionStorage : localStorage; } catch { /* Playing still works when storage is unavailable. */ }
const progress = readMathProgress(storage);
if (qa) {
  const fixturePack = new URLSearchParams(location.search).get("pack");
  if (fixturePack && getPack(fixturePack).id === fixturePack) {
    progress.pack = fixturePack; progress.operator = getPack(fixturePack).operator;
  }
  const fixtureBank = Number(new URLSearchParams(location.search).get("banked") ?? 0);
  if (Number.isSafeInteger(fixtureBank) && fixtureBank > 0 && fixtureBank <= 1_000_000)
    progress.banks[progress.operator] = fixtureBank;
  const previewCleared = Math.max(0, Math.min(120, Math.floor(Number(new URLSearchParams(location.search).get("cleared")) || 0)));
  if (previewCleared && progress.solved === 0) {
    const track = trackFor(progress, progress.pack);
    track.cleared = previewCleared;
    for (let n = 1; n <= previewCleared; n++) track.stars[n] = 3;
  }
  const fixtureCount = Math.max(0, Math.min(20, Number(new URLSearchParams(location.search).get("cargo")) || 0));
  if (fixtureCount && progress.chests === 0) {
    for (let i = 0; i < fixtureCount; i++) {
      const run = startVoyage(progress, "add-10", i + 1, 27 + i)!;
      for (const q of questionsFor("add-10", run.seed, run.questionSet)) answerQuestion(progress, "add-10", i + 1, q.answer);
    }
    saveMathProgress(progress, storage);
  }
}
let screen: Screen = "home", returnScreen: Screen = "home", caveReturn: Screen = "home", shipReturn: Screen = "home";
let operator = progress.operator, packId = progress.pack, level = 1;
let trailWindow: TrailWindow = initialTrailWindow(1);
let trailCamera: MapCamera | undefined;
let mapPan: MapPanController | null = null;
const packCameras = new Map<OperatorId, MapCamera>();
let voyage: Voyage | null = null, question: Question | null = null, outcome: AnswerResult | null = null;
let answer = "", feedback = "", hinted = false, accepted = false, saveFailed = false;
let cave: GoldCave | null = null, sceneError = false, sceneLoading = false, revealReady = false, viewId = 0;
const art = (file: string, cls = "", alt = "") => `<img class="${cls}" src="${import.meta.env.BASE_URL}assets/map/${file}.webp" alt="${alt}" draggable="false" />`;
const format = (value: number) => value.toLocaleString("en-GB");
const navNumber = (value: number) => value < 1000 ? format(value) : new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const stars = (count: number) => `<span class="stars" aria-label="${count} stars">${[1, 2, 3].map((i) => `<span class="${i <= count ? "earned" : ""}">★</span>`).join("")}</span>`;
const lock = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>`;
const persist = () => {
  const saved = saveMathProgress(progress, storage);
  saveFailed = qa ? new URLSearchParams(location.search).get("fail") === "save" : !saved;
};
const selectedPack = () => getPack(packId);
const packTrail = () => trackFor(progress, packId);
const resumeRun = () => {
  const track = packTrail();
  if (voyage && track.runs[voyage.level] === voyage) return voyage;
  return track.runs[track.cleared + 1] ?? Object.values(track.runs).sort((a, b) => b.level - a.level)[0];
};
const seed = () => {
  const value = new Uint32Array(1);
  try { return crypto.getRandomValues(value)[0]!; }
  catch { return Math.floor(Math.random() * 0x100000000); }
};
const coins = (count: number, spent = 0) => `<span class="hint-coins">${Array.from({ length: count }, (_, i) => `<i class="little-coin ${i < spent ? "spent" : ""}" aria-hidden="true"></i>`).join("")}${count === 0 ? "No coins" : ""}</span>`;

function header(): string {
  if (screen === "home") return "";
  const backLabels: Partial<Record<Screen, string>> = {
    operators: "Home", map: "Operators", levels: "Islands", question: "Map", cave: "Map", settings: "menu", complete: "Map", reward: "Map", ship: "Map", unloading: "Map",
  };
  const pending = pendingMathChests(progress).length;
  return menuHeader({
    className: "topbar",
    back: backButton({ action: "back", destination: screen === "ship" ? shipReturn === "home" ? "Home" : shipReturn === "question" ? "problem" : shipReturn === "cave" ? "cave" : "level map" : screen === "cave" || screen === "unloading" ? caveReturn === "home" ? "Home" : caveReturn === "ship" || caveReturn === "reward" ? "ship" : caveReturn === "question" ? "problem" : "level map" : backLabels[screen] ?? "menu" }),
    brand: "",
    actions: `<button class="pirate-nav-link" data-action="ship" aria-label="Ship, ${pending} ${pending === 1 ? "chest" : "chests"} aboard">${icon("ship")}<span>Ship<small>${navNumber(pending)} ${pending === 1 ? "chest" : "chests"}</small></span></button><button class="pirate-nav-link" data-action="cave" aria-label="Cave, ${format(bankedGold(progress))} gold banked${pending ? `, unload ${pending} ${pending === 1 ? "chest" : "chests"}` : ""}">${icon("chest")}<span>Cave<small>${navNumber(bankedGold(progress))} gold</small></span></button>`,
  });
}
function home(): string {
  const run = resumeRun();
  const pending = pendingMathChests(progress).length;
  const canResume = !!run;
  return `<section class="pirate-home-shell">${homeMenu({
    title: ["Captain", "Calculus"],
    eyebrow: "A PIRATE MATH ADVENTURE",
    description: "Solve a little. Bring home a fortune.",
    illustration: pirateShipArt("calculus"),
    primary: canResume
      ? { action: "resume", label: "Continue", detail: `${getOperator(selectedPack().operator).name} · Level ${format(run.level)} · ${run.solved}/10 solved` }
      : { action: "play", label: "Play", detail: "Choose what to practise" },
    chooseLevels: canResume ? { action: "play", label: "Choose another level" } : undefined,
    ship: { action: "ship", icon: "ship", title: "Your ship", value: pending ? `${format(pending)} ${pending === 1 ? "chest" : "chests"} aboard` : "No chests aboard", detail: pending ? `${format(cargoGold(progress))} gold to bring home` : "Your next reward goes here" },
    cave: { action: "cave", icon: "chest", title: "Your cave", value: `${format(bankedGold(progress))} gold saved`, detail: pending ? `Unload ${pending} ${pending === 1 ? "chest" : "chests"} here` : "Explore your treasure" },
    settings: { action: "settings", label: "How to play" },
    rule: "100 gold per first-try answer. Up to 1,000 per level.",
  })}</section>`;
}
function operatorView(): string {
  return `<section class="operator-view"><div class="page-heading"><span class="eyebrow">FOUR WORLDS TO EXPLORE</span><h1>Choose your adventure</h1><p>Each kind of maths has its own corner of the world.</p></div><div class="operator-grid">${OPERATORS.map((o) => {
    const world = worldFor(o.id);
    const cleared = packsFor(o.id).reduce((sum, p) => sum + (progress.tracks[p.id]?.cleared ?? 0), 0);
    return `<button class="operator-card world-card" data-operator="${o.id}" style="--accent:${world.accent};--world-ocean:${world.ocean}" aria-label="${o.name}: ${world.name}"><img class="operator-world-art" src="${import.meta.env.BASE_URL}${world.image}" alt="" draggable="false" /><span class="operator-world-shade" aria-hidden="true"></span><span class="operator-symbol">${o.symbol}</span><span class="operator-copy"><small class="operator-world-name">${world.name}</small><h2>${o.name}</h2><span class="example">${o.sample} = ?</span><span class="operator-footer">${cleared ? `${format(cleared)} ${cleared === 1 ? "level" : "levels"} sailed` : "Explore this world"} ${icon("arrow")}</span></span></button>`;
  }).join("")}</div><p class="small-note">Four different worlds. The same 100 gold for every first-try answer.</p></section>`;
}
function mapView(): string {
  const op = getOperator(operator), world = worldFor(operator), packs = packsFor(operator);
  const stops = [{x:350,y:1450},{x:850,y:1130},{x:380,y:890},{x:860,y:620},{x:390,y:330}];
  return difficultyMap({world,eyebrow:`${op.symbol} ${op.name.toUpperCase()}`,instructions:"Drag the map. Choose your difficulty.",baseUrl:import.meta.env.BASE_URL,selected:packId,footer:"Five difficulties · all open",centerLabel:"Current island",route:"M350 1450 C520 1440 700 1170 850 1130 S540 980 380 890 S690 700 860 620 S560 410 390 330",stops:packs.map((p,i)=>{const cleared=progress.tracks[p.id]?.cleared??0,stop=stops[i]!;return {id:p.id,...stop,number:i+1,label:p.label,ariaLabel:`${p.label}: ${p.description}`,description:world.chapterNames[i]!,example:`${p.example} = ?`,detail:cleared?`${format(cleared)} ${cleared===1?"level":"levels"} sailed`:"Start exploring"};})});
}
function levelsView(): string {
  const p = selectedPack(), op = getOperator(p.operator);
  const practiceRule = p.operator === "add" ? `Sums stay at ${p.limit} or below, however far you sail.` : "Explore new shores. The maths stays at this difficulty.";
  return expeditionTrail({ operator: p.operator, packName: p.name, packLabel: p.label, operatorName: op.name, practiceRule, baseUrl: import.meta.env.BASE_URL, window: trailWindow, track: packTrail() });
}
function mountMathMap(scroller: HTMLElement): void {
  scroller.scrollTop = scroller.scrollLeft = 0;
  const viewport = scroller.querySelector<HTMLElement>("[data-map-viewport]");
  const world = viewport?.querySelector<HTMLElement>("[data-map-world]");
  if (!viewport || !world) return;
  const isTrail = screen === "levels", mapOperator = operator;
  mapPan = mountMapPan(viewport, world, {
    focus: { x: Number(viewport.dataset.focusX) || world.offsetWidth / 2, y: Number(viewport.dataset.focusY) || world.offsetHeight / 2 },
    scale: Number(viewport.dataset.mapScale) || 1,
    state: isTrail ? trailCamera : packCameras.get(mapOperator),
    onChange: state => { if (isTrail) trailCamera = state; else packCameras.set(mapOperator, state); },
    onCenter: isTrail ? () => openLevels() : undefined,
  });
}
function exploreTrail(direction: "earlier" | "further"): void {
  const previous = trailWindow;
  const camera = mapPan?.getState();
  trailWindow = extendTrailWindow(trailWindow, direction);
  if (camera) trailCamera = { ...camera, y: camera.y + (trailWindow.first - previous.first) / LEVELS_PER_REGION * REGION_HEIGHT * camera.scale };
  render();
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
  const earned = voyage!.earnedGold;
  const rewardAvailable = voyage!.problemMistakes === 0;
  const stake = accepted ? outcome?.goldEarned ? "+100 gold for this answer" : "No gold for this answer · the next problem offers 100" : rewardAvailable ? "100 gold at stake for this problem · first try only" : "This problem’s 100 gold is lost · retries cost nothing more";
  const message = accepted ? outcome?.levelComplete ? `Level complete! ${format(outcome.levelGold)} gold earned, Captain!` : outcome?.goldEarned ? "Aye, that’s right! +100 gold." : "That’s right. The next problem offers a fresh 100 gold." : feedback || "100 gold for a first-try answer. Take your time, Captain.";
  return `<section class="question-view"><div class="voyage-status"><span>${op.symbol} ${op.name} <i>·</i> ${p.label}</span><b>Level ${format(level)}</b></div><div class="question-progress" aria-label="${solved} of 10 problems solved">${Array.from({ length: 10 }, (_, i) => `<span class="${i < solved ? "solved" : i === solved ? "active" : ""}">${i < solved ? "✓" : i + 1}</span>`).join("")}<span class="progress-chest">${icon("chest")}</span></div><div class="math-card ${accepted ? "correct" : feedback ? "try-again" : ""}"><div class="question-heading"><span class="eyebrow">${accepted && outcome?.levelComplete ? "VOYAGE COMPLETE" : `PROBLEM ${Math.min(solved + (accepted ? 0 : 1), 10)} OF 10`}</span><button class="hint-button" data-action="hint" aria-expanded="${hinted}" ${accepted ? "disabled" : ""}>${icon("compass")} ${hinted ? "Hide hint" : "A little help"}</button></div><div class="equation" aria-label="${q.left} ${op.name === "Addition" ? "plus" : op.name === "Subtraction" ? "minus" : op.name === "Multiplication" ? "times" : "divided by"} ${q.right} equals what?"><span class="term left-term">${q.left}</span><span class="equation-operator">${op.symbol}</span><span class="term right-term">${q.right}</span><span class="equals">=</span><output id="answer" class="answer-box ${answer ? "filled" : ""}" aria-label="Your answer" aria-live="polite">${answer || "?"}</output></div><p id="answer-feedback" class="answer-feedback ${accepted ? "success" : feedback ? "retry" : ""}" role="status">${message}</p><div class="hint-panel" ${hinted ? "" : "hidden"}>${hinted ? hintView(q) : ""}</div><div class="number-pad" aria-label="Number pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}" ${accepted ? "disabled" : ""}>${n}</button>`).join("")}<button class="key-clear" data-key="clear" aria-label="Clear answer" ${accepted ? "disabled" : ""}>Clear</button><button data-key="0" ${accepted ? "disabled" : ""}>0</button><button class="key-delete" data-key="delete" aria-label="Delete last digit" ${accepted ? "disabled" : ""}>⌫</button></div><button id="check-answer" class="wood-button primary check-answer" data-action="${accepted ? "continue" : "check"}" ${!accepted && !answer ? "disabled" : ""}>${accepted ? outcome?.chestEarned ? `Open your chest ${icon("chest")}` : outcome?.levelComplete ? `See your stars ${icon("star")}` : `Next problem ${icon("arrow")}` : `Check answer ${icon("arrow")}`}</button></div><div class="chest-distance">${icon("chest")}<span><b>${format(earned)} / 1,000 gold earned this level</b><br />${stake}</span><small>Keyboard: numbers & Enter</small></div></section>`;
}
function shipView(reward: boolean): string {
  const pending = pendingMathChests(progress);
  return `<section class="cave-view ship-view">
    <div class="cave-heading"><span class="eyebrow">ABOARD THE BLACK PEARL</span><h1>${reward ? "Treasure, Captain!" : "The treasure hold"}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? "The ship view couldn't load. Your chests are saved. Use Back to try again." : `${pending.length} ${pending.length === 1 ? "open chest" : "open chests"} aboard · ${format(cargoGold(progress))} gold coming home`}</p>${reward && outcome ? stars(outcome.stars) : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} Boarding your ship…</div>
    ${sceneError ? `<div class="cave-fallback">${art("first-sails")}</div>` : ""}
    <div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${reward ? `+${format(outcome?.levelGold ?? pending[pending.length - 1]?.gold ?? 0)} GOLD STOWED ABOARD` : "YOUR SAVED CARGO"}</span><strong>${format(cargoGold(progress))} <span>gold aboard</span></strong><p>${format(bankedGold(progress))} gold already in your cave</p></div><button class="wood-button primary" data-action="unload" ${!pending.length || sceneLoading ? "disabled" : ""}>Return to cave ${icon("chest")}</button><button class="text-button" data-action="${reward ? "reward-next" : "levels"}" ${reward && !revealReady && !sceneError ? "disabled" : ""}>${reward ? "Explore next island" : "Keep practising"} ${icon("ship")}</button></div>
  </section>`;
}
function caveView(unloading: boolean): string {
  const gold = bankedGold(progress);
  const status = cave?.unloading;
  const finished = unloading && revealReady && !sceneError;
  const pending = pendingMathChests(progress);
  const heading = unloading ? finished ? "Welcome home, Captain" : "Unloading the ship" : "The golden cave";
  const detail = unloading ? finished ? `${format(gold)} gold safely in your cave` : `Chest ${Math.min((status?.delivered ?? 0) + 1, status?.total ?? pending.length)} of ${status?.total ?? pending.length} · ${format(cargoGold(progress))} gold coming home` : "Explore your cave. Every coin was earned by your calculations.";
  const walkControls = `<div class="cave-walk-controls"><span class="cave-crosshair" aria-hidden="true">+</span><button id="math-cave-pad" aria-label="Move around the cave"><span id="math-cave-thumb"></span><small>Move</small></button><button id="math-cave-jump" aria-label="Jump">↑<small>Jump</small></button><button id="math-cave-inspect" class="text-button" data-action="cave-inspect" disabled>Inspect treasure</button></div>`;
  return `<section class="cave-view ${unloading ? "unloading-view" : "walking-view"}">
    <div class="cave-heading"><span class="eyebrow">${unloading ? "BRINGING YOUR FORTUNE HOME" : "YOUR SECRET PIRATE HIDEOUT"}</span><h1>${heading}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? "The cave couldn't load. Your gold is safe. Use Back to try again." : detail}</p></div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} Lighting the lanterns…</div>
    ${sceneError ? `<div class="cave-fallback">${art("treasure-cave")}</div>` : ""}
    ${!unloading && !sceneError ? walkControls : ""}
    ${unloading ? `<div class="cave-bottom unload-status">${finished ? `<button class="wood-button primary" data-action="stay-cave">Explore your cave ${icon("chest")}</button>` : `<p>Any unopened chests stay safely aboard.</p>`}</div>` : `<div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">THE CAPTAIN'S BANKED GOLD</span><strong>${format(gold)} <span>gold</span></strong><p id="math-cave-reserve" hidden></p><p>${format(cargoGold(progress))} gold aboard · ${format(progress.solved)} problems solved</p></div><div class="cave-actions"><button class="round-button" data-action="cave-reset" aria-label="Return to the cave entrance">${icon("compass")}</button><button class="text-button" data-action="ship">Visit your ship ${icon("ship")}</button></div><p class="cave-controls"><span id="math-cave-room">Cave entrance</span><span class="cave-keyboard-instructions"> · WASD to walk · arrows to look · Space to jump</span><span class="cave-touch-instructions"> · Drag to look · Move and Jump below</span></p></div>`}
  </section>`;
}
function completeView(): string {
  return `<section class="complete-view"><span class="eyebrow">${selectedPack().name.toUpperCase()}</span><h1>Well sailed, Captain!</h1>${stars(outcome?.stars ?? 1)}<p>Level ${format(level)} complete. No gold this time.<br />Each first-try answer on the next island earns 100 gold.</p><div class="completion-ship" aria-hidden="true">${pirateShipArt("complete")}</div><button class="wood-button primary" data-action="reward-next">Explore next island ${icon("ship")}</button></section>`;
}
function settingsView(): string {
  return `<section class="settings-view"><div class="page-heading"><span class="eyebrow">THE CAPTAIN'S ORDERS</span><h1>How to play</h1></div><div class="settings-card"><div class="captains-guide"><h2>A little captain's guide</h2><p>Pick an operator, choose a difficulty island, and solve ten problems in each level. New levels keep appearing as you sail.</p><p>Each problem offers 100 gold for a correct answer on your first try. A wrong answer loses only that problem’s 100 gold. Repeated wrong attempts on that same problem cost nothing more. The other problems still offer their own 100 gold, so ten first-try answers earn 1,000 gold. Earned chests collect aboard your ship. Return to the cave to pour them out one by one. Gold already in your cave stays safe.</p><p>Take your time and use the free hints before answering. After a mistake, keep practising to finish the level and unlock the next one. Leaving or closing the app does not restore a problem’s lost reward. Each new problem offers a fresh 100 gold.</p><button type="button" class="privacy-action" data-open-privacy>Privacy & support</button><div class="guide-footer">${icon("anchor")} ${saveFailed ? "This browser couldn't save. Keep this tab open to keep your progress." : "Your progress and gold are saved on this device."}</div></div></div></section>`;
}
function render(): void {
  mapPan?.destroy(); mapPan = null;
  root.dataset.screen = screen;
  root.dataset.operator = operator;
  root.dataset.saveFailed = String(saveFailed);
  root.innerHTML = `${header()}<main id="main-content">${{
    home, operators: operatorView, map: mapView, levels: levelsView, question: questionView,
    reward: () => shipView(true), ship: () => shipView(false), unloading: () => caveView(true), cave: () => caveView(false), complete: completeView, settings: settingsView,
  }[screen]()}</main>${saveFailed && screen !== "settings" ? `<div class="save-notice" role="status">Progress can't be saved in this browser. Keep this tab open.</div>` : ""}`;
  const scroller = document.querySelector<HTMLElement>("#main-content")!;
  if (screen === "levels" || screen === "map") mountMathMap(scroller);
  else scroller.scrollTop = 0;
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
    if (qa && new URLSearchParams(location.search).get("delay") === "1") {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (id !== viewId) return;
    }
    if (qa && new URLSearchParams(location.search).get("fail") === "scene") throw new Error("QA treasure scene failure");
    if (!cave) {
      const { GoldCave: Scene } = await import("./goldCave");
      if (id !== viewId) return;
      cave = new Scene(canvas, () => {
        if (!["reward", "ship", "unloading"].includes(screen)) return;
        revealReady = true; render();
      }, !qa, () => { if (screen === "unloading") render(); }, next => {
        const saved=saveMathProgress(next,storage); saveFailed=!qa&&!saved; return qa||saved;
      }, error => {
        console.error(error); sceneError=true; sceneLoading=false; revealReady=true; render();
      });
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
  trailWindow = initialTrailWindow(packTrail().cleared + 1);
  trailCamera = undefined;
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
  message.textContent = voyage!.problemMistakes === 0 ? "100 gold for a first-try answer. Take your time, Captain." : "Take your time. This problem’s 100 gold is already lost; retries cost nothing more."; message.classList.remove("retry");
  root.querySelector(".math-card")!.classList.remove("try-again");
}
function checkAnswer(): void {
  if (screen !== "question" || accepted || !answer) return;
  const firstMistake = voyage!.problemMistakes === 0;
  const result = answerQuestion(progress, packId, level, Number(answer));
  if (!result) return;
  persist();
  if (result.correct) { accepted = true; outcome = result; }
  else { feedback = firstMistake ? "Not quite. This problem’s 100 gold is lost. Take your time; the next problem still offers 100 gold." : "Not quite. No more gold is lost on this problem. Try a free hint and work it out."; answer = ""; }
  render();
}
function continueAfterAnswer(): void {
  if (!accepted || !outcome) return;
  if (outcome.chestEarned) { shipReturn = "levels"; void showGold(true); }
  else if (outcome.levelComplete) show("complete");
  else nextProblem();
}
function nextVoyage(): void {
  if (screen === "reward" && !revealReady && !sceneError) return;
  if (outcome?.levelComplete) openLevels();
  else if (voyage && packTrail().runs[level]) nextProblem();
  else openLevels();
}
/** Return to the page that opened a treasure scene, preserving the in-progress problem. */
function returnTo(target: Screen): void {
  if (target === "ship" || target === "reward") void showTreasure("ship");
  else if (target === "unloading") void showTreasure("cave");
  else if (target === "cave") void showTreasure("cave", false);
  else if (target === "levels") openLevels();
  else if (target === "question") {
    if (voyage && (accepted || packTrail().runs[level])) show("question");
    else openLevels();
  } else show(target);
}
function goBack(): void {
  if (screen === "home") return;
  if (screen === "operators") show("home");
  else if (screen === "map") show("operators");
  else if (screen === "levels") show("map");
  else if (screen === "settings") returnTo(returnScreen);
  else if (screen === "ship") returnTo(shipReturn);
  else if (screen === "cave" || screen === "unloading") returnTo(caveReturn);
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
    case "cave": if (screen !== "cave" && screen !== "unloading") caveReturn = screen; void showGold(false); break;
    case "stay-cave": void showTreasure("cave", false); break;
    case "ship": if (screen !== "ship" && screen !== "reward") shipReturn = screen; void showTreasure("ship"); break;
    case "unload": caveReturn = screen; void showTreasure("cave"); break;
    case "cave-map": operator = selectedPack().operator; show("map"); break;
    case "cave-reset": cave?.resetCamera(); break;
    case "cave-inspect": cave?.inspect(); break;
    case "resume": beginLevel(resumeRun()?.level ?? packTrail().cleared + 1); break;
    case "trail-earlier": exploreTrail("earlier"); break;
    case "trail-further": exploreTrail("further"); break;
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
  if (view === "operators") show("operators");
  else if (view === "map") show("map");
  else if (view === "levels") openLevels();
  else if (view === "question") beginLevel(packTrail().cleared + 1);
  else if (view === "settings") show("settings");
  else if (view === "complete") { outcome = { correct: true, chestEarned: false, levelComplete: true, stars: 1, goldEarned: 0, questionGoldLost: 0, levelGold: 0 }; show("complete"); }
  else if (view === "reward") { outcome = { correct: true, chestEarned: true, levelComplete: true, stars: 3, goldEarned: 100, questionGoldLost: 0, levelGold: pendingMathChests(progress).at(-1)?.gold ?? 0 }; void showTreasure("reward"); }
  else if (view === "cave") void showTreasure("cave", false);
  else if (view === "ship") void showTreasure("ship");
  else if (view === "unload") void showTreasure("cave");
}
