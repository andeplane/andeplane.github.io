import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  cardName,
  describeMove,
  legalMoves,
  newGame,
  rankLabel,
  redeal,
  score,
  suitNames,
  suitSymbols,
  type Board,
  type Move,
  type Solution,
} from "./engine";
import "./styles.css";
import "./statistics.css";
import { HintArrows } from "./HintArrows";
import { GameIcon } from "./GameIcon";
import { useRoundAnalysis } from "./useRoundAnalysis";
import {
  appendAction,
  createSession,
  currentView,
  decodeReplay,
  encodeReplay,
  nextCursor,
  parentCursor,
  parseSession,
  seekSession,
  STORAGE_KEY,
  type ReplayAction,
  type ReplayNode,
  type ReplaySession,
} from "./replay";

type Flight = { card: number; from: DOMRect; to: DOMRect };
const fingerprint = (board: Board) =>
  JSON.stringify([board.piles, board.foundations, board.round]);

function initialBoard(): Board {
  const parameters = new URLSearchParams(location.search);
  try {
    return newGame(
      parameters.get("seed") ?? "20261111",
      Number(parameters.get("game") ?? 11),
    );
  } catch {
    return newGame();
  }
}

function initialSession(): ReplaySession {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const session = parseSession(JSON.parse(saved));
      const requested = new URLSearchParams(location.search);
      if (
        location.hash.startsWith("#replay=") ||
        (!requested.has("seed") && !requested.has("game")) ||
        (session.data.initial.seed === requested.get("seed") &&
          session.data.initial.gameIndex === Number(requested.get("game") ?? 0))
      )
        return session;
    }
  } catch {
    /* A damaged saved log must not prevent starting a game. */
  }
  return createSession(initialBoard());
}

function CardFace({ card }: { card: number }) {
  const suit = Math.floor(card / 13);
  const file = `${["C", "D", "H", "S"][suit]}-${rankLabel(card % 13)}.svg`;
  return (
    <img
      className="card-art"
      src={`${import.meta.env.BASE_URL}cards/${file}`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function Game() {
  const [session, setSession] = useState(initialSession);
  const sessionRef = useRef(session);
  const view = currentView(session);
  const board = view.board;
  const boardRef = useRef(board);
  const roundStart = view.roundStart;
  const [mode, setMode] = useState<"learning" | "manual">("learning");
  const [selected, setSelected] = useState<number | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [showFoundationTargets, setShowFoundationTargets] = useState(false);
  const step = view.step;
  const [message, setMessage] = useState(view.message);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingShared, setLoadingShared] = useState(() =>
    location.hash.startsWith("#replay="),
  );
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const plan = useRef<{ key: string; moves: Move[] } | null>(null);
  const flyingCard = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLElement>(null);
  const locked = useRef(false);
  const actionGeneration = useRef(0);
  const previousBoard = session.data.cursor
    ? session.views[parentCursor(session)].board
    : undefined;
  const analysis = useRoundAnalysis(
    board,
    roundStart,
    previousBoard?.round === board.round ? previousBoard : undefined,
    true,
  );

  useEffect(() => {
    const instance = new Worker(
      new URL("./solver.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("seed", board.seed);
    url.searchParams.set("game", String(board.gameIndex));
    window.history.replaceState(null, "", url);
  }, [board.seed, board.gameIndex]);

  useEffect(() => {
    let canceled = false;
    let generation = 0;
    const load = () => {
      const hash = location.hash;
      if (!hash.startsWith("#replay=")) return;
      const request = ++generation;
      setLoadingShared(true);
      setShareMessage("");
      setShareFallback("");
      decodeReplay(hash)
        .then((shared) => {
          if (canceled || request !== generation) return;
          actionGeneration.current++;
          requestId.current++;
          plan.current = null;
          locked.current = false;
          setBusy(false);
          setSearching(false);
          setFlight(null);
          setShuffling(false);
          updateSession(shared);
          setError("");
          setMode("learning");
          setLoadingShared(false);
          setShareMessage("Shared replay loaded.");
        })
        .catch(() => {
          if (canceled || request !== generation) return;
          setError(
            "This shared replay is invalid or could not be loaded. Your saved game is still available.",
          );
          setLoadingShared(false);
        });
    };
    load();
    window.addEventListener("hashchange", load);
    return () => {
      canceled = true;
      generation++;
      window.removeEventListener("hashchange", load);
    };
  }, []);

  useEffect(() => {
    if (loadingShared) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session.data));
    } catch {
      setError(
        "Could not save the game in this browser. Use Share or Download log to keep a copy.",
      );
    }
  }, [session, loadingShared]);

  function updateSession(next: ReplaySession) {
    sessionRef.current = next;
    setSession(next);
    const nextView = currentView(next);
    boardRef.current = nextView.board;
    setSelected(null);
    setMessage(nextView.message);
    setShareMessage("");
    setShareFallback("");
  }

  function commit(action: ReplayAction, actor: ReplayNode["actor"]) {
    updateSession(appendAction(sessionRef.current, action, actor));
  }

  async function performMove(
    move: Move,
    remainingPlan?: Move[],
    replayCursor?: number,
  ) {
    if (locked.current) return;
    const current = boardRef.current;
    if (
      !legalMoves(current).some(
        (candidate) =>
          candidate.card === move.card &&
          candidate.destination === move.destination,
      )
    )
      return;
    locked.current = true;
    const generation = actionGeneration.current;
    setBusy(true);
    setError("");
    setSelected(null);
    const description = describeMove(current, move);
    setMessage(description);
    const source = document.querySelector<HTMLElement>(
      `[data-card="${move.card}"]`,
    );
    const target = document.querySelector<HTMLElement>(
      move.destination < 0
        ? `[data-foundation="${Math.floor(move.card / 13)}"]`
        : `[data-card="${move.destination}"]`,
    );
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (source && target && !reducedMotion) {
      if (
        (remainingPlan !== undefined || replayCursor !== undefined) &&
        source.getClientRects().length
      ) {
        const actions = document.querySelector<HTMLElement>(".play-actions");
        const viewportBottom =
          actions && getComputedStyle(actions).position === "fixed"
            ? actions.getBoundingClientRect().top
            : innerHeight;
        const visible = (element: HTMLElement) => {
          const rectangle = element.getBoundingClientRect();
          return (
            rectangle.bottom > 0 &&
            rectangle.top < viewportBottom &&
            rectangle.right > 0 &&
            rectangle.left < innerWidth
          );
        };
        if (!visible(source) && !visible(target)) {
          source.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          if (generation !== actionGeneration.current) return;
        }
      }
      const from = source.getBoundingClientRect(),
        to = target.getBoundingClientRect();
      if (move.destination >= 0) {
        to.y +=
          to.width *
          Number(getComputedStyle(target).getPropertyValue("--fan-overlap"));
        to.height = from.height;
      }
      const scale = to.width / from.width;
      setFlight({ card: move.card, from, to });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const element = flyingCard.current;
      if (element) {
        const animation = element.animate(
          [
            { transform: "translate(0, 0) rotate(0deg)" },
            {
              transform: `translate(${(to.x - from.x) * 0.5}px, ${(to.y - from.y) * 0.5 - 24}px) rotate(-4deg)`,
              offset: 0.5,
            },
            {
              transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) rotate(0deg) scale(${scale})`,
            },
          ],
          {
            duration: 650,
            easing: "cubic-bezier(.25,.1,.25,1)",
            fill: "forwards",
          },
        );
        try {
          await animation.finished;
        } catch {
          /* The component may be leaving. */
        }
      }
    }
    if (generation !== actionGeneration.current) return;
    if (replayCursor !== undefined)
      updateSession(seekSession(sessionRef.current, replayCursor));
    else
      commit(
        { kind: "move", move },
        remainingPlan === undefined ? "player" : "computer",
      );
    const next = boardRef.current;
    plan.current = remainingPlan
      ? { key: fingerprint(next), moves: remainingPlan }
      : null;
    setFlight(null);
    setBusy(false);
    locked.current = false;
  }

  async function performRedeal(
    actor: ReplayNode["actor"] = "player",
    replayCursor?: number,
  ) {
    if (locked.current) return;
    locked.current = true;
    const generation = actionGeneration.current;
    setBusy(true);
    setShuffling(true);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      await new Promise((resolve) => setTimeout(resolve, 430));
    if (generation !== actionGeneration.current) return;
    if (replayCursor !== undefined)
      updateSession(seekSession(sessionRef.current, replayCursor));
    else {
      const next = redeal(boardRef.current);
      commit({ kind: "deal", board: next }, actor);
    }
    plan.current = null;
    setShuffling(false);
    setBusy(false);
    locked.current = false;
  }

  function nextMove() {
    if (locked.current || searching || score(boardRef.current) === 52) return;
    const current = boardRef.current;
    if (
      !legalMoves(current).length ||
      analysis.currentBest === score(current)
    ) {
      if (current.round < 3) void performRedeal("computer");
      return;
    }
    if (
      plan.current?.key === fingerprint(current) &&
      plan.current.moves.length
    ) {
      const [move, ...remaining] = plan.current.moves;
      void performMove(move, remaining);
      return;
    }
    if (analysis.solution) {
      const [move, ...remaining] = analysis.solution.moves;
      if (move) void performMove(move, remaining);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    setError("");
    const instance = worker.current;
    if (!instance) {
      setError("The engine is starting. Please try again.");
      setSearching(false);
      return;
    }
    instance.onmessage = (
      event: MessageEvent<{ id: number; solution?: Solution; error?: string }>,
    ) => {
      if (event.data.id !== requestId.current) return;
      setSearching(false);
      if (event.data.error || !event.data.solution) {
        setError(event.data.error ?? "Could not find the next move.");
        return;
      }
      const [move, ...remaining] = event.data.solution.moves;
      if (move) void performMove(move, remaining);
    };
    instance.onerror = () => {
      setSearching(false);
      setError("Search failed. You can still play manually or go back.");
    };
    instance.postMessage({ id, board: current });
  }

  function undo() {
    if (locked.current || searching || !sessionRef.current.data.cursor) return;
    requestId.current++;
    plan.current = null;
    updateSession(
      seekSession(sessionRef.current, parentCursor(sessionRef.current)),
    );
    setError("");
  }

  function restart(example: boolean) {
    if (locked.current || searching) return;
    const seed = example
      ? "20261111"
      : String(crypto.getRandomValues(new Uint32Array(1))[0]);
    const next = newGame(seed, example ? 11 : 0);
    requestId.current++;
    plan.current = null;
    updateSession(createSession(next));
    const url = new URL(location.href);
    url.hash = "";
    window.history.replaceState(null, "", url);
    setError("");
    const description = example
      ? "Winning example loaded. Try your own moves, or use Next move."
      : "New random game. All cards are visible.";
    setShowHints(false);
    setShowFoundationTargets(false);
    setMessage(description);
  }

  function seek(cursor: number) {
    if (disabled) return;
    requestId.current++;
    plan.current = null;
    updateSession(seekSession(sessionRef.current, cursor));
    setError("");
  }

  function replayNext() {
    if (disabled) return;
    const cursor = nextCursor(sessionRef.current);
    if (cursor === undefined) return;
    const action = sessionRef.current.data.nodes[cursor - 1].action;
    if (action.kind === "move")
      void performMove(action.move, undefined, cursor);
    else void performRedeal("player", cursor);
  }

  async function share() {
    if (sharing || loadingShared) return;
    const snapshot = sessionRef.current;
    setSharing(true);
    setShareMessage("");
    setShareFallback("");
    try {
      const hash = await encodeReplay(snapshot);
      const url = new URL(location.href);
      url.searchParams.set("seed", snapshot.data.initial.seed);
      url.searchParams.set("game", String(snapshot.data.initial.gameIndex));
      url.hash = hash;
      window.history.replaceState(null, "", url);
      try {
        await navigator.clipboard.writeText(url.toString());
        setShareMessage(
          `Replay link copied at move ${currentView(snapshot).step}.`,
        );
      } catch {
        setShareMessage("Copy this replay link:");
        setShareFallback(url.toString());
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not create the replay link.",
      );
    } finally {
      setSharing(false);
    }
  }

  function downloadLog() {
    const snapshot = sessionRef.current;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot.data, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `solitaire-${snapshot.data.initial.seed}-${snapshot.data.initial.gameIndex}-replay.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clickCard(card: number) {
    if (locked.current || searching || !analysis.ready) return;
    const move =
      selected === null
        ? undefined
        : legalMoves(boardRef.current).find(
            (candidate) =>
              candidate.card === selected && candidate.destination === card,
          );
    if (move) {
      void performMove(move);
      return;
    }
    setSelected(selected === card ? null : card);
    setError("");
  }

  const moves = legalMoves(board),
    won = score(board) === 52,
    stuck =
      !moves.length ||
      (analysis.ready && analysis.currentBest === score(board)),
    lost = stuck && board.round === 3 && !won;
  const selectedMoves = moves.filter((move) => move.card === selected);
  const movableCards = new Set(moves.map((move) => move.card));
  const nextFoundationCards = new Set(
    board.foundations.flatMap((rank, suit) =>
      rank < 13 ? [suit * 13 + rank] : [],
    ),
  );
  const isExample = board.seed === "20261111" && board.gameIndex === 11;
  const disabled =
    busy || searching || !analysis.ready || loadingShared || sharing;
  const nextLabel = searching
    ? "Finding best move…"
    : busy
      ? "Moving card…"
      : won
        ? "Game won"
        : lost
          ? "No further progress"
          : stuck
            ? `Shuffle for round ${board.round + 1}`
            : "Next move";

  return (
    <main className="play-page">
      <header className="header">
        <div className="game-title">
          <GameIcon name="cards" />
          <h1>Ingrid’s Solitaire</h1>
        </div>
        <div className="new-games">
          <button onClick={() => restart(true)} disabled={disabled}>
            <GameIcon name="example" />
            <span>Winning example</span>
          </button>
          <button onClick={() => restart(false)} disabled={disabled}>
            <GameIcon name="shuffle" />
            <span>New random game</span>
          </button>
          <button
            className="share-button"
            onClick={() => void share()}
            disabled={sharing || loadingShared}
          >
            <GameIcon name="share" />
            <span>{sharing ? "Preparing link…" : "Share"}</span>
          </button>
        </div>
      </header>
      {(shareMessage || shareFallback) && (
        <div className="share-result" role="status">
          <span>{shareMessage}</span>
          {shareFallback && (
            <input
              aria-label="Replay link"
              readOnly
              value={shareFallback}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
      )}
      <div className="toolbar">
        <div className="mode-switch" role="group" aria-label="Play mode">
          <button
            aria-pressed={mode === "manual"}
            onClick={() => {
              setMode("manual");
              setSelected(null);
            }}
            disabled={disabled}
          >
            Play yourself
          </button>
          <button
            aria-pressed={mode === "learning"}
            onClick={() => {
              setMode("learning");
              setSelected(null);
            }}
            disabled={disabled}
          >
            Learning
          </button>
        </div>
        <div className="step-controls">
          <div className="assist-controls">
            <button
              className="hint-button"
              aria-pressed={showHints}
              onClick={() => setShowHints(!showHints)}
              disabled={disabled}
            >
              <GameIcon name="hint" />
              <span>Hint</span>
            </button>
            {mode === "learning" && (
              <button
                className="foundation-hint-button"
                aria-pressed={showFoundationTargets}
                onClick={() => setShowFoundationTargets(!showFoundationTargets)}
                disabled={disabled}
              >
                <GameIcon name="target" />
                <span>Foundation targets</span>
              </button>
            )}
          </div>
          <div className="play-actions">
            <button
              className="back-button"
              onClick={undo}
              disabled={
                busy ||
                searching ||
                loadingShared ||
                sharing ||
                !session.data.cursor
              }
            >
              <GameIcon name="back" />
              <span>Back</span>
            </button>
            {mode === "learning" ? (
              <button
                className="primary"
                onClick={nextMove}
                disabled={disabled || won || lost}
              >
                <span>{nextLabel}</span>
                <GameIcon name={won ? "check" : "next"} />
              </button>
            ) : stuck && !won && !lost ? (
              <button
                className="primary"
                onClick={() => void performRedeal()}
                disabled={disabled}
              >
                <GameIcon name="shuffle" />
                <span>Shuffle for round {board.round + 1}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {mode === "learning" && (
        <section
          className="learning-analysis"
          aria-label="Round evaluation"
          aria-live="polite"
          data-ideal={analysis.idealBest ?? ""}
          data-current={analysis.currentBest ?? ""}
          data-loss={analysis.loss ?? ""}
          data-move-loss={analysis.moveLoss ?? ""}
        >
          <div className="round-target">
            <span>Round best</span>
            <strong>{analysis.idealBest ?? "…"}</strong>
            <span>cards</span>
            {analysis.loss !== null && analysis.loss > 0 && (
              <strong className="evaluation-loss">−{analysis.loss}</strong>
            )}
          </div>
          <div className="evaluation-detail">
            {analysis.error ? (
              analysis.error
            ) : !analysis.ready ? (
              "Analyzing…"
            ) : (
              <>
                <span>{analysis.currentBest} still reachable</span>
                {analysis.moveLoss !== null && (
                  <span
                    className={
                      analysis.moveLoss > 0 ? "move-mistake" : "move-preserved"
                    }
                  >
                    {analysis.moveLoss > 0
                      ? `Mistake · −${analysis.moveLoss} this move`
                      : "Best preserved"}
                  </span>
                )}
              </>
            )}
          </div>
          {analysis.idealBest !== null && analysis.idealBest > 0 && (
            <div
              className="potential-track"
              role="progressbar"
              aria-label="Round potential still reachable"
              aria-valuemin={0}
              aria-valuemax={analysis.idealBest}
              aria-valuenow={analysis.currentBest ?? undefined}
              aria-valuetext={
                analysis.currentBest === null
                  ? analysis.error || "Analyzing…"
                  : undefined
              }
            >
              <span
                style={{
                  width: `${analysis.currentBest === null ? 0 : Math.max(0, Math.min(100, (100 * analysis.currentBest) / analysis.idealBest))}%`,
                }}
              />
            </div>
          )}
        </section>
      )}
      <section
        ref={table}
        className={`game ${won ? "game-won" : ""}`}
        aria-label="Card table"
      >
        <div className="table-status">
          <span>
            Round <strong>{board.round} of 3</strong>
          </span>
          <span>
            <strong>{score(board)} / 52</strong> on foundations
          </span>
          <span>
            Move <strong>{step}</strong>
          </span>
          {won && (
            <span className="completion-label">
              <GameIcon name="check" />
              Complete
            </span>
          )}
        </div>
        <div className="foundations" aria-label="Foundations">
          {board.foundations.map((rank, suit) => {
            const target = selectedMoves.some(
              (move) =>
                move.destination === -1 && Math.floor(move.card / 13) === suit,
            );
            return (
              <button
                key={suit}
                data-foundation={suit}
                className={`foundation ${rank === 0 ? "empty-foundation" : ""} ${suit === 1 || suit === 2 ? "red" : ""} ${target ? "target" : ""}`}
                aria-label={`${suitNames[suit]} foundation, ${rank ? rankLabel(rank - 1) : "empty"}`}
                disabled={disabled || !target}
                onClick={() => {
                  const move = selectedMoves.find(
                    (candidate) => candidate.destination === -1,
                  );
                  if (move) void performMove(move);
                }}
              >
                {rank > 0 ? (
                  <>
                    <CardFace card={suit * 13 + rank - 1} />
                    <span className="sr-only">{rankLabel(rank - 1)}</span>
                  </>
                ) : (
                  <span className="foundation-suit">{suitSymbols[suit]}</span>
                )}
              </button>
            );
          })}
        </div>
        <div
          className={`piles ${shuffling ? "shuffling" : ""}`}
          aria-label="Piles"
        >
          {board.piles.map((pile, pileIndex) => (
            <section
              className="pile"
              key={pileIndex}
              aria-label={`Pile ${pileIndex + 1}`}
              style={
                {
                  "--stack-count": Math.max(1, pile.length),
                } as React.CSSProperties
              }
            >
              <span className="pile-number">{pileIndex + 1}</span>
              {!pile.length ? (
                <div className="empty-pile">Empty</div>
              ) : (
                pile.map((card, index) => {
                  const exposed = index === pile.length - 1,
                    suit = Math.floor(card / 13);
                  const target = selectedMoves.some(
                    (move) => move.destination === card,
                  );
                  const successor =
                    selected !== null &&
                    selected % 13 < 12 &&
                    card === selected + 1;
                  const className = `playing-card ${suit === 1 || suit === 2 ? "red" : ""} ${showHints && movableCards.has(card) ? "hinted" : ""} ${successor ? "successor" : ""} ${mode === "learning" && showFoundationTargets && nextFoundationCards.has(card) ? "next-foundation" : ""} ${selected === card ? "selected" : ""} ${target ? "target" : ""} ${exposed ? "exposed" : "covered"} ${flight?.card === card ? "in-flight" : ""}`;
                  const style = {
                    top: `calc(var(--pile-label) + ${index} * var(--fan-step))`,
                    zIndex: index,
                  };
                  return exposed ? (
                    <button
                      type="button"
                      data-card={card}
                      key={card}
                      className={className}
                      style={style}
                      aria-label={`${cardName(card)}, exposed in pile ${pileIndex + 1}`}
                      aria-pressed={selected === card}
                      disabled={disabled}
                      onClick={() => clickCard(card)}
                      onDoubleClick={() => {
                        const move = moves.find(
                          (candidate) =>
                            candidate.card === card &&
                            candidate.destination === -1,
                        );
                        if (move) void performMove(move);
                      }}
                    >
                      <CardFace card={card} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-card={card}
                      key={card}
                      className={className}
                      style={style}
                      aria-label={`${cardName(card)}, covered in pile ${pileIndex + 1}`}
                      aria-pressed={selected === card}
                      disabled={disabled}
                      onClick={() => clickCard(card)}
                    >
                      <CardFace card={card} />
                    </button>
                  );
                })
              )}
            </section>
          ))}
        </div>
        <HintArrows
          table={table}
          moves={moves}
          visible={showHints && !disabled}
        />
      </section>
      <section className="move-description" aria-live="polite">
        <strong>
          {won
            ? "All 52 cards are on the foundations."
            : lost
              ? "No further foundation progress after the third deal."
              : message}
        </strong>
        {!won && !lost && (
          <p>
            {selected === null
              ? "Select the lowest card in a pile, then its target card or foundation."
              : `${cardName(selected)} selected. ${selectedMoves.length ? "Choose a highlighted target." : "This card has no legal target."}`}
          </p>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <span>
          {isExample ? "Winning example" : "Random game"} · Game {board.seed}/
          {board.gameIndex} · Step {step}
        </span>
        <div className="footer-actions">
          <button
            className="text-button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
          >
            History
          </button>
          <button
            className="text-button"
            onClick={() => setRulesOpen(!rulesOpen)}
            aria-expanded={rulesOpen}
          >
            Rules
          </button>
        </div>
      </footer>
      {historyOpen && (
        <section className="history-panel" aria-label="Replay history">
          <div className="history-heading">
            <h2>Game history</h2>
            <div>
              <button
                disabled={disabled || !session.data.cursor}
                onClick={undo}
              >
                Previous move
              </button>
              <button
                disabled={disabled || nextCursor(session) === undefined}
                onClick={replayNext}
              >
                Replay next
              </button>
              <button onClick={downloadLog}>Download log</button>
            </div>
          </div>
          <ol>
            <li>
              <button
                aria-current={session.data.cursor === 0 ? "step" : undefined}
                onClick={() => seek(0)}
                disabled={disabled}
              >
                Initial deal · 52 cards
              </button>
            </li>
            {session.data.nodes.map((node, index) => (
              <li key={index + 1}>
                <button
                  aria-current={
                    session.data.cursor === index + 1 ? "step" : undefined
                  }
                  onClick={() => seek(index + 1)}
                  disabled={disabled}
                >
                  <span className="history-number">#{index + 1}</span>{" "}
                  {session.views[index + 1].message}
                  <span className="history-meta">
                    {node.actor === "computer" ? "Computer" : "You"}
                    {node.parent !== index ? ` · from #${node.parent}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {rulesOpen && (
        <section className="rules">
          <h2>Current rules</h2>
          <ul>
            <li>
              All cards are visible. Only the lowest, exposed card in each pile
              can move.
            </li>
            <li>
              Move one card at a time, down one rank in the same suit: for
              example 3♣ onto 4♣.
            </li>
            <li>
              Piles can grow. Sequences cannot move together. Empty piles cannot
              be filled.
            </li>
            <li>Foundations build from ace through king in each suit.</li>
            <li>
              Three deals total. Remaining cards are shuffled again; foundations
              are kept.
            </li>
            <li>
              Learning compares every move with the exact maximum for this deal.
              Round best stays fixed; a red loss shows cards that can no longer
              be reached.
            </li>
          </ul>
        </section>
      )}
      {flight && (
        <div
          ref={flyingCard}
          className={`playing-card flying ${[1, 2].includes(Math.floor(flight.card / 13)) ? "red" : ""}`}
          style={{
            left: flight.from.x,
            top: flight.from.y,
            width: flight.from.width,
            height: flight.from.height,
          }}
          aria-hidden="true"
        >
          <CardFace card={flight.card} />
        </div>
      )}
    </main>
  );
}

const StatisticsPage = lazy(() => import("./StatisticsPage"));
const TheoryPage = lazy(() => import("./TheoryPage"));
type Page = "game" | "stats" | "theory";
const requestedPage = (): Page => {
  const view = new URLSearchParams(location.search).get("view");
  return view === "stats" || view === "theory" ? view : "game";
};
function App() {
  const [page, setPage] = useState(requestedPage);
  const [visitedGame, setVisitedGame] = useState(page === "game");
  const [visitedStats, setVisitedStats] = useState(page === "stats");
  useEffect(() => {
    const update = () => {
      const next = requestedPage();
      setPage(next);
      if (next === "game") setVisitedGame(true);
      if (next === "stats") setVisitedStats(true);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = (next: Page) => {
    const url = new URL(location.href);
    if (next === "game") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
    setPage(next);
    if (next === "game") setVisitedGame(true);
    if (next === "stats") setVisitedStats(true);
    window.scrollTo({ top: 0 });
  };
  const href = (next: Page) => {
    const url = new URL(location.href);
    if (next === "game") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    return url.toString();
  };
  return (
    <>
      <nav className="site-navigation" aria-label="Main navigation">
        {(
          [
            ["game", "Play"],
            ["stats", "Statistics"],
            ["theory", "Theory"],
          ] as const
        ).map(([value, label]) => (
          <a
            key={value}
            href={href(value)}
            aria-current={page === value ? "page" : undefined}
            onClick={(event) => {
              if (
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              navigate(value);
            }}
          >
            {label}
          </a>
        ))}
      </nav>
      <div hidden={page !== "game"}>{visitedGame && <Game />}</div>
      <Suspense
        fallback={
          <main aria-busy="true">
            <p role="status">Loading page…</p>
          </main>
        }
      >
        <div hidden={page !== "stats"}>
          {visitedStats && <StatisticsPage />}
        </div>
        {page === "theory" && <TheoryPage />}
      </Suspense>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
