import { installButtonHaptics } from "../ui/buttonHaptics";
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
import { LANGUAGES, readLanguagePreference, saveLanguagePreference, isLanguagePreference } from "./i18n";
import { selectLanguage } from "./language";
import type { GoldCave } from "./goldCave";
import "./style.css";
import "../ui/difficultyMap.css";

type Screen = "home" | "operators" | "map" | "levels" | "question" | "reward" | "ship" | "unloading" | "complete" | "cave" | "settings";
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
let screen: Screen = "home", returnScreen: Screen = "home", caveReturn: Screen = "home", shipReturn: Screen = "home";
let operator = progress.operator, packId = progress.pack, level = 1;
let trailWindow: TrailWindow = initialTrailWindow(1);
let trailCamera: MapCamera | undefined;
let mapPan: MapPanController | null = null;
const packCameras = new Map<OperatorId, MapCamera>();
let voyage: Voyage | null = null, question: Question | null = null, outcome: AnswerResult | null = null;
let answer = "", feedback: "" | "firstWrong" | "retryWrong" = "", hinted = false, accepted = false, saveFailed = false;
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
const coins = (count: number, spent = 0) => `<span class="hint-coins">${Array.from({ length: count }, (_, i) => `<i class="little-coin ${i < spent ? "spent" : ""}" aria-hidden="true"></i>`).join("")}${count === 0 ? t("noCoins") : ""}</span>`;

function header(): string {
  if (screen === "home") return "";
  const destinations: Partial<Record<Screen, string>> = { operators: t("home"), map: t("operators"), levels: t("islands"), question: t("map"), complete: t("map"), reward: t("map") };
  const target = screen === "ship" ? shipReturn : screen === "settings" ? returnScreen : screen === "cave" || screen === "unloading" ? caveReturn : null;
  const destination = target ? target === "home" ? t("home") : target === "question" ? t("problemDestination") : target === "cave" ? t("cave") : target === "ship" || target === "reward" ? t("ship") : t("levelMap") : destinations[screen] ?? t("home");
  const pending = pendingMathChests(progress).length;
  return menuHeader({ className: "topbar", brand: "",
    back: backButton({ action: "back", label: t("back"), accessibleLabel: t("backTo", { destination }) }),
    actions: `<button class="pirate-nav-link" data-action="ship" aria-label="${t("ship")}: ${i18n.plural("aboard", pending)}">${icon("ship")}<span>${t("ship")}<small>${i18n.plural("aboard", pending)}</small></span></button><button class="pirate-nav-link" data-action="cave" aria-label="${t("cave")}: ${t("savedGold", { gold: format(bankedGold(progress)) })}">${icon("chest")}<span>${t("cave")}<small>${navNumber(bankedGold(progress))} ${t("gold")}</small></span></button><button class="round-button language-shortcut" data-action="settings" aria-label="${t("language")}">${icon("wheel")}</button>`,
  });
}
function home(): string {
  const run = resumeRun();
  const pending = pendingMathChests(progress).length;
  const canResume = !!run;
  return `<section class="pirate-home-shell">${homeMenu({
    title: ["Captain", "Calculus"],
    playLabel: t("play"), treasureLabel: t("yourTreasure"),
    description: t("homeDescription"),
    illustration: pirateShipArt("calculus"),
    primary: canResume
      ? { action: "resume", label: t("continue"), detail: `${operatorName(selectedPack().operator)} · ${t("level", { count: format(run.level) })} · ${t("solvedCount", { count: run.solved })}` }
      : { action: "play", label: t("play"), detail: t("choosePractice") },
    chooseLevels: canResume ? { action: "play", label: t("chooseLevel") } : undefined,
    ship: { action: "ship", icon: "ship", title: t("yourShip"), value: pending ? i18n.plural("aboard", pending) : t("noCargo"), detail: pending ? t("comingHome", { gold: format(cargoGold(progress)) }) : t("nextReward") },
    cave: { action: "cave", icon: "chest", title: t("yourCave"), value: t("savedGold", { gold: format(bankedGold(progress)) }), detail: pending ? t("unloadHere", { count: pending }) : t("exploreTreasure") },
    settings: { action: "settings", label: t("howPlay") },
    rule: t("rewardRule"),
  })}</section>`;
}
function operatorView(): string {
  return `<section class="operator-view"><div class="page-heading"><span class="eyebrow">${t("worldsMotto")}</span><h1>${t("chooseAdventure")}</h1><p>${t("worldsIntro")}</p></div><div class="operator-grid">${OPERATORS.map((o) => {
    const world = worldFor(o.id);
    const cleared = packsFor(o.id).reduce((sum, p) => sum + (progress.tracks[p.id]?.cleared ?? 0), 0);
    return `<button class="operator-card world-card" data-operator="${o.id}" style="--accent:${world.accent};--world-ocean:${world.ocean}" aria-label="${operatorName(o.id)}: ${world.name}"><img class="operator-world-art" src="${import.meta.env.BASE_URL}${world.image}" alt="" draggable="false" /><span class="operator-world-shade" aria-hidden="true"></span><span class="operator-symbol">${o.symbol}</span><span class="operator-copy"><small class="operator-world-name">${world.name}</small><h2>${operatorName(o.id)}</h2><span class="example">${o.sample} = ?</span><span class="operator-footer">${cleared ? t("sailed", { count: format(cleared) }) : t("exploreWorld")} ${icon("arrow")}</span></span></button>`;
  }).join("")}</div><p class="small-note">${t("worldsRule")}</p></section>`;
}
function mapView(): string {
  const op = getOperator(operator), world = worldFor(operator), packs = packsFor(operator).map(p => localizedPack(p.id));
  const stops = [{x:350,y:1450},{x:850,y:1130},{x:380,y:890},{x:860,y:620},{x:390,y:330}];
  const chosen = Math.max(0, packs.findIndex(p => p.id === packId)), focus = stops[chosen]!;
  return `<section class="map-view operation-world" style="--world-accent:${world.accent};--world-ocean:${world.ocean};--world-paper:${world.paper};--world-ink:${world.ink}"><div class="world-map-heading"><span class="eyebrow">${op.symbol} ${operatorName(op.id)}</span><h1>${world.name}</h1><p>${t("dragDifficulty")}</p></div><div class="world-map-viewport" data-map-viewport data-focus-x="${focus.x}" data-focus-y="${focus.y}" data-map-scale="1" tabindex="0" aria-label="${t("mapAccessible", { world: world.name })}"><div class="world-map-plane" data-map-world><img class="world-map-art" src="${import.meta.env.BASE_URL}${world.image}" alt="" draggable="false" /><div class="world-map-texture" aria-hidden="true"></div><svg class="world-pack-route" viewBox="0 0 1200 1800" aria-hidden="true"><path d="M350 1450 C520 1440 700 1170 850 1130 S540 980 380 890 S690 700 860 620 S560 410 390 330" /></svg>${packs.map((p, i) => {
    const cleared = progress.tracks[p.id]?.cleared ?? 0, stop = stops[i]!;
    return `<button class="world-pack-stop" data-pack="${p.id}" style="left:${stop.x}px;top:${stop.y}px" aria-label="${p.label}: ${p.description}"><span class="world-pack-pin" aria-hidden="true">${i + 1}</span><span class="world-pack-label"><b>${p.label}</b><small>${world.chapterNames[i]}</small><span>${p.example} = ?</span><em>${cleared ? t("sailed", { count: format(cleared) }) : t("startExploring")} ${icon("arrow")}</em></span></button>`;
  }).join("")}</div><div class="world-map-tools" data-map-control><span>${t("fiveDifficulties")}</span><button type="button" data-map-center>${icon("compass")} ${t("currentIsland")}</button></div></div></section>`;
}
function levelsView(): string {
  const p = selectedPack(), op = getOperator(p.operator);
  const practiceRule = p.operator === "add" ? t("sumsStay", { count: p.limit! }) : t("sameDifficulty");
  return expeditionTrail({ operator: p.operator, packName: p.name, packLabel: p.label, operatorName: operatorName(op.id), practiceRule, baseUrl: import.meta.env.BASE_URL, window: trailWindow, track: packTrail(), text: t, format });
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
  return `<section class="question-view"><div class="voyage-status"><span>${op.symbol} ${operatorName(op.id)} <i>·</i> ${p.label}</span><b>${t("level", { count: format(level) })}</b></div><div class="question-progress" aria-label="${t("solvedProgress", { count: solved })}">${Array.from({ length: 10 }, (_, i) => `<span class="${i < solved ? "solved" : i === solved ? "active" : ""}">${i < solved ? "✓" : i + 1}</span>`).join("")}<span class="progress-chest">${icon("chest")}</span></div><div class="math-card ${accepted ? "correct" : feedback ? "try-again" : ""}"><div class="question-heading"><span class="eyebrow">${accepted && outcome?.levelComplete ? t("voyageComplete") : t("problem", { count: Math.min(solved + (accepted ? 0 : 1), 10) })}</span><button class="hint-button" data-action="hint" aria-expanded="${hinted}" ${accepted ? "disabled" : ""}>${icon("compass")} ${hinted ? t("hideHint") : t("help")}</button></div><div class="equation" aria-label="${t("equation", { left: q.left, operator: i18n.spokenOperator(q.operator), right: q.right })}"><span class="term left-term">${q.left}</span><span class="equation-operator">${op.symbol}</span><span class="term right-term">${q.right}</span><span class="equals">=</span><output id="answer" class="answer-box ${answer ? "filled" : ""}" aria-label="${t("yourAnswer")}" aria-live="polite">${answer || "?"}</output></div><p id="answer-feedback" class="answer-feedback ${accepted ? "success" : feedback ? "retry" : ""}" role="status">${message}</p><div class="hint-panel" ${hinted ? "" : "hidden"}>${hinted ? hintView(q) : ""}</div><div class="number-pad" aria-label="${t("numberPad")}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}" ${accepted ? "disabled" : ""}>${n}</button>`).join("")}<button class="key-clear" data-key="clear" aria-label="${t("clearAnswer")}" ${accepted ? "disabled" : ""} title="${t("clearAnswer")}">C</button><button data-key="0" ${accepted ? "disabled" : ""}>0</button><button class="key-delete" data-key="delete" aria-label="${t("deleteDigit")}" ${accepted ? "disabled" : ""}>⌫</button></div><button id="check-answer" class="wood-button primary check-answer" data-action="${accepted ? "continue" : "check"}" ${!accepted && !answer ? "disabled" : ""}>${accepted ? outcome?.chestEarned ? `${t("openChest")} ${icon("chest")}` : outcome?.levelComplete ? `${t("seeStars")} ${icon("star")}` : `${t("nextProblem")} ${icon("arrow")}` : `${t("checkAnswer")} ${icon("arrow")}`}</button></div><div class="chest-distance">${icon("chest")}<span><b>${t("earnedLevel", { gold: format(earned), maximum: format(1000) })}</b><br />${stake}</span><small>${t("keyboard")}</small></div></section>`;
}
function shipView(reward: boolean): string {
  const pending = pendingMathChests(progress);
  return `<section class="cave-view ship-view">
    <div class="cave-heading"><span class="eyebrow">${t("aboardPearl")}</span><h1>${reward ? t("treasure") : t("hold")}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? t("shipError") : t("cargoSummary", { count: pending.length, gold: format(cargoGold(progress)) })}</p>${reward && outcome ? stars(outcome.stars) : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} Boarding your ship…</div>
    ${sceneError ? `<div class="cave-fallback">${art("first-sails")}</div>` : ""}
    <div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${reward ? t("stowed", { gold: format(outcome?.levelGold ?? pending[pending.length - 1]?.gold ?? 0) }) : t("savedCargo")}</span><strong>${format(cargoGold(progress))} <span>${t("goldAboard")}</span></strong><p>${t("alreadyCave", { gold: format(bankedGold(progress)) })}</p></div><button class="wood-button primary" data-action="unload" ${!pending.length || sceneLoading ? "disabled" : ""}>${t("returnCave")} ${icon("chest")}</button><button class="text-button" data-action="${reward ? "reward-next" : "levels"}" ${reward && !revealReady && !sceneError ? "disabled" : ""}>${reward ? t("nextIsland") : t("keepPractising")} ${icon("ship")}</button></div>
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
  return `<section class="cave-view ${unloading ? "unloading-view" : "walking-view"}">
    <div class="cave-heading"><span class="eyebrow">${unloading ? t("bringingHome") : t("hideout")}</span><h1>${heading}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? t("caveLoadError") : detail}</p></div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} ${t("loadingCave")}</div>
    ${sceneError ? `<div class="cave-fallback">${art("treasure-cave")}</div>` : ""}
    ${!unloading && !sceneError ? walkControls : ""}
    ${unloading ? `<div class="cave-bottom unload-status">${finished ? `<button class="wood-button primary" data-action="stay-cave">${t("exploreCave")} ${icon("chest")}</button>` : `<p>${t("unopenedSafe")}</p>`}</div>` : `<div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${t("bankedGold")}</span><strong>${format(gold)} <span>${t("gold")}</span></strong><p id="math-cave-reserve" hidden></p><p>${t("caveSummary", { gold: format(cargoGold(progress)), count: format(progress.solved) })}</p></div><div class="cave-actions"><button class="round-button" data-action="cave-reset" aria-label="${t("returnEntrance")}">${icon("compass")}</button><button class="text-button" data-action="ship">${t("visitShip")} ${icon("ship")}</button></div><p class="cave-controls"><span id="math-cave-room">${t("entrance")}</span><span class="cave-keyboard-instructions"> · ${t("walkKeyboard")}</span><span class="cave-touch-instructions"> · ${t("walkTouch")}</span></p></div>`}
  </section>`;
}
function completeView(): string {
  return `<section class="complete-view"><span class="eyebrow">${selectedPack().name}</span><h1>${t("wellSailed")}</h1>${stars(outcome?.stars ?? 1)}<p>${t("completeNoGold", { count: format(level) })}<br />${t("nextGold")}</p><div class="completion-ship" aria-hidden="true">${pirateShipArt("complete")}</div><button class="wood-button primary" data-action="reward-next">${t("nextIsland")} ${icon("ship")}</button></section>`;
}
function settingsView(): string {
  return `<section class="settings-view"><div class="page-heading"><span class="eyebrow">${t("orders")}</span><h1>${t("howPlay")}</h1></div><div class="settings-card"><div class="language-setting"><label for="game-language">${t("language")}${i18n.language === "en" ? "" : ' <span lang="en">/ Language</span>'}</label><select id="game-language" aria-describedby="language-detail language-save-error"><option value="auto" ${languagePreference === "auto" ? "selected" : ""}>${t("automatic")}</option>${LANGUAGES.map(language => `<option lang="${language.id}" value="${language.id}" ${languagePreference === language.id ? "selected" : ""}>${language.name}</option>`).join("")}</select><p id="language-detail">${t("languageDetail", { language: LANGUAGES.find(language => language.id === i18n.language)!.name })}</p><p id="language-save-error" role="status" ${languageSaveFailed ? "" : "hidden"}>${t("languageSaveError")}</p></div><div class="captains-guide"><h2>${t("guide")}</h2><p>${t("guidePlay")}</p><p>${t("rewardRule")} ${t("firstTryGuide")} ${t("cargoGuide")}</p><p>${t("guideHints")} ${t("unopenedSafe")}</p><button type="button" class="privacy-action" data-open-privacy>${t("privacyEnglish")}</button><div class="guide-footer">${icon("anchor")} ${saveFailed ? t("saveError") : t("saveOk")}</div></div></div></section>`;
}
function render(): void {
  mapPan?.destroy(); mapPan = null;
  document.documentElement.lang = i18n.language;
  document.title = `Captain Calculus · ${t("subtitle")}`;
  canvas.setAttribute("aria-label", t("visitOwnCave"));
  root.dataset.screen = screen;
  root.dataset.operator = operator;
  root.dataset.saveFailed = String(saveFailed);
  root.innerHTML = `${header()}<main id="main-content">${{
    home, operators: operatorView, map: mapView, levels: levelsView, question: questionView,
    reward: () => shipView(true), ship: () => shipView(false), unloading: () => caveView(true), cave: () => caveView(false), complete: completeView, settings: settingsView,
  }[screen]()}</main>${saveFailed && screen !== "settings" ? `<div class="save-notice" role="status">${t("saveNotice")}</div>` : ""}`;
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

root.addEventListener("change", event => {
  const select = event.target as HTMLSelectElement;
  if (select.id !== "game-language" || !isLanguagePreference(select.value)) return;
  cave?.dispose(); cave = null;
  languagePreference = select.value;
  languageSaveFailed = !saveLanguagePreference(languagePreference, storage);
  i18n = selectLanguage(languagePreference, deviceLanguages());
  const scrollTop = root.querySelector("#main-content")!.scrollTop;
  render(); root.querySelector("#main-content")!.scrollTop = scrollTop;
  root.querySelector<HTMLSelectElement>("#game-language")?.focus({ preventScroll: true });
});
window.addEventListener("languagechange", () => {
  if (languagePreference !== "auto") return;
  i18n = selectLanguage(languagePreference, deviceLanguages()); render();
});
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
  if ((event.target as HTMLElement).closest("select, input, textarea")) return;
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
