import { adventureChart, sailToShore } from "../ui/adventureChart";
import { pirateMenu, settingsDesk } from "../ui/homeMenu";
import { answerHaptic, installButtonHaptics } from "../ui/buttonHaptics";
import { installPrivacy } from "../ui/privacy";
import { installMenuPreview } from "../ui/menuPreview";
import { icon } from "../ui/icons";
import { backButton } from "../ui/menuChrome";
import { caveHeader, caveNotice, caveTally } from "../ui/caveHud";
import { pirateShipArt } from "../ui/worldArt";
import { worldFor } from "./worlds";
import { atlasRenderer, atlasView, worldAsset, worldIsland } from "../ui/worldAtlas";
import { mountMapPan, type MapCamera, type MapPanController } from "../ui/mapPan";
import {
  OPERATORS, getOperator, getPack, packsFor,
  readMathProgress, saveMathProgress, trackFor, startVoyage, questionsFor,
  answerQuestion, goldTotal, pendingMathChests, bankedGold, cargoGold,
  type OperatorId, type Voyage, type Question, type AnswerResult,
} from "./academy";
import { detectLanguage, LANGUAGES, readLanguagePreference, saveLanguagePreference } from "./i18n";
import { selectLanguage } from "./language";
import type { GoldCave } from "./goldCave";
import "./style.css";
import { difficultyMap } from "../ui/difficultyMap";
import { islandArt } from "../ui/islandChart";

import "./adventure.css";
import "./focus.css";
import "./home.css";
import "./gameHud.css";
import { languagePickerMarkup, bindLanguagePicker } from "../ui/languagePicker";
import { clockSteps, type ClockStep } from "./clock";
import { clockBoard, clockLevelKey, newClockRound } from "./clockBoard";
import "./clock.css";
import "./overworld.css";
import "./treasureChart.css";
import { ledgerStars, rewardLedger } from "../ui/rewardLedger";
import "./rewardScene.css";

type Screen = "home" | "operators" | "map" | "levels" | "question" | "reward" | "ship" | "unloading" | "complete" | "cave" | "settings" | "clockMap" | "clock";
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
type SavedCamera = { state: MapCamera; width: number; height: number };
const previousTrails = new Map<string, SavedCamera>();
let trailCamera: SavedCamera | undefined;
let mapPan: MapPanController | null = null;
const packCameras = new Map<OperatorId | "clock", SavedCamera>();
let voyage: Voyage | null = null, question: Question | null = null, outcome: AnswerResult | null = null;
let answer = "", feedback: "" | "firstWrong" | "retryWrong" = "", accepted = false, saveFailed = false;
let clockStep: ClockStep = 60;
let clockRound: ReturnType<typeof newClockRound> | undefined;
let cave: GoldCave | null = null, sceneError = false, sceneLoading = false, revealReady = false, viewId = 0;
const art = (file: string, cls = "", alt = "") => `<img class="${cls}" src="${import.meta.env.BASE_URL}assets/map/${file}.webp" alt="${alt}" draggable="false" />`;
const format = (value: number) => i18n.format(value);
const navNumber = (value: number) => value < 1000 ? format(value) : new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
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

const screenLabel = {
  home: "home", operators: "operators", map: "islands", levels: "levelMap",
  question: "problemDestination", clock: "clockAdventure", clockMap: "clockAdventure", cave: "cave", unloading: "cave",
  ship: "ship", reward: "ship", complete: "levelMap", settings: "settings",
} as const;
const backLabel = (destination: Screen) => t("backTo", { destination: t(screenLabel[destination]) });
const gameBack = (destination: Screen) => backButton({ action: "back", label: t("back"), accessibleLabel: backLabel(destination) });

function caveHud(): string {
  const gold = bankedGold(progress);
  return caveHeader(gameBack(treasureParent()), t("cave"), {
    amount: gold,
    accessible: t("safeCave", { gold: format(gold) }),
    currency: t("gold"),
    locale: i18n.language,
  });
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
    <h1><span>Captain</span> Calculus</h1>
    ${pirateMenu({title:t("home"),theme:"calculus-home-actions",play:{action:"play",label:t("play")},
      resume:saved?{action:"resume",label:t("continue"),detail:`${operatorName(getPack(saved.pack).operator)} · ${localizedPack(saved.pack).label} · ${t("level",{count:format(saved.run.level)})} · ${t("solvedCount",{count:format(saved.run.solved)})}`}:undefined,
      ship:{action:"ship",label:t("yourShip"),detail:pending},cave:{action:"cave",label:t("yourCave"),detail:t("savedGold",{gold:navNumber(gold)}),accessible:t("savedGold",{gold:format(gold)})},
      settings:{action:"settings",label:t("settings")},language:{action:"language",label:languageChoice().flag,accessible:t("language")}})}
  </section>`;
}
const completedLabel = (count: number) => t(count === 1 ? "levelCompleted" : "levelsCompleted", { count: format(count) });
let lastShore:OperatorId|"clock"=progress.operator;
function operatorView(): string {
  const places = OPERATORS.map(op => {
    const cleared = packsFor(op.id).reduce((sum, pack) => sum + (progress.tracks[pack.id]?.cleared ?? 0), 0);
    return { id: op.id as OperatorId | "clock", region: worldFor(op.id).name, lesson: operatorName(op.id), cleared };
  });
  places.push({ id: "clock", region: t("clockIsland"), lesson: t("clockAdventure"), cleared: progress.completedClockSteps.length });
  const title = t("chooseAdventure");
  return `<section class="calculus-overworld">
    <header>${gameBack("home")}<h1 class="visually-hidden">${title}</h1></header>
    <nav aria-label="${title}" class="overworld-chart">${adventureChart("operator", places.map(({id,region,lesson,cleared})=>({
      id,label:lesson,detail:region,tally:completedLabel(cleared),accessible:[lesson,region,completedLabel(cleared)].join(", "),
      art:'<span class="map-symbol" aria-hidden="true"></span>',moored:id===lastShore
    })))}</nav>
  </section>`;
}
function clockMapView(): string {
  return difficultyMap({ name: t("clockIsland"), accessibleName: t("clockAdventure"),
    instructions: t("dragDifficulty"), back: gameBack("operators"), selected: clockStep,
    centerLabel: t("currentIsland"), firstArt: 2, island: () => islandArt(2),
    stops: clockSteps.map((step, index) => ({ id: step, label: t(clockLevelKey(step)),
      description: t("level", { count: index + 1 }), progress: completedLabel(Number(progress.completedClockSteps.includes(step))), ariaLabel: t(clockLevelKey(step)) })) });
}
function mapView(): string {
  const world = worldFor(operator);
  return difficultyMap({ name: world.name, accessibleName: t("mapAccessible", { world: world.name }),
    instructions: t("dragDifficulty"), back: gameBack("operators"), selected: packId, centerLabel: t("currentIsland"),
    firstArt: 0, island: i => worldIsland(operator, i), backdrop: worldAsset(operator),
    stops: packsFor(operator).map((pack,i) => {
      const p = localizedPack(pack.id);
      return { id: p.id, label: p.label, description: world.chapterNames[i], progress: completedLabel(progress.tracks[p.id]?.cleared ?? 0), ariaLabel: `${p.label}: ${p.description}` };
    }) });
}
function levelsView(): string {
  const p = selectedPack();
  return atlasView(p.operator, p.label, gameBack("map"), packTrail().cleared + 1, i18n);
}
function mountMathMap(scroller: HTMLElement): void {
  scroller.scrollTop = scroller.scrollLeft = 0;
  const viewport = scroller.querySelector<HTMLElement>("[data-map-viewport]");
  const world = viewport?.querySelector<HTMLElement>("[data-map-world]");
  if (!viewport || !world) return;
  const isTrail = screen === "levels", mapOperator = screen === "clockMap" ? "clock" : operator;
  const draw = isTrail ? atlasRenderer(world, operator, packTrail(), i18n) : undefined;
  const saved = isTrail ? trailCamera : packCameras.get(mapOperator);
  mapPan = mountMapPan(viewport, world, {
    focus: { x: Number(viewport.dataset.focusX ?? world.offsetWidth / 2), y: Number(viewport.dataset.focusY ?? world.offsetHeight / 2) },
    scale: Number(viewport.dataset.mapScale) || (isTrail ? .94 : 1),
    coverViewport: !isTrail, unbounded: isTrail,
    state: saved && (isTrail || (saved.width === viewport.clientWidth && saved.height === viewport.clientHeight))
      ? { ...saved.state, x: saved.state.x + (viewport.clientWidth - saved.width) / 2, y: saved.state.y + (viewport.clientHeight - saved.height) * .46 }
      : undefined,
    onChange: (state, origin) => {
      const camera = { state, width: viewport.clientWidth, height: viewport.clientHeight };
      if (draw) {
        trailCamera = camera;
        draw(state, origin, viewport.clientWidth, viewport.clientHeight);
        previousTrails.set(packId, camera);
      } else packCameras.set(mapOperator, camera);
    },
  });
}
function questionView(): string {
  const q = question!, op = getOperator(q.operator), solved = voyage!.solved;
  const earned = voyage!.earnedGold;
  const rewardAvailable = voyage!.problemMistakes === 0;
  const stake = accepted ? outcome?.goldEarned ? t("answerGold") : t("answerNoGold") : rewardAvailable ? t("atStake") : t("lostStake");
  const message = accepted ? outcome?.levelComplete ? t("levelGold", { gold: format(outcome.levelGold) }) : outcome?.goldEarned ? t("firstCorrect") : t("retryCorrect") : (feedback ? t(feedback) : "");
  const problemTitle = accepted && outcome?.levelComplete ? t("voyageComplete") : t("problem", { count: Math.min(solved + (accepted ? 0 : 1), 10) });
  const marks = Array.from({ length: 10 }, (_, index) => `<span class="${index < solved ? "solved" : ""}"></span>`).join("");
  return `<section class="question-view"><div class="math-card ${accepted ? "correct" : feedback ? "try-again" : ""}"><div class="question-heading"><h1 class="eyebrow">${problemTitle}</h1><div class="problem-marks" aria-hidden="true">${marks}</div></div><div class="equation" aria-label="${t("equation", { left: q.left, operator: i18n.spokenOperator(q.operator), right: q.right })}"><span class="term left-term">${q.left}</span><span class="equation-operator">${op.symbol}</span><span class="term right-term">${q.right}</span><span class="equals">=</span><output id="answer" class="answer-box ${answer ? "filled" : ""}" aria-label="${t("yourAnswer")}" aria-live="polite">${answer || "?"}</output></div><p id="answer-feedback" class="answer-feedback ${accepted ? "success" : feedback ? "retry" : ""}" role="status">${message}</p><div class="number-pad" aria-label="${t("numberPad")}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}" ${accepted ? "disabled" : ""}>${n}</button>`).join("")}<button data-key="0" ${accepted ? "disabled" : ""}>0</button><button class="key-delete" data-key="delete" aria-label="${t("deleteDigit")}" ${accepted ? "disabled" : ""}>⌫</button></div><button id="check-answer" ${accepted ? "" : "data-answer-haptic"} class="wood-button primary check-answer" data-action="${accepted ? "continue" : "check"}" ${!accepted && !answer ? "disabled" : ""}>${accepted ? outcome?.chestEarned ? `${t("openChest")} ${icon("chest")}` : outcome?.levelComplete ? `${t("seeStars")} ${icon("star")}` : `${t("nextProblem")} ${icon("arrow")}` : `${t("checkAnswer")} ${icon("arrow")}`}</button></div><div class="chest-distance">${icon("chest")}<span><b>${t("earnedLevel", { gold: format(earned), maximum: format(1000) })}</b><br />${stake}</span></div></section>`;
}
const retryScene = () => `<button class="text-button retry-scene" data-action="retry-scene">${t("retryScene")}</button>`;
function shipView(): string {
  const pending = pendingMathChests(progress);
  return `<section class="cave-view ship-view">
    <div class="scene-back">${gameBack(treasureParent())}</div>
    <div class="cave-heading"><span class="eyebrow">${t("aboardPearl")}</span><h1>${t("hold")}</h1><p ${sceneError ? 'role="status"' : ''}>${sceneError ? t("shipError") : t("cargoSummary", { count: pending.length, gold: format(cargoGold(progress)) })}</p>${sceneError ? retryScene() : ""}</div>
    <div class="cave-loading" role="status" ${!sceneLoading ? "hidden" : ""}>${icon("chest")} ${t("boarding")}</div>
    ${sceneError ? `<div class="cave-fallback">${art("first-sails")}</div>` : ""}
    <div class="cave-bottom"><div class="hoard-total"><span class="eyebrow">${t("savedCargo")}</span><strong>${format(cargoGold(progress))} <span>${t("goldAboard")}</span></strong><p>${t("alreadyCave", { gold: format(bankedGold(progress)) })}</p></div>${!pending.length ? `<p class="empty-cargo" role="status">${t("noCargo")}</p>` : ""}<button class="wood-button primary" data-action="${pending.length ? "unload" : "cave"}" ${sceneLoading ? "disabled" : ""}>${t(pending.length ? "returnCave" : "exploreCave")} ${icon("chest")}</button><button class="text-button" data-action="levels">${t("keepPractising")} ${icon("ship")}</button></div>
  </section>`;
}
function rewardView(withChest: boolean): string {
  const disabled = withChest && !revealReady && !sceneError;
  const status = sceneError ? t("shipError") : disabled ? t("boarding") : "";
  const starCount = outcome?.stars ?? 1;
  return `<section class="reward-view reward-dock">
    <div class="reward-back">${gameBack(voyageReturn)}</div>
    ${(!withChest || sceneError) ? `<div class="reward-ship" aria-hidden="true">${pirateShipArt("reward-ship")}</div>` : ""}
    ${rewardLedger({
      title: withChest ? `<strong>${format(cargoGold(progress))}</strong> ${t("goldAboard")}` : t("completeNoGold", { count: format(level) }),
      marks: ledgerStars(starCount, t("stars", { count: format(starCount) })),
      details: withChest && status ? `<div class="ledger-details"><p role="status">${status}</p>${sceneError ? retryScene() : ""}</div>` : "",
      actions: [
        { action: "reward-next", label: t("nextIsland"), icon: "ship", primary: true, disabled },
        { action: "reward-replay", label: t("replayLevel"), disabled },
        { action: "unload", label: t("returnCave"), disabled },
      ],
    })}
  </section>`;
}
function caveView(unloading: boolean): string {
  if (sceneError) return `<section class="cave-view quiet-cave">${caveNotice(t("caveLoadError"), retryScene())}</section>`;
  if (sceneLoading) return `<section class="cave-view quiet-cave">${caveNotice(t("loadingCave"))}</section>`;
  const pending = pendingMathChests(progress);
  if (unloading) {
    const total = cave?.unloading.total || pending.length;
    const count = Math.min((cave?.unloading.delivered ?? 0) + 1, total);
    return `<section class="cave-view quiet-cave">${caveTally(t("unloadProgress", { count, total, gold: format(cargoGold(progress)) }))}</section>`;
  }
  return `<section class="cave-view walking-view quiet-cave">
    <div class="cave-walk-controls"><span class="cave-crosshair" aria-hidden="true">+</span><button id="math-cave-pad" aria-label="${t("moveCave")}"><span id="math-cave-thumb"></span><small>${t("move")}</small></button><button id="math-cave-jump" aria-label="${t("jump")}">↑<small>${t("jump")}</small></button><button id="math-cave-inspect" class="text-button" data-action="cave-inspect" disabled>${t("inspectTreasure")}</button></div>
    <button class="quiet-ship" data-action="ship" aria-label="${t("ship")}: ${i18n.plural("aboard", pending.length)}">${icon("ship")} ${t("ship")}</button>
    <span id="math-cave-room" class="visually-hidden">${t("entrance")}</span>
  </section>`;
}
function settingsView(): string {
  return settingsDesk(t("settings"),`<button class="desk-action" data-action="language" aria-haspopup="dialog"><strong>${t("language")}</strong><span>${languageLabel()}</span></button>
      <button class="desk-action" data-open-privacy>${t("privacyEnglish")}</button>
      <p class="desk-save">${icon("anchor")} ${saveFailed ? t("saveError") : t("saveOk")}</p>
  `,gameBack("home"));
}
function render(preserveScroll = false): void {
  const scrollTop = preserveScroll ? root.querySelector("#main-content")?.scrollTop ?? 0 : 0;
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
  root.innerHTML = `${screen === "cave" || screen === "unloading" ? caveHud() : ""}${screen === "question" ? `<div class="question-back">${gameBack(voyageReturn)}</div>` : ""}<main id="main-content">${{
    home, operators: operatorView, map: mapView, levels: levelsView, question: questionView,
    clockMap: clockMapView, clock: () => clockBoard(clockRound!, i18n, gameBack("clockMap")),
    reward: () => rewardView(true), ship: shipView, unloading: () => caveView(true), cave: () => caveView(false), complete: () => rewardView(false), settings: settingsView,
  }[screen]()}</main>${saveFailed && screen !== "settings" ? `<div class="save-notice" role="status">${t("saveNotice")}</div>` : ""}`;
  const scroller = document.querySelector<HTMLElement>("#main-content")!;
  if (screen === "levels" || screen === "map" || screen === "clockMap") mountMathMap(scroller);
  else scroller.scrollTop = scrollTop;
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
        if (screen === "unloading" && !sceneError && cave?.unloading.done) {
          cave.finishUnloadForWalk();
          show("cave");
        } else if (screen === "reward" || screen === "ship") {
          revealReady = true; render();
        }
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
  trailCamera = recenter ? undefined : previousTrails.get(packId);
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
  answer = ""; feedback = ""; accepted = false; outcome = null;
  question = questionsFor(packId, voyage!.seed, voyage!.questionSet)[voyage!.solved]!;
  show("question");
}
function enterKey(key: string): void {
  if (screen !== "question" || accepted) return;
  if (key === "delete") answer = answer.slice(0, -1);
  else if (/^\d$/.test(key) && answer.length < 3) answer = answer === "0" ? key : answer + key;
  feedback = "";
  const output = root.querySelector<HTMLOutputElement>("#answer")!;
  output.textContent = answer || "?"; output.classList.toggle("filled", !!answer);
  root.querySelector<HTMLButtonElement>("#check-answer")!.disabled = !answer;
  const message = root.querySelector<HTMLElement>("#answer-feedback")!;
  message.textContent = ""; message.classList.remove("retry");
  root.querySelector(".math-card")!.classList.remove("try-again");
}
function checkAnswer(): void {
  if (screen !== "question" || accepted || !answer) return;
  const firstMistake = voyage!.problemMistakes === 0;
  const result = answerQuestion(progress, packId, level, Number(answer));
  if (!result) return;
  answerHaptic(result.correct);
  persist();
  if (result.correct) { accepted = true; outcome = result; }
  else { feedback = firstMistake ? "firstWrong" : "retryWrong"; answer = ""; }
  render(true);
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
  else if (screen === "map") show("operators", `button[data-operator="${operator}"]`);
  else if (screen === "clock") show("clockMap", `[data-pack="${clockStep}"]`);
  else if (screen === "clockMap") {
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
document.body.append(picker);

function languageChoice() {
  const language = LANGUAGES.find(lang => lang.id === i18n.language)!;
  return { flag: language.flag, name: languagePreference === "auto" ? "Auto" : language.name };
}
function languageLabel() {
  const { name, flag } = languageChoice();
  return `<span aria-hidden="true">${flag}</span> ${name}`;
}
const languageMenu = bindLanguagePicker(picker,{
  markup:failed=>languagePickerMarkup(i18n,languagePreference,deviceLanguages(),failed||languageSaveFailed),
  trigger:()=>root.querySelector('[data-action="language"]'),
  select:choice=>{
    languagePreference=choice;
    languageSaveFailed=!saveLanguagePreference(choice,storage);
    i18n=selectLanguage(choice,deviceLanguages());
    const scroll=root.querySelector("#main-content")!.scrollTop;
    render();root.querySelector("#main-content")!.scrollTop=scroll;
    return !languageSaveFailed;
  }
});
for (const type of ["contextmenu", "selectstart"]) {
  document.addEventListener(type, event => event.preventDefault());
}
window.addEventListener("languagechange", () => {
  if (languagePreference !== "auto") return;
  i18n = selectLanguage(languagePreference, deviceLanguages()); render();
  if (picker.open) languageMenu.draw();
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (sailToShore(event,root)) return;
  if (button.dataset.operator) lastShore=button.dataset.operator as typeof lastShore;
  if (button.dataset.operator === "clock") {
    show("clockMap");
    return;
  }
  if (screen === "clockMap" && button.dataset.pack) {
    const selected = clockSteps.find(step => String(step) === button.dataset.pack);
    if (!selected) return;
    clockStep = selected;
    if (clockRound?.step !== selected) clockRound = newClockRound(seed(), selected);
    show("clock");
    return;
  }
  if (button.dataset.clockTime !== undefined && screen === "clock") {
    const round = clockRound!;
    const question = round.questions[round.index];
    const time = Number(button.dataset.clockTime);
    if (!question || round.correct || round.rejected.has(time) || !question.choices.includes(time)) return;
    round.correct = time === question.time;
    answerHaptic(round.correct);
    if (round.correct && round.index === round.questions.length - 1 && !progress.completedClockSteps.includes(round.step)) {
      progress.completedClockSteps.push(round.step);
      persist();
    }
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
    case "language": if (screen === "settings" || screen === "home") languageMenu.open(); break;
    case "settings":
      if (screen === "home") show("settings");
      break;
    case "cave":
      if (screen === "cave" || screen === "unloading") break;
      treasureTrail.push(screen);
      void showGold(false);
      break;
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
    case "cave-inspect": cave?.inspect(); break;
    case "resume": {
      const saved = resumeRun();
      if (saved) { packId = saved.pack; beginLevel(saved.run.level, "home"); }
      break;
    }
    case "levels": openLevels(); break;
    case "clock-next":
      if (clockRound?.correct) {
        clockRound.index++;
        clockRound.correct = false;
        clockRound.rejected.clear();
        show("clock");
      }
      break;
    case "clock-restart":
      clockRound = newClockRound(seed(), clockStep);
      show("clock");
      break;
    case "check": checkAnswer(); break;
    case "continue": continueAfterAnswer(); break;
    case "reward-next": nextVoyage(); break;
    case "reward-replay":
      if ((screen === "reward" || screen === "complete") && outcome?.levelComplete) beginLevel(level);
      break;
  }
});
document.addEventListener("keydown", (event) => {
  if (picker.open) return;
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
