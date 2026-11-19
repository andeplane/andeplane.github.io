import { installButtonHaptics } from "../ui/buttonHaptics";
import { installPrivacy } from "../ui/privacy";
import { installMenuPreview } from "../ui/menuPreview";
import { icon } from "../ui/icons";
import { backButton } from "../ui/menuChrome";
import { pirateShipArt } from "../ui/worldArt";
import { worldFor } from "./worlds";
import { expeditionTrail, extendTrailWindow, initialTrailWindow, REGION_HEIGHT, LEVELS_PER_REGION, type TrailWindow } from "../ui/expeditionTrail";
import { mountMapPan, type MapCamera, type MapPanController } from "../ui/mapPan";
import {
  OPERATORS, getOperator, getPack, packsFor,
  readMathProgress, saveMathProgress, trackFor, startVoyage, questionsFor,
  answerQuestion, goldTotal, pendingMathChests, bankedGold, cargoGold,
  type OperatorId, type Voyage, type Question, type AnswerResult,
} from "./academy";
import { detectLanguage, LANGUAGES, readLanguagePreference, saveLanguagePreference, isLanguagePreference } from "./i18n";
import { selectLanguage } from "./language";
import type { GoldCave } from "./goldCave";
import "./style.css";
import { difficultyMap } from "../ui/difficultyMap";
import { worldChoices, worldChart } from "../ui/islandChart";
import "./adventure.css";
import "./focus.css";
import "./home.css";
import "./gameHud.css";
import { languagePickerMarkup, dismissLanguagePicker } from "../ui/languagePicker";
import { clockBoard, newClockRound } from "./clockBoard";
import "./clock.css";

type Screen = "home" | "operators" | "map" | "levels" | "question" | "reward" | "ship" | "unloading" | "complete" | "cave" | "settings" | "clock";
installButtonHaptics();
installMenuPreview();
installPrivacy();
const root = document.querySelector<HTMLDivElement>("#academy")!;
const canvas = document.querySelector<HTMLCanvasElement>("#treasure-scene")!;
const qa = import.meta.env.DEV && new URLSearchParams(location.search).get("qa") === "true";
let storage: Storage | undefined;
try { storage = qa ? new URLSearchParams(location.search).get("fresh") === "1" ? undefined : sessionStorage : localStorage; } catch { /* Playing still works when storage is unavailable. */ }

let languagePreference = readLanguagePreference(storage), languageSaveFailed = false;
const deviceLanguages = () => navigator.languages?.length ? navigator.languages : [navigator.language];
let i18n = selectLanguage(languagePreference, deviceLanguages());
const t: typeof i18n.t = (key, values) => i18n.t(key, values);
const operatorName = (id: OperatorId) => i18n.operatorName(id);
const localizedPack = (id: string) => { const pack = getPack(id); return { ...pack, ...i18n.packText(pack) }; };
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
let screen: Screen = "home";
const treasureTrail: Screen[] = [];
const treasureParent = () => treasureTrail.at(-1) ?? "home";
let voyageReturn: "home" | "levels" = "levels";
let operator = progress.operator, packId = progress.pack, level = 1;
let trailWindow: TrailWindow = initialTrailWindow(1);
const previousTrails = new Map<string, { window: TrailWindow; camera: MapCamera }>();
let trailCamera: MapCamera | undefined;
let mapPan: MapPanController | null = null;
const packCameras = new Map<OperatorId, MapCamera>();
let voyage: Voyage | null = null, question: Question | null = null, outcome: AnswerResult | null = null;
let answer = "", feedback: "" | "firstWrong" | "retryWrong" = "", hinted = false, accepted = false, saveFailed = false;
let clockRound: ReturnType<typeof newClockRound> | undefined;
let cave: GoldCave | null = null, sceneError = false, sceneLoading = false, revealReady = false, viewId = 0;
const art = (file: string, cls = "", alt = "") => `<img class="${cls}" src="${import.meta.env.BASE_URL}assets/map/${file}.webp" alt="${alt}" draggable="false" />`;
const format = (value: number) => i18n.format(value);
const navNumber = (value: number) => value < 1000 ? format(value) : new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const stars = (count: number) => `<span class="stars" aria-label="${t("stars", { count: format(count) })}">${[1, 2, 3].map((i) => `<span class="${i <= count ? "earned" : ""}">★</span>`).join("")}</span>`;
const lock = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>`;
const persist = () => {
  const saved = saveMathProgress(progress, storage);
  saveFailed = qa ? new URLSearchParams(location.search).get("fail") === "save" : !saved;
};
const selectedPack = () => localizedPack(packId);
const packTrail = () => trackFor(progress, packId);
function resumeRun() {
  const lastPlayed = progress.lastPlayed;
  if (lastPlayed) {
    const run = progress.tracks[lastPlayed.pack]?.runs[lastPlayed.level];
    if (run) return { pack: lastPlayed.pack, run };
  }
  let unattempted: { pack: string; run: Voyage } | undefined;
  for (const pack of [progress.pack, ...Object.keys(progress.tracks).filter(id => id !== progress.pack)]) {
    const track = progress.tracks[pack];
    if (!track) continue;
    const runs = Object.values(track.runs).sort((a, b) => b.level - a.level);
    const run = runs.find(run => run.solved || run.mistakes);
    if (run) return { pack, run };
    if (!unattempted && runs[0]) unattempted = { pack, run: runs[0] };
  }
  return unattempted;
}
const seed = () => {
  const value = new Uint32Array(1);
  try { return crypto.getRandomValues(value)[0]!; }
  catch { return Math.floor(Math.random() * 0x100000000); }
};
const coins = (count: number, spent = 0) => `<span class="hint-coins">${Array.from({ length: count }, (_, i) => `<i class="little-coin ${i < spent ? "spent" : ""}" aria-hidden="true"></i>`).join("")}${count === 0 ? t("noCoins") : ""}</span>`;

const screenLabel = {
  home: "home", operators: "operators", map: "islands", levels: "levelMap",
  question: "problemDestination", clock: "clockAdventure", cave: "cave", unloading: "cave",
  ship: "ship", reward: "ship", complete: "levelMap", settings: "settings",
} as const;
const backLabel = (destination: Screen) => t("backTo", { destination: t(screenLabel[destination]) });
const gameBack = (destination: Screen) => backButton({ action: "back", label: t("back"), accessibleLabel: backLabel(destination) });

function caveHud(): string {
  return `<header class="explore-bar"><button class="explore-back" data-action="back" aria-label="${backLabel(treasureParent())}">‹ ${t("back")}</button><span class="explore-balance">${icon("chest")} ${navNumber(bankedGold(progress))} <small>${t("gold")}</small></span>${!sceneError && !sceneLoading ? `<details class="cave-details"><summary role="button">${t("caveControlsLabel")}</summary><div class="cave-details-panel"><h2>${t("goldenCave")}</h2><p class="cave-keyboard-instructions">${t("walkKeyboard")}</p><p class="cave-touch-instructions">${t("walkTouch")}</p><button data-action="cave-reset">${icon("compass")} ${t("returnEntrance")}</button><p>${t("caveSummary", {gold:format(cargoGold(progress)),count:format(progress.solved)})}</p><p id="math-cave-reserve" hidden></p></div></details>` : ""}</header>`;
}
function home(): string {
  const saved = resumeRun();
  const gold = bankedGold(progress);
  const pending = i18n.plural("aboard", pendingMathChests(progress).length);
  return `<section class="calculus-home">
    <picture class="calculus-home-art" aria-hidden="true">
      <source media="(min-width: 701px), (orientation: landscape)" srcset="${import.meta.env.BASE_URL}assets/menu/calculus-worktable-wide.webp" />
      <img src="${import.meta.env.BASE_URL}assets/menu/calculus-worktable.webp" width="852" height="1846" alt="" fetchpriority="high" />
    </picture>
    <h1><span>Captain</span>Calculus</h1>
    <nav class="calculus-home-actions" aria-label="${t("home")}">
      <button class="calculus-play" data-action="play">${icon("play")} ${t("play")}</button>
      ${saved ? `<button class="calculus-continue" data-action="resume">
        <strong>${t("continue")}</strong>
        <small>${operatorName(getPack(saved.pack).operator)} · ${localizedPack(saved.pack).label} · ${t("level", { count: format(saved.run.level) })} · ${t("solvedCount", { count: format(saved.run.solved) })}</small>
      </button>` : ""}
      <button class="calculus-destination" data-action="ship"><strong>${t("yourShip")}</strong><small>${pending}</small></button>
      <button class="calculus-destination" data-action="cave" aria-label="${t("yourCave")}: ${t("savedGold", { gold: format(gold) })}"><strong>${t("yourCave")}</strong><small>${t("savedGold", { gold: navNumber(gold) })}</small></button>
      <div class="home-utilities"><button class="calculus-destination" data-action="settings"><strong>${t("settings")}</strong></button><button class="calculus-destination" data-action="language" aria-haspopup="dialog"><strong>${t("language")}</strong></button></div>
    </nav>
  </section>`;
}
function operatorView(): string {
  const worlds = OPERATORS.map((op, i) => {
    const world = worldFor(op.id);
    const cleared = packsFor(op.id).reduce((sum, pack) => sum + (progress.tracks[pack.id]?.cleared ?? 0), 0);
    const name = operatorName(op.id);
    const sailed = cleared ? t("sailed", { count: format(cleared) }) : "";
    return { id: op.id, art: [0, 4, 6, 8][i]!, title: name, subtitle: world.name,
      progress: cleared ? navNumber(cleared) : undefined,
      ariaLabel: [name, world.name, sailed].filter(Boolean).join(", ") };
  });
  return worldChart(t("chooseAdventure"), worldChoices("operator", [
    ...worlds,
    { id: "clock", art: 2, title: t("clockAdventure"), subtitle: t("clockIsland"), ariaLabel: t("clockAdventure") },
  ]), gameBack("home"));
}
function mapView(): string {
  const world = worldFor(operator);
  return difficultyMap({ name: world.name, accessibleName: t("mapAccessible", { world: world.name }),
    instructions: t("dragDifficulty"), back: gameBack("operators"), selected: packId, centerLabel: t("currentIsland"),
    firstArt: [0, 4, 6, 8][OPERATORS.findIndex(op => op.id === operator)]!,
    stops: packsFor(operator).map((pack,i) => {
      const p = localizedPack(pack.id);
      return { id: p.id, label: p.label, description: world.chapterNames[i], ariaLabel: `${p.label}: ${p.description}` };
    }) });
}
// Keep the playable islands within the atlas's open sea lane.
const atlasCourses = [
  [50, 47, 47, 47, 50, 54, 52, 47, 48, 48, 52, 50],
  [50, 46, 45, 48, 52, 47, 47, 52, 53, 48, 50, 52],
  [50, 53, 51, 48, 47, 47, 52, 50, 46, 47, 51, 50],
  [50, 47, 47, 47, 48, 54, 52, 47, 47, 48, 52, 50],
];
function levelsView(): string {
  const p = selectedPack(), op = getOperator(p.operator);
  const practiceRule = p.operator === "add" ? t("sumsStay", { count: p.limit! }) : t("sameDifficulty");
  return expeditionTrail({ world: worldFor(p.operator), showStars: true, resumeLabel: count => t("resumeCount", { count }), progressLabel: count => t("solvedCount", { count }), packLabel: p.label, backLabel: backLabel("map"), courses: atlasCourses, operatorName: operatorName(op.id), practiceRule, window: trailWindow, track: packTrail(), text: t, format });
}
function mountMathMap(scroller: HTMLElement): void {
  scroller.scrollTop = scroller.scrollLeft = 0;
  const viewport = scroller.querySelector<HTMLElement>("[data-map-viewport]");
  const world = viewport?.querySelector<HTMLElement>("[data-map-world]");
  if (!viewport || !world) return;
  const isTrail = screen === "levels", mapOperator = operator;
  mapPan = mountMapPan(viewport, world, {
    focus: { x: Number(viewport.dataset.focusX) || world.offsetWidth / 2, y: Number(viewport.dataset.focusY) || world.offsetHeight / 2 },
    scale: Number(viewport.dataset.mapScale) || (isTrail ? 1.12 : 1),
    coverViewport: true,
    state: isTrail ? trailCamera : packCameras.get(mapOperator),
    onChange: state => { if (isTrail) { trailCamera = state; previousTrails.set(packId, { window: trailWindow, camera: state }); } else packCameras.set(mapOperator, state); },
    onCenter: isTrail ? () => openLevels(true) : undefined,
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
  if (q.operator === "add") return `<p>${t("hintAdd")}</p><div class="hint-piles"><div><b>${q.left}</b>${coins(q.left)}</div><span>+</span><div><b>${q.right}</b>${coins(q.right)}</div></div>`;
  if (q.operator === "subtract" && q.left <= 20) return `<p>${t("hintSubtract", { left: q.left, right: q.right })}</p>${coins(q.left, q.right)}`;
  if (q.operator === "subtract") {
    const parts = [Math.floor(q.right / 100) * 100, Math.floor(q.right % 100 / 10) * 10, q.right % 10].filter(Boolean);
    return `<p>${t("hintBorrow", { left: q.left, parts: parts.join(t("then")) })}</p><div class="numberline"><b>${q.left}</b>${parts.map((n) => `<span><small>−${n}</small>←</span>`).join("")}<b>?</b></div>`;
  }
  const groups = q.operator === "multiply" ? q.left : q.right, amount = q.operator === "multiply" ? q.right : q.answer;
  return `<p>${q.operator === "multiply" ? t("hintMultiply", { groups, amount }) : t("hintDivide", { left: q.left, groups })}</p><div class="hint-groups">${Array.from({ length: groups }, (_, i) => `<div><small>${t("crew", { count: i + 1 })}</small>${coins(amount)}</div>`).join("")}</div>`;
}
function questionView(): string {
  const p = selectedPack(), op = getOperator(p.operator), q = question!, solved = voyage!.solved;
  const earned = voyage!.earnedGold;
  const rewardAvailable = voyage!.problemMistakes === 0;
  const stake = accepted ? outcome?.goldEarned ? t("answerGold") : t("answerNoGold") : rewardAvailable ? t("atStake") : t("lostStake");
  const message = accepted ? outcome?.levelComplete ? t("levelGold", { gold: format(outcome.levelGold) }) : outcome?.goldEarned ? t("firstCorrect") : t("retryCorrect") : (feedback ? t(feedback) : t("firstEncouragement"));
  return `<section class="question-view"><h1 class="visually-hidden">${t("problem", { count: Math.min(solved + (accepted ? 0 : 1), 10) })}</h1><div class="voyage-status">${gameBack(voyageReturn)}<span>${op.symbol} ${operatorName(op.id)} <i>·</i> ${p.label}</span><b>${t("level", { count: format(level) })}</b></div><div class="question-progress" aria-label="${t("solvedProgress", { count: solved })}">${Array.from({ length: 10 }, (_, i) => `<span class="${i < solved ? "solved" : i === solved ? "active" : ""}">${i < solved ? "✓" : i + 1}</span>`).join("")}<span class="progress-chest">${icon("chest")}</span></div><div class="math-card ${accepted ? "correct" : feedback ? "try-again" : ""}"><div class="question-heading"><span class="eyebrow">${accepted && outcome?.levelComplete ? t("voyageComplete") : t("problem", { count: Math.min(solved + (accepted ? 0 : 1), 10) })}</span><button class="hint-button" data-action="hint" aria-expanded="${hinted}" ${accepted ? "disabled" : ""}>${icon("compass")} ${hinted ? t("hideHint") : t("help")}</button></div><div class="equation" aria-label="${t("equation", { left: q.left, operator: i18n.spokenOperator(q.operator), right: q.right })}"><span class="term left-term">${q.left}</span><span class="equation-operator">${op.symbol}</span><span class="term right-term">${q.right}</span><span class="equals">=</span><output id="answer" class="answer-box ${answer ? "filled" : ""}" aria-label="${t("yourAnswer")}" aria-live="polite">${answer || "?"}</output></div><p id="answer-feedback" class="answer-feedback ${accepted ? "success" : feedback ? "retry" : ""}" role="status">${message}</p><div class="hint-panel" ${hinted ? "" : "hidden"}>${hinted ? hintView(q) : ""}</div><div class="number-pad" aria-label="${t("numberPad")}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}" ${accepted ? "disabled" : ""}>${n}</button>`).join("")}<button class="key-clear" data-key="clear" aria-label="${t("clearAnswer")}" ${accepted ? "disabled" : ""} title="${t("clearAnswer")}">C</button><button data-key="0" ${accepted ? "disabled" : ""}>0</button><button class="key-delete" data-key="delete" aria-label="${t("deleteDigit")}" ${accepted ? "disabled" : ""}>⌫</button></div><button id="check-answer" class="wood-button primary check-answer" data-action="${accepted ? "continue" : "check"}" ${!accepted && !answer ? "disabled" : ""}>${accepted ? outcome?.chestEarned ? `${t("openChest")} ${icon("chest")}` : outcome?.levelComplete ? `${t("seeStars")} ${icon("star")}` : `${t("nextProblem")} ${icon("arrow")}` : `${t("checkAnswer")} ${icon("arrow")}`}</button></div><div class="chest-distance">${icon("chest")}<span><b>${t("earnedLevel", { gold: format(earned), maximum: format(1000) })}</b><br />${stake}</span><small>${t("keyboard")}</small></div></section>`;
}
const retryScene = () => `<button class="text-button retry-scene" data-action="retry-scene">${t("retryScene")}</button>`;
function shipView(reward: boolean): string {
  const pending = pendingMathChests(progress);
  return `<section class="cave-view ship-view">
    <div class="scene-back">${gameBack(reward ? voyageReturn : treasureParent())}</div>
    <div class="cave-heading"><span class="eyebrow">${t("aboardPearl")}</span><h1>${reward ? t("treasure") : t("hold")}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? t("shipError") : t("cargoSummary", { count: pending.length, gold: format(cargoGold(progress)) })}</p>${reward && outcome ? stars(outcome.stars) : ""}${sceneError ? retryScene() : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} ${t("boarding")}</div>
    ${sceneError ? `<div class="cave-fallback">${art("first-sails")}</div>` : ""}
    <div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${reward ? t("stowed", { gold: format(outcome?.levelGold ?? pending[pending.length - 1]?.gold ?? 0) }) : t("savedCargo")}</span><strong>${format(cargoGold(progress))} <span>${t("goldAboard")}</span></strong><p>${t("alreadyCave", { gold: format(bankedGold(progress)) })}</p></div>${!pending.length ? `<p class="empty-cargo" role="status">${t("noCargo")}</p>` : ""}<button class="wood-button primary" data-action="${pending.length ? "unload" : "cave"}" ${sceneLoading ? "disabled" : ""}>${t(pending.length ? "returnCave" : "exploreCave")} ${icon("chest")}</button><button class="text-button" data-action="${reward ? "reward-next" : "levels"}" ${reward && !revealReady && !sceneError ? "disabled" : ""}>${reward ? t("nextIsland") : t("keepPractising")} ${icon("ship")}</button></div>
  </section>`;
}
function caveView(unloading: boolean): string {
  const gold = bankedGold(progress);
  const status = cave?.unloading;
  const finished = unloading && revealReady && !sceneError;
  const pending = pendingMathChests(progress);
  const heading = unloading ? finished ? t("welcomeHome") : t("unloading") : t("goldenCave");
  const detail = unloading ? finished ? t("safeCave", { gold: format(gold) }) : t("unloadProgress", { count: Math.min((status?.delivered ?? 0) + 1, status?.total ?? pending.length), total: status?.total ?? pending.length, gold: format(cargoGold(progress)) }) : t("exploreCaveDetail");
  const walkControls = `<div class="cave-walk-controls"><span class="cave-crosshair" aria-hidden="true">+</span><button id="math-cave-pad" aria-label="${t("moveCave")}"><span id="math-cave-thumb"></span><small>${t("move")}</small></button><button id="math-cave-jump" aria-label="${t("jump")}">↑<small>${t("jump")}</small></button><button id="math-cave-inspect" class="text-button" data-action="cave-inspect" disabled>${t("inspectTreasure")}</button></div>`;
  if (!unloading) return `<section class="cave-view walking-view quiet-cave">${sceneLoading ? `<p class="quiet-loading" role="status">${t("loadingCave")}</p>` : ""}${sceneError ? `<div class="quiet-recovery"><h1>${t("goldenCave")}</h1><p role="status">${t("caveLoadError")}</p>${retryScene()}</div>` : !sceneLoading ? walkControls : ""}${!sceneLoading ? `<button class="quiet-ship" data-action="ship" aria-label="${t("ship")}: ${i18n.plural("aboard", pending.length)}">${icon("ship")} ${t("ship")}</button>` : ""}<span id="math-cave-room" class="visually-hidden">${t("entrance")}</span></section>`;
  return `<section class="cave-view unloading-view">
    <div class="scene-back">${gameBack(treasureParent())}</div>
    <div class="cave-heading"><h1>${heading}</h1><p ${sceneError ? 'role="status"' : ""}>${sceneError ? t("caveLoadError") : detail}</p>${sceneError ? retryScene() : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} ${t("loadingCave")}</div>
    ${sceneError ? `<div class="cave-fallback">${art("treasure-cave")}</div>` : ""}
    <div class="cave-bottom unload-status">${finished ? `<button class="wood-button primary" data-action="stay-cave">${t("exploreCave")} ${icon("chest")}</button>` : `<p>${t("unopenedSafe")}</p>`}</div>
  </section>`;
}
function completeView(): string {
  return `<section class="complete-view"><div class="complete-back">${gameBack(voyageReturn)}</div><span class="eyebrow">${selectedPack().name}</span><h1>${t("wellSailed")}</h1>${stars(outcome?.stars ?? 1)}<p>${t("completeNoGold", { count: format(level) })}<br />${t("nextGold")}</p><div class="completion-ship" aria-hidden="true">${pirateShipArt("complete")}</div><button class="wood-button primary" data-action="reward-next">${t("nextIsland")} ${icon("ship")}</button></section>`;
}
function settingsView(): string {
  return `<section class="settings-view"><div class="settings-heading">${gameBack("home")}<h1>${t("settings")}</h1></div><div class="settings-card"><div class="language-setting"><button class="wood-button settings-language" data-action="language" aria-haspopup="dialog" aria-describedby="language-detail"><strong>${t("language")}</strong><span>${languageLabel()}</span></button><p id="language-detail">${t("languageDetail", { language: LANGUAGES.find(item => item.id === i18n.language)!.name })}</p></div><div class="captains-guide"><h2>${t("howPlay")}</h2><p>${t("guidePlay")}</p><p>${t("rewardRule")} ${t("firstTryGuide")} ${t("cargoGuide")}</p><p>${t("guideHints")} ${t("unopenedSafe")}</p><button type="button" class="privacy-action" data-open-privacy>${t("privacyEnglish")}</button><div class="guide-footer">${icon("anchor")} ${saveFailed ? t("saveError") : t("saveOk")}</div></div></div></section>`;
}
function render(): void {
  const focused = document.activeElement;
  const focusedButton = focused instanceof HTMLButtonElement && root.contains(focused) ? focused : null;
  const focusSelector = focusedButton?.id ? `#${focusedButton.id}` :
    focusedButton?.dataset.action ? `[data-action="${focusedButton.dataset.action}"]` : null;
  mapPan?.destroy(); mapPan = null;
  document.documentElement.lang = i18n.language;
  document.title = `Captain Calculus · ${t("subtitle")}`;
  canvas.setAttribute("aria-label", t("visitOwnCave"));
  root.dataset.screen = screen;
  root.dataset.operator = operator;
  root.dataset.saveFailed = String(saveFailed);
  root.innerHTML = `${screen === "cave" ? caveHud() : ""}<main id="main-content">${{
    home, operators: operatorView, map: mapView, levels: levelsView, question: questionView,
    clock: () => clockBoard(clockRound!, i18n, gameBack("operators")),
    reward: () => shipView(true), ship: () => shipView(false), unloading: () => caveView(true), cave: () => caveView(false), complete: completeView, settings: settingsView,
  }[screen]()}</main>${saveFailed && screen !== "settings" ? `<div class="save-notice" role="status">${t("saveNotice")}</div>` : ""}`;
  const scroller = document.querySelector<HTMLElement>("#main-content")!;
  if (screen === "levels" || screen === "map") mountMathMap(scroller);
  else scroller.scrollTop = 0;
  if (focusSelector) root.querySelector<HTMLButtonElement>(focusSelector)?.focus({ preventScroll: true });
}
function show(next: Screen, focusSelector = "h1"): void {
  viewId++;
  screen = next;
  if (!["cave", "reward", "ship", "unloading"].includes(next)) {
    treasureTrail.length = 0;
    cave?.pause(); canvas.hidden = true; sceneLoading = false;
  }
  render();
  const focus = root.querySelector<HTMLElement>(focusSelector) ?? root.querySelector<HTMLElement>("#main-content");
  if (focus && !focus.matches("button")) focus.tabIndex = -1;
  focus?.focus({ preventScroll: true });
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
function openLevels(recenter = false): void {
  operator = selectedPack().operator;
  const saved = recenter ? undefined : previousTrails.get(packId);
  trailWindow = saved?.window ?? initialTrailWindow(packTrail().cleared + 1);
  trailCamera = saved?.camera;
  show("levels");
}
function beginLevel(n: number, from = voyageReturn): void {
  const run = startVoyage(progress, packId, n, seed());
  if (!run) return;
  voyage = run; level = n; outcome = null; voyageReturn = from;
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
  message.textContent = voyage!.problemMistakes === 0 ? t("firstEncouragement") : t("retryEncouragement"); message.classList.remove("retry");
  root.querySelector(".math-card")!.classList.remove("try-again");
}
function checkAnswer(): void {
  if (screen !== "question" || accepted || !answer) return;
  const firstMistake = voyage!.problemMistakes === 0;
  const result = answerQuestion(progress, packId, level, Number(answer));
  if (!result) return;
  persist();
  if (result.correct) { accepted = true; outcome = result; }
  else { feedback = firstMistake ? "firstWrong" : "retryWrong"; answer = ""; }
  render();
}
function continueAfterAnswer(): void {
  if (!accepted || !outcome) return;
  if (outcome.chestEarned) { treasureTrail.length = 0; void showGold(true); }
  else if (outcome.levelComplete) show("complete");
  else nextProblem();
}
function nextVoyage(): void {
  if (screen === "reward" && !revealReady && !sceneError) return;
  if (outcome?.levelComplete) openLevels(true);
  else if (voyage && packTrail().runs[level]) nextProblem();
  else openLevels();
}
/** Return to the page that opened a treasure scene, preserving the in-progress problem. */
function returnTo(target: Screen): void {
  if (target === "ship" || target === "reward") void showTreasure(target);
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
  if (screen === "operators") show("home", '[data-action="play"]');
  else if (screen === "map") show("operators");
  else if (screen === "clock") {
    show("operators", '[data-operator="clock"]');
    document.activeElement?.scrollIntoView({ block: "nearest" });
  }
  else if (screen === "levels") show("map");
  else if (screen === "settings") show("home", '[data-action="settings"]');
  else if (screen === "ship" || screen === "cave" || screen === "unloading") {
    const target = treasureTrail.pop() ?? "home";
    if (target === "home") show("home", screen === "ship" ? '[data-action="ship"]' : '[data-action="cave"]');
    else returnTo(target);
  } else if (voyageReturn === "home") show("home", '[data-action="resume"]');
  else returnTo(voyageReturn);
}

const picker = document.createElement("dialog");
picker.className = "language-picker";
picker.setAttribute("aria-labelledby", "language-picker-title");
document.body.append(picker);

function languageChoice() {
  const language = LANGUAGES.find(lang => lang.id === i18n.language)!;
  return { flag: language.flag, name: languagePreference === "auto" ? "Auto" : language.name };
}
function languageLabel() {
  const { name, flag } = languageChoice();
  return `<span aria-hidden="true">${flag}</span> ${name}`;
}
function drawPicker() {
  picker.innerHTML = languagePickerMarkup(i18n, languagePreference, deviceLanguages(), languageSaveFailed);
}
function openPicker() {
  drawPicker();
  picker.showModal();
  picker.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
}
picker.addEventListener("click", event => {
  const target = event.target as HTMLElement;
  if (dismissLanguagePicker(picker, event)) { picker.close(); return; }
  const choice = target.closest<HTMLElement>("[data-language]")?.dataset.language;
  if (!isLanguagePreference(choice)) return;
  languagePreference = choice;
  languageSaveFailed = !saveLanguagePreference(choice, storage);
  i18n = selectLanguage(choice, deviceLanguages());
  const scroll = root.querySelector("#main-content")!.scrollTop;
  render();
  root.querySelector("#main-content")!.scrollTop = scroll;
  if (languageSaveFailed) {
    drawPicker();
    picker.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  } else {
    picker.close();
    root.querySelector<HTMLElement>('[data-action="language"]')?.focus({ preventScroll: true });
  }
});
for (const type of ["contextmenu", "selectstart"]) {
  document.addEventListener(type, event => event.preventDefault());
}
window.addEventListener("languagechange", () => {
  if (languagePreference !== "auto") return;
  i18n = selectLanguage(languagePreference, deviceLanguages()); render();
  if (picker.open) drawPicker();
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.dataset.operator === "clock") {
    clockRound ??= newClockRound(seed());
    show("clock");
    return;
  }
  if (button.dataset.clockTime !== undefined && screen === "clock") {
    const round = clockRound!;
    const question = round.questions[round.index];
    const time = Number(button.dataset.clockTime);
    if (!question || round.correct || round.rejected.has(time) || !question.choices.includes(time)) return;
    round.correct = time === question.time;
    if (!round.correct) round.rejected.add(time);
    else if (round.rejected.size === 0) round.firstTry++;
    render();
    root.querySelector<HTMLElement>(round.correct ? '[data-action="clock-next"]' : "#clock-feedback")?.focus();
    return;
  }
  if (button.dataset.operator) {
    operator = button.dataset.operator as OperatorId;
    progress.operator = operator;
    if (selectedPack().operator !== operator) packId = packsFor(operator)[0]!.id;
    progress.pack = packId; persist(); show("map"); return;
  }
  if (button.dataset.pack) { packId = button.dataset.pack; progress.pack = packId; persist(); openLevels(); return; }
  if (button.dataset.level) { beginLevel(Number(button.dataset.level), "levels"); return; }
  if (button.dataset.key) { enterKey(button.dataset.key); return; }
  switch (button.dataset.action) {
    case "home": show("home"); break;
    case "play": show("operators"); break;
    case "back": goBack(); break;
    case "language": if (screen === "settings" || screen === "home") openPicker(); break;
    case "settings":
      if (screen === "home") show("settings");
      break;
    case "cave":
      if (screen === "cave" || screen === "unloading") break;
      treasureTrail.push(screen);
      void showGold(false);
      break;
    case "stay-cave": void showTreasure("cave", false); break;
    case "ship":
      if (screen === "ship" || screen === "reward") break;
      treasureTrail.push(screen);
      void showTreasure("ship");
      break;
    case "unload": treasureTrail.push(screen); void showTreasure("cave"); break;
    case "retry-scene": {
      const request = screen === "reward" || screen === "ship" ? screen : "cave";
      cave?.dispose();
      cave = null;
      void showTreasure(request, screen === "unloading");
      break;
    }
    case "cave-map": operator = selectedPack().operator; show("map"); break;
    case "cave-reset": {
      cave?.resetCamera();
      const details = root.querySelector<HTMLDetailsElement>(".cave-details");
      if (details) { details.open = false; details.querySelector("summary")?.focus(); }
      break;
    }
    case "cave-inspect": cave?.inspect(); break;
    case "resume": {
      const saved = resumeRun();
      if (saved) { packId = saved.pack; beginLevel(saved.run.level, "home"); }
      break;
    }
    case "trail-earlier": exploreTrail("earlier"); break;
    case "trail-further": exploreTrail("further"); break;
    case "levels": openLevels(); break;
    case "hint": hinted = !hinted; render(); break;
    case "clock-next":
      if (clockRound?.correct) {
        clockRound.index++;
        clockRound.correct = false;
        clockRound.rejected.clear();
        show("clock");
      }
      break;
    case "clock-restart":
      clockRound = newClockRound(seed());
      show("clock");
      break;
    case "check": checkAnswer(); break;
    case "continue": continueAfterAnswer(); break;
    case "reward-next": nextVoyage(); break;
  }
});
document.addEventListener("keydown", (event) => {
  if (picker.open) return;
  if ((event.target as HTMLElement).closest("select, input, textarea")) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.key === "Escape") {
    event.preventDefault();
    const details = root.querySelector<HTMLDetailsElement>(".cave-details[open]");
    if (details) { details.open = false; details.querySelector("summary")?.focus(); return; }
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else goBack();
    return;
  }
  if (screen !== "question") return;
  if (/^\d$/.test(event.key)) { event.preventDefault(); enterKey(event.key); }
  else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); enterKey("delete"); }
  else if (event.key === "Enter" && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); if (accepted) continueAfterAnswer(); else checkAnswer(); }
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

document.addEventListener("pointerdown", event => {
  const details = root.querySelector<HTMLDetailsElement>(".cave-details[open]");
  if (!picker.open && details && !details.contains(event.target as Node)) details.open = false;
});
