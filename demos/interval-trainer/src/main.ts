/**
 * Interval Trainer — hear the root and fifth together, name the note that follows.
 *
 * This file owns the app's state and its round lifecycle; everything it coordinates lives
 * in a module of its own:
 *
 *   core/    the rules — intervals, question generation, scoring, storage. Pure, tested.
 *   audio/   the AudioContext, the synthesised piano voice, and the note sequencer.
 *   ui/      the DOM: keypad, stage, HUD, overlays, and the wave field behind it all.
 *
 * State is a handful of module-level `let`s mutated by the handlers below — the same
 * arrangement `demos/tube-sim/src/main.ts` uses, and for the same reason: there is one of
 * everything, and a store would be ceremony around a dozen variables.
 */

import './style.css';

import { AudioEngine } from './audio/engine.ts';
import { Player, TARGET_AT_MS } from './audio/player.ts';
import { answersFor, DIFFICULTIES, type Difficulty } from './core/difficulty.ts';
import { intervalBySemitones, NOTE_NAMES, noteName } from './core/intervals.ts';
import {
  insertScore,
  loadBoards,
  qualifies,
  sanitizeName,
  saveBoards,
  type Boards,
} from './core/highscores.ts';
import { loadPrefs, savePrefs, type Prefs } from './core/prefs.ts';
import { makeQuestion, type Question, type RootMode } from './core/question.ts';
import { addTime, scoreAnswer, START_SECONDS } from './core/scoring.ts';
import {
  clearStats,
  emptyStats,
  loadStats,
  record,
  saveStats,
  type StatsMap,
} from './core/stats.ts';
import { qs } from './ui/dom.ts';
import { Hud } from './ui/hud.ts';
import { Keypad } from './ui/keypad.ts';
import { buildMenu } from './ui/menu.ts';
import { Overlay } from './ui/overlay.ts';
import { buildGameOver, buildScoreboard, type GameSummary } from './ui/scoreboard.ts';
import { buildSettings } from './ui/settings.ts';
import { Stage } from './ui/stage.ts';
import { renderStatsStrip } from './ui/statsStrip.ts';
import { Tutorial, markTutorialSeen, tutorialSeen } from './ui/tutorial.ts';
import { WaveField } from './ui/waves.ts';

type Mode = 'practice' | 'game';

/** How long the answer stays on screen before the next question. */
const REVEAL_MS = { correct: 850, wrong: 1600 } as const;

// --- wiring -----------------------------------------------------------------

const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const waves = new WaveField(qs<HTMLCanvasElement>('#waves'), params.has('canvas2d'));
waves.setReducedMotion(reducedMotion);

const stage = new Stage(
  qs('#key-name'),
  qs('#prompt'),
  qs('#note-root'),
  qs('#note-fifth'),
  qs('#note-target'),
);

const hud = new Hud(
  qs('#mode-chip'),
  qs('#difficulty-chip'),
  qs('#readouts'),
  qs('#score'),
  qs('#streak'),
  qs('#time'),
  qs('#timebar'),
  qs('#timebar-fill'),
);

const engine = new AudioEngine();
const player = new Player(engine, waves, stage);
const overlay = new Overlay(qs('#overlay'), qs('#overlay-card'));
const keypad = new Keypad(qs('#keypad'), (semitones) => answer(semitones));
const statsStrip = qs('#stats-strip');
const contextButton = qs<HTMLButtonElement>('#context-btn');

// --- state ------------------------------------------------------------------

let prefs: Prefs = loadPrefs();
let stats: StatsMap = loadStats();
let sessionStats: StatsMap = emptyStats();
let boards: Boards = loadBoards();
/** Which board the scoreboard is showing; follows the difficulty unless you tab away. */
let shownBoard: Difficulty = prefs.difficulty;

let mode: Mode = 'practice';
/**
 * A run is played at one difficulty from beginning to end, so the rules cannot change
 * under a score that is already on the clock. Changing the setting mid-run starts a fresh
 * run instead (see `restartOnResume`).
 */
let runDifficulty: Difficulty = prefs.difficulty;
let restartOnResume = false;
/**
 * The key this run is in. Easy and Medium hold one key from the first question to the
 * last — that is most of what makes them easier — so it is drawn once, here, rather than
 * per question. Hard leaves it `'random'` and lets every question re-roll.
 */
let runRootMode: RootMode = 'random';
let question: Question | null = null;
let previousSemitones: number | undefined;
let awaitingAnswer = false;
/** `performance.now()` at the moment the target note sounded — the answer clock's zero. */
let targetSoundedAt = 0;

let score = 0;
let streak = 0;
let correctCount = 0;
let wrongCount = 0;
let clock = START_SECONDS;
let clockRunning = false;
let lastFrame = 0;
let nextQuestionTimer = 0;

// --- rounds -----------------------------------------------------------------

/** The key for a fresh run: pinned in settings, drawn once, or left moving on Hard. */
function rollRunKey(): RootMode {
  if (DIFFICULTIES[runDifficulty].movingKey) return 'random';
  if (prefs.rootMode !== 'random') return prefs.rootMode;
  return Math.floor(Math.random() * 12);
}

function nextQuestion(): void {
  window.clearTimeout(nextQuestionTimer);
  keypad.clearMarks();
  stage.reset();

  question = makeQuestion(
    { rootMode: runRootMode, degrees: DIFFICULTIES[runDifficulty].semitones },
    Math.random,
    previousSemitones,
  );
  previousSemitones = question.semitones;
  stage.setKey(noteName(question.rootMidi));
  stage.setPrompt('Listen…');

  awaitingAnswer = false;
  keypad.setEnabled(false);
  setContextButtonEnabled(false);

  player.playQuestion(question, { onTarget: openForAnswers });
}

function openForAnswers(): void {
  targetSoundedAt = performance.now();
  awaitingAnswer = true;
  keypad.setEnabled(true);
  setContextButtonEnabled(true);
  stage.setPrompt('Which note was that?');
}

function replay(): void {
  if (!question) return;
  // Replaying deliberately does not reset `targetSoundedAt`: the speed bonus is for
  // hearing the interval, not for re-triggering the clock.
  player.playQuestion(question, {
    onTarget: () => {
      if (!awaitingAnswer) openForAnswers();
    },
  });
}

function playContext(): void {
  // Only once the target has already sounded: playing the context cancels whatever is
  // scheduled, so doing it mid-phrase would eat the target note and leave the question
  // unanswerable.
  if (question && awaitingAnswer) player.playQuestion(question, { contextOnly: true });
}

/** The context button is meaningless until the whole phrase has been heard once. */
function setContextButtonEnabled(enabled: boolean): void {
  contextButton.disabled = !enabled;
}

function answer(semitones: number): void {
  if (!question || !awaitingAnswer) return;
  awaitingAnswer = false;
  keypad.setEnabled(false);
  setContextButtonEnabled(false);

  const truth = question.semitones;
  const isCorrect = semitones === truth;
  const elapsed = performance.now() - targetSoundedAt;
  const interval = intervalBySemitones(truth);

  keypad.mark(semitones, isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) keypad.mark(truth, 'correct');
  stage.reveal(interval.label, truth, isCorrect);

  stats = record(stats, truth, isCorrect);
  sessionStats = record(sessionStats, truth, isCorrect);
  saveStats(stats);
  if (mode === 'practice') renderStatsStrip(statsStrip, stats, runDifficulty);

  if (isCorrect) correctCount++;
  else wrongCount++;

  if (mode === 'game') {
    const outcome = scoreAnswer(isCorrect, elapsed, streak);
    score += outcome.points;
    streak = outcome.streak;
    clock = addTime(clock, outcome.timeDelta);
    hud.setScore(score);
    hud.setStreak(streak);
    hud.setTime(clock);
    // The chip flies from the note you just named: the seconds visibly come from there.
    if (outcome.timeDelta > 0) hud.flyTime(outcome.timeDelta, stage.centerOf('target'));
    if (outcome.points > 0) {
      const label =
        outcome.speedTier === 'fast' ? 'fast!' : outcome.speedTier === 'quick' ? 'quick' : '';
      hud.floatPoints(outcome.points, label);
    }
  }

  stage.setPrompt(
    isCorrect
      ? `${interval.label} — ${interval.name}`
      : `It was ${interval.label} — ${interval.name}`,
    isCorrect ? 'good' : 'bad',
  );

  // In practice there is no clock to protect, so a miss gets the phrase played back with
  // the answer on screen. That replay is the actual lesson.
  const delay = REVEAL_MS[isCorrect ? 'correct' : 'wrong'];
  if (!isCorrect && mode === 'practice' && question) {
    const current = question;
    window.setTimeout(() => {
      if (question === current) player.playQuestion(current);
    }, 350);
    nextQuestionTimer = window.setTimeout(nextQuestion, delay + TARGET_AT_MS);
  } else {
    nextQuestionTimer = window.setTimeout(nextQuestion, delay);
  }
}

// --- game clock --------------------------------------------------------------

function tick(now: number): void {
  if (!clockRunning) return;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  clock = Math.max(0, clock - dt);
  hud.setTime(clock);
  if (clock <= 0) {
    endGame();
    return;
  }
  requestAnimationFrame(tick);
}

function startClock(): void {
  clockRunning = true;
  lastFrame = performance.now();
  requestAnimationFrame(tick);
}

function stopClock(): void {
  clockRunning = false;
}

// --- modes -------------------------------------------------------------------

function startMode(next: Mode): void {
  overlay.hide();
  mode = next;
  runDifficulty = prefs.difficulty;
  restartOnResume = false;
  hud.setMode(mode);
  hud.setDifficulty(DIFFICULTIES[runDifficulty].label);
  statsStrip.hidden = mode !== 'practice';
  if (mode === 'practice') renderStatsStrip(statsStrip, stats, runDifficulty);

  keypad.setAnswers(answersFor(runDifficulty));
  runRootMode = rollRunKey();
  previousSemitones = undefined;

  score = 0;
  streak = 0;
  correctCount = 0;
  wrongCount = 0;
  clock = START_SECONDS;
  sessionStats = emptyStats();
  hud.setScore(0);
  hud.setStreak(0);
  hud.setTime(clock);

  engine.unlock();
  nextQuestion();
  if (mode === 'game') startClock();
  else stopClock();
}

function endGame(): void {
  stopClock();
  window.clearTimeout(nextQuestionTimer);
  player.cancel();
  awaitingAnswer = false;
  keypad.setEnabled(false);
  keypad.clearMarks();
  stage.setPrompt("Time's up", 'neutral');

  const summary: GameSummary = {
    score,
    correct: correctCount,
    wrong: wrongCount,
    bestInterval: null,
    worstInterval: worstOf(sessionStats),
  };
  const difficulty = runDifficulty;
  const board = boards[difficulty];
  const makesBoard = qualifies(board, score);

  overlay.show(
    buildGameOver(
      summary,
      { qualifies: makesBoard, difficulty },
      {
        onSave: (name) => {
          boards = {
            ...boards,
            [difficulty]: insertScore(board, {
              name: sanitizeName(name),
              score,
              correct: correctCount,
              wrong: wrongCount,
              key: runRootMode === 'random' ? 'random' : NOTE_NAMES[runRootMode],
              dateISO: new Date().toISOString(),
            }),
          };
          saveBoards(boards);
          shownBoard = difficulty;
          showScores(boards[difficulty].findIndex((entry) => entry.score === score));
        },
        onPlayAgain: () => startMode('game'),
        onMenu: showMenu,
      },
    ),
    { dismissible: false },
  );
}

/** The interval missed most often this game, for the end card's one line of advice. */
function worstOf(map: StatsMap): string | null {
  let worst: { label: string; rate: number } | null = null;
  for (const [key, tally] of Object.entries(map)) {
    if (tally.total < 2) continue;
    const rate = tally.correct / tally.total;
    if (rate >= 0.75) continue;
    if (!worst || rate < worst.rate) {
      worst = { label: intervalBySemitones(Number(key)).label, rate };
    }
  }
  return worst?.label ?? null;
}

// --- overlays -----------------------------------------------------------------

function pause(): void {
  stopClock();
  player.cancel();
  window.clearTimeout(nextQuestionTimer);
  awaitingAnswer = false;
  keypad.setEnabled(false);
  setContextButtonEnabled(false);
}

function showMenu(): void {
  pause();
  stage.setPrompt(' ');
  // Choosing anything from the first-visit menu answers the tutorial offer, so next time
  // the full menu appears: skipping the tutorial must not hide the game behind it.
  const choose = (next: Mode) => () => {
    markTutorialSeen();
    startMode(next);
  };
  overlay.show(
    buildMenu(
      {
        onPractice: choose('practice'),
        onGame: choose('game'),
        onTutorial: showTutorial,
        onScores: () => showScores(),
        onDifficulty: (difficulty) => {
          applyPrefs({ ...prefs, difficulty });
          showMenu();
        },
      },
      {
        bestScore: boards[prefs.difficulty][0]?.score ?? null,
        difficulty: prefs.difficulty,
        firstVisit: !tutorialSeen(),
      },
    ),
    { dismissible: false },
  );
}

/**
 * Persist a preference change and push the parts of it that are on screen right now.
 * Difficulty is the one that reaches furthest: it re-lays the keypad, redraws the practice
 * strip, and draws a fresh key for the run.
 */
function applyPrefs(next: Prefs): void {
  const rulesChanged =
    next.difficulty !== prefs.difficulty || next.rootMode !== prefs.rootMode;
  prefs = next;
  savePrefs(prefs);
  waves.setEnabled(prefs.waves);
  document.body.dataset.difficulty = prefs.difficulty;
  hud.setDifficulty(DIFFICULTIES[prefs.difficulty].label);
  if (mode === 'practice') renderStatsStrip(statsStrip, stats, prefs.difficulty);
  if (rulesChanged) {
    shownBoard = prefs.difficulty;
    // Changing the rules mid-run would leave a score on the board under a difficulty it
    // was not played at, so the run starts over instead.
    restartOnResume = true;
  }
}

function showTutorial(): void {
  pause();
  new Tutorial(overlay, player, (next) => {
    if (next === 'menu') showMenu();
    else startMode(next);
  }).start();
}

function showScores(highlight?: number): void {
  pause();
  overlay.show(
    buildScoreboard(
      boards,
      shownBoard,
      {
        onClose: showMenu,
        onClear: () => {
          // Clearing is per board: wiping Easy should not cost you your Hard runs.
          boards = { ...boards, [shownBoard]: [] };
          saveBoards(boards);
          showScores();
        },
        onSelect: (difficulty) => {
          shownBoard = difficulty;
          showScores();
        },
      },
      highlight,
    ),
    { dismissible: false },
  );
}

/**
 * `wasPlaying` is a parameter rather than a local: every change in here re-renders the
 * panel, and `pause()` has already stopped the clock by then — recomputing it would make
 * the second visit think you were at the menu and drop you there when you close it.
 */
function showSettings(wasPlaying: boolean = clockRunning || awaitingAnswer): void {
  pause();
  overlay.show(
    buildSettings(
      { prefs, muted: engine.muted, forcedSilent: engine.forcedSilent, backend: waves.backendName },
      {
        onPrefs: (next) => {
          applyPrefs(next);
          // A changed key only takes effect on the next question, so say so.
          stage.setKey(question ? noteName(question.rootMidi) : '—');
          showSettings(wasPlaying);
        },
        onMute: (muted) => {
          engine.setMuted(muted);
          showSettings(wasPlaying);
        },
        onResetStats: () => {
          clearStats();
          stats = emptyStats();
          renderStatsStrip(statsStrip, stats, prefs.difficulty);
          showSettings(wasPlaying);
        },
        onClose: () => {
          overlay.hide();
          if (wasPlaying) resume();
          else showMenu();
        },
      },
    ),
    { dismissible: true, onDismiss: () => (wasPlaying ? resume() : showMenu()) },
  );
}

function resume(): void {
  if (restartOnResume) {
    startMode(mode);
    return;
  }
  if (mode === 'game') startClock();
  nextQuestion();
}

// --- input --------------------------------------------------------------------

qs('#replay').addEventListener('click', replay);
contextButton.addEventListener('click', playContext);
qs('#help-btn').addEventListener('click', showTutorial);
qs('#scores-btn').addEventListener('click', () => showScores());
qs('#settings-btn').addEventListener('click', () => showSettings());
qs('#mode-chip').addEventListener('click', showMenu);

document.addEventListener('keydown', (event) => {
  // The audio context can only be created from a gesture; every gesture is a chance.
  engine.unlock();
  if (overlay.visible) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === ' ' || event.key.toLowerCase() === 'r') {
    event.preventDefault();
    replay();
    return;
  }
  if (keypad.pressByKey(event.key)) event.preventDefault();
});

document.addEventListener('pointerdown', () => engine.unlock(), { passive: true });

// Coming back to a backgrounded tab with a running clock would otherwise land you mid-
// question with time already gone.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'game' && clockRunning) showMenu();
});

// --- boot ----------------------------------------------------------------------

waves.setEnabled(prefs.waves);
setContextButtonEnabled(false);
hud.setMode('practice');
hud.setDifficulty(DIFFICULTIES[prefs.difficulty].label);
hud.setTime(START_SECONDS);
stage.setPrompt(' ');
keypad.setAnswers(answersFor(prefs.difficulty));
renderStatsStrip(statsStrip, stats, prefs.difficulty);
document.body.dataset.difficulty = prefs.difficulty;
showMenu();
