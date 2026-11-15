import { useEffect, useMemo, useState } from "react";
import {
  Histogram,
  TransitionHeatmap,
  WinCurve,
  formatCount,
  formatPercent,
} from "./StatisticsCharts";
import {
  analyze,
  distribution,
  stalled,
  streak,
  validateStatistics,
  type Cohort,
  type Entry,
  type Outcome,
  type StatisticsData,
} from "./statistics";
import "./statistics.css";

const number = (n: number | null, digits = 1) =>
  n === null ? "—" : n.toFixed(digits);
const bound = (value: string) =>
  Math.max(0, Math.min(52, Math.round(Number(value) || 0)));
const interval = (value: [number, number] | null) =>
  value
    ? `${formatPercent(value[0])}–${formatPercent(value[1])}`
    : "No observations";
type Loaded = { data: StatisticsData; entries: Entry[] };

export default function StatisticsPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(`${import.meta.env.BASE_URL}stats/analysis.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error("Could not load the simulation results.");
        return response.json();
      })
      .then((data: StatisticsData) => {
        const entries = validateStatistics(data);
        if (!controller.signal.aborted) setLoaded({ data, entries });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load the simulation results.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  if (error)
    return (
      <main className="statistics">
        <h1>Simulation statistics</h1>
        <p role="alert">{error}</p>
        <button onClick={() => setAttempt(attempt + 1)}>
          Retry loading statistics
        </button>
      </main>
    );
  if (!loaded)
    return (
      <main className="statistics" aria-busy="true">
        <h1>Simulation statistics</h1>
        <p role="status">Loading and checking the million-game results…</p>
        <div className="stats-loading" />
      </main>
    );
  return <StatisticsExplorer {...loaded} />;
}

function StatisticsExplorer({ data, entries }: Loaded) {
  const [kind, setKind] = useState<"cumulative" | "incremental">("cumulative");
  const [round, setRound] = useState<0 | 1>(0);
  const [condition, setCondition] = useState<
    "exact" | "atLeast" | "atMost" | "range"
  >("exact");
  const [score, setScore] = useState(10);
  const [upper, setUpper] = useState(20);
  const [event, setEvent] = useState<Outcome["kind"]>("win");
  const [target, setTarget] = useState(40);
  const [transition, setTransition] = useState("0-2");
  const [streakGames, setStreakGames] = useState(10);
  const [streakStrategy, setStreakStrategy] = useState("round-optimal");
  const cohort: Cohort = {
    round,
    minimum:
      condition === "atMost"
        ? 0
        : condition === "range"
          ? Math.min(score, upper)
          : score,
    maximum:
      condition === "atLeast"
        ? 52
        : condition === "range"
          ? Math.max(score, upper)
          : score,
  };
  const outcome: Outcome = { kind: event, target };
  const selected = useMemo(
    () => analyze(entries, cohort, outcome),
    [entries, round, condition, score, upper, event, target],
  );
  const baseline = useMemo(
    () => analyze(entries, undefined, outcome, round),
    [entries, event, target, round],
  );
  const all = useMemo(() => analyze(entries, undefined), [entries]);
  const winners = useMemo(
    () =>
      analyze(
        entries.filter((entry) => entry.scores[2] === 52),
        undefined,
      ),
    [entries],
  );
  const losses = useMemo(
    () =>
      analyze(
        entries.filter((entry) => entry.scores[2] !== 52),
        undefined,
      ),
    [entries],
  );
  const selectedFinal = distribution(selected.histogram[2]);
  const chooseScore = (r: 0 | 1, n: number) => {
    setRound(r);
    setScore(n);
    setCondition("exact");
  };
  const conditionLabel = `${condition === "exact" ? "= " : condition === "atLeast" ? "≥ " : condition === "atMost" ? "≤ " : "∈ "}${condition === "range" ? `[${cohort.minimum}, ${cohort.maximum}]` : score}`;
  const eventLabel =
    event === "win"
      ? "win by round 3"
      : event === "finalAtLeast"
        ? `final score ≥ ${target}`
        : `gain ≥ ${target} in round ${round + 2}`;
  const reference =
    data.strategies.find((strategy) => strategy.id === streakStrategy) ??
    data.strategies[0];
  const streakResult = streak(reference.winProbability, streakGames);
  const from = transition[0] === "0" ? 0 : 1,
    to = transition[2] === "1" ? 1 : 2;
  const sharedMax = Math.max(
    ...data.rounds.flatMap((r) =>
      r[`${kind}Histogram`].map((n) => n / data.experiment.games),
    ),
  );
  return (
    <main className="statistics">
      <header className="stats-heading">
        <div>
          <h1>La Belle Lucie: one million games</h1>
          <p>
            Three deals. All cards visible. No mercy draw. Explore what happens
            under exact round-by-round play.
          </p>
        </div>
        <a
          className="stats-download"
          href={`${import.meta.env.BASE_URL}stats/analysis.json`}
          download
        >
          Download data
        </a>
      </header>
      <nav className="stats-jumps" aria-label="Statistics sections">
        <a href="#distributions">Distributions</a>
        <a href="#conditional">Conditional odds</a>
        <a href="#transitions">Paths & comebacks</a>
        <a href="#strategies">Strategies</a>
        <a href="#streaks">Losing streaks</a>
        <a href="#method">Method & data</a>
      </nav>
      <dl className="stats-summary" aria-label="Experiment overview">
        <div>
          <dt>Win probability</dt>
          <dd>
            {formatPercent(all.probability)}
            <small>95% CI {interval(all.interval)}</small>
          </dd>
        </div>
        <div>
          <dt>Mean final score</dt>
          <dd>
            {number(distribution(all.histogram[2]).mean)} / 52
            <small>Median {distribution(all.histogram[2]).median} cards</small>
          </dd>
        </div>
        <div>
          <dt>Games observed</dt>
          <dd>
            {formatCount(data.experiment.games)}
            <small>Seed {data.experiment.seed}</small>
          </dd>
        </div>
      </dl>

      <section className="stats-section" id="distributions">
        <div className="stats-section-heading">
          <div>
            <h2>How many cards reach the foundations?</h2>
            <p>
              Each chart covers the same {formatCount(data.experiment.games)}{" "}
              games. All three use the same vertical scale.
            </p>
          </div>
          <label>
            Count
            <select
              aria-label="Histogram count type"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="cumulative">Total on foundations</option>
              <option value="incremental">New cards this round</option>
            </select>
          </label>
        </div>
        <div className="round-histograms">
          {data.rounds.map((r, i) => (
            <Histogram
              key={r.round}
              title={`Round ${r.round} · ${kind === "cumulative" ? "total" : "new cards"}`}
              histogram={r[`${kind}Histogram`]}
              maximum={sharedMax}
              selected={round === i ? score : undefined}
              onPick={
                kind === "cumulative" && i < 2
                  ? (n) => chooseScore(i as 0 | 1, n)
                  : undefined
              }
            />
          ))}
        </div>
        <p className="stats-note">
          Hover or use arrow keys to inspect a bar. Click a round 1 or 2 total
          to select a cohort below. Games already won stay at 52 total and add
          zero new cards.
        </p>
        <p className="stats-note">
          Why no 51-card finishes? With 51 cards founded, the last card is
          exposed and can immediately go up. An exhausted round therefore
          finishes at 50 or fewer, or at 52.
        </p>
        <div className="stats-table-scroll">
          <table>
            <caption>Round-by-round progress</caption>
            <thead>
              <tr>
                <th>After round</th>
                <th>Mean total</th>
                <th>Median</th>
                <th>10th–90th percentile</th>
                <th>Mean new cards</th>
                <th>Won so far</th>
              </tr>
            </thead>
            <tbody>
              {data.rounds.map((r) => {
                const d = distribution(r.cumulativeHistogram);
                return (
                  <tr key={r.round}>
                    <th>{r.round}</th>
                    <td>{number(d.mean, 2)}</td>
                    <td>{d.median}</td>
                    <td>
                      {d.p10}–{d.p90}
                    </td>
                    <td>{number(r.meanNewCards, 2)}</td>
                    <td>
                      {formatPercent(r.cumulativeWins / data.experiment.games)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-section" id="conditional">
        <h2>What does your first round tell you?</h2>
        <p>
          Condition on an end-of-round score, then ask about winning, a final
          target, or the next round’s gain.
        </p>
        <div className="conditional-controls">
          <label>
            After round
            <select
              aria-label="Condition round"
              value={round}
              onChange={(e) => setRound(Number(e.target.value) as 0 | 1)}
            >
              <option value={0}>Round 1</option>
              <option value={1}>Round 2</option>
            </select>
          </label>
          <label>
            Foundation cards
            <select
              aria-label="Condition type"
              value={condition}
              onChange={(e) => setCondition(e.target.value as typeof condition)}
            >
              <option value="exact">Exactly</option>
              <option value="atLeast">At least</option>
              <option value="atMost">At most</option>
              <option value="range">Between</option>
            </select>
          </label>
          <label>
            Cards
            <input
              aria-label="Condition score"
              type="number"
              min={0}
              max={52}
              value={score}
              onChange={(e) => setScore(bound(e.target.value))}
            />
          </label>
          {condition === "range" && (
            <label>
              And
              <input
                aria-label="Condition upper score"
                type="number"
                min={0}
                max={52}
                value={upper}
                onChange={(e) => setUpper(bound(e.target.value))}
              />
            </label>
          )}
          <label>
            Outcome
            <select
              aria-label="Conditional outcome"
              value={event}
              onChange={(e) => setEvent(e.target.value as typeof event)}
            >
              <option value="win">Win by round 3</option>
              <option value="finalAtLeast">Finish with at least…</option>
              <option value="gainAtLeast">Add next round at least…</option>
            </select>
          </label>
          {event !== "win" && (
            <label>
              Target cards
              <input
                aria-label="Outcome target"
                type="number"
                min={0}
                max={52}
                value={target}
                onChange={(e) => setTarget(bound(e.target.value))}
              />
            </label>
          )}
        </div>
        <div className="stats-presets" aria-label="Score presets">
          {[0, 5, 10, 20, 30, 40, 50, 52].map((n) => (
            <button
              key={n}
              aria-pressed={condition === "exact" && score === n}
              onClick={() => chooseScore(round, n)}
            >
              {n} cards
            </button>
          ))}
        </div>
        <div className="conditional-layout">
          <div
            className="conditional-result"
            aria-live="polite"
            data-testid="conditional-result"
            data-games={selected.games}
            data-successes={selected.successes}
          >
            <p className="probability-expression">
              P({eventLabel} | R{round + 1} {conditionLabel})
            </p>
            <strong className="conditional-probability">
              {formatPercent(selected.probability)}
            </strong>
            {selected.games ? (
              <>
                <p>
                  {formatCount(selected.successes)} qualifying outcomes in{" "}
                  {formatCount(selected.games)} matching games.
                </p>
                <p>
                  95% Wilson interval:{" "}
                  <strong>{interval(selected.interval)}</strong>
                </p>
                <p>
                  Unconditional: {formatPercent(baseline.probability)}
                  {selected.probability !== null &&
                  baseline.probability !== null
                    ? ` · ${(100 * (selected.probability - baseline.probability)).toFixed(2)} percentage points`
                    : ""}
                </p>
                <dl className="conditional-details">
                  <div>
                    <dt>Mean final score</dt>
                    <dd>{number(selectedFinal.mean)} / 52</dd>
                  </div>
                  <div>
                    <dt>Median final score</dt>
                    <dd>{selectedFinal.median}</dd>
                  </div>
                  <div>
                    <dt>Middle 50%</dt>
                    <dd>
                      {selectedFinal.p25}–{selectedFinal.p75} cards
                    </dd>
                  </div>
                </dl>
                {selected.games < 200 && (
                  <p className="stats-caution">
                    Small cohort: the uncertainty is large. An observed 0% or
                    100% is not a certainty.
                  </p>
                )}
              </>
            ) : (
              <p>
                {cohort.minimum === 51 && cohort.maximum === 51
                  ? "An exhausted round cannot end at 51: the last card can always go up, making 52. This condition has no observations and no defined conditional probability."
                  : "No games matched this score. This is missing evidence, not a 0% chance. Try a range or another score."}
              </p>
            )}
          </div>
          <Histogram
            title="Final scores in the selected cohort"
            histogram={selected.histogram[2]}
          />
        </div>
        <WinCurve
          entries={entries}
          selectedRound={round}
          selected={score}
          onPick={chooseScore}
        />
        <p className="stats-note">
          These curves compare different games. They do not show the causal
          effect of placing one additional card. Equal totals can hide different
          suit heights and locks.
        </p>
      </section>

      <section className="stats-section" id="transitions">
        <div className="stats-section-heading">
          <div>
            <h2>Every path through three rounds</h2>
            <p>
              A strong start helps, but it does not guarantee a win. A weak
              start does not end the game.
            </p>
          </div>
          <label>
            Compare
            <select
              aria-label="Heatmap rounds"
              value={transition}
              onChange={(e) => setTransition(e.target.value)}
            >
              <option value="0-2">Round 1 → final</option>
              <option value="0-1">Round 1 → round 2</option>
              <option value="1-2">Round 2 → final</option>
            </select>
          </label>
        </div>
        <div className="transitions-layout">
          <TransitionHeatmap
            entries={entries}
            from={from}
            to={to}
            onPick={(n) => chooseScore(from, n)}
          />
          <div className="winning-paths">
            <h3>Which round delivered the win?</h3>
            <table>
              <caption className="sr-only">First wins by round</caption>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>First wins</th>
                  <th>Chance if still playing</th>
                </tr>
              </thead>
              <tbody>
                {data.rounds.map((r, i) => (
                  <tr key={r.round}>
                    <th>{r.round}</th>
                    <td>
                      {formatCount(r.firstWins)}
                      <small>
                        {formatPercent(r.firstWins / data.experiment.games)} of
                        all games
                      </small>
                    </td>
                    <td>
                      {formatPercent(
                        r.firstWins /
                          (data.experiment.games -
                            (i ? data.rounds[i - 1].cumulativeWins : 0)),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Rounds with no progress</h3>
            {([1, 2] as const).map((r) => {
              const s = stalled(entries, r);
              return (
                <p key={r}>
                  <strong>
                    Round {r + 1}: {formatPercent(s.probability)}
                  </strong>
                  <br />
                  {formatCount(s.noProgress)} of {formatCount(s.continuing)}{" "}
                  continuing games added no cards.
                </p>
              );
            })}
            <p className="stats-note">
              Already-won games are excluded from the stall rates and from later
              “still playing” denominators.
            </p>
          </div>
        </div>
        <h3>Winners and losses started differently</h3>
        <div className="stats-table-scroll">
          <table>
            <caption className="sr-only">Mean scores by final outcome</caption>
            <thead>
              <tr>
                <th>Final result</th>
                <th>Games</th>
                <th>Mean round 1</th>
                <th>Mean round 2</th>
                <th>Mean final</th>
              </tr>
            </thead>
            <tbody>
              {[
                { title: "Eventually won", value: winners },
                { title: "Did not win", value: losses },
              ].map(({ title, value }) => (
                <tr key={title}>
                  <th>{title}</th>
                  <td>{formatCount(value.games)}</td>
                  {value.histogram.map((h, i) => (
                    <td key={i}>{number(distribution(h).mean, 2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Try the actual deals</h3>
        <p>
          These are examples observed in the sample, not invented layouts. Each
          link opens the initial deal in a new tab; Next move reproduces the
          measured strategy.
        </p>
        <div className="example-list">
          {data.examples.map((example) => (
            <article key={example.id}>
              <div>
                <h4>{example.title}</h4>
                <p>
                  {example.scores.join(" → ")} cards · Game {example.gameIndex}
                </p>
              </div>
              <a
                href={`${import.meta.env.BASE_URL}?seed=${data.experiment.seed}&game=${example.gameIndex}`}
                target="_blank"
                rel="noopener"
              >
                Play this deal
                <span className="sr-only">
                  : {example.title}, opens in a new tab
                </span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-section" id="strategies">
        <h2>The strategy changes the odds</h2>
        <p>
          Each row is a separate experiment. Sampled lookahead has only 10,000
          evaluation games and a learned continuation table; its uncertainty is
          wider.
        </p>
        <div className="stats-table-scroll">
          <table className="strategy-table">
            <caption>Measured policies · no mercy draw</caption>
            <thead>
              <tr>
                <th>Policy</th>
                <th>Win rate</th>
                <th>95% interval</th>
                <th>Mean final</th>
                <th>Games</th>
              </tr>
            </thead>
            <tbody>
              {data.strategies.map((strategy) => (
                <tr key={strategy.id}>
                  <th>
                    <span>{strategy.label}</span>
                    <div className="strategy-track">
                      <span
                        style={{ width: `${strategy.winProbability * 100}%` }}
                      />
                    </div>
                  </th>
                  <td>{formatPercent(strategy.winProbability)}</td>
                  <td>{interval(strategy.winProbability95CI)}</td>
                  <td>{number(strategy.meanFinalCards, 2)}</td>
                  <td>{formatCount(strategy.games)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="stats-note">
          “Round optimal” proves the maximum for each visible round, then uses
          the fewest moves. It does not prove the best chance over three future
          shuffles. Historical greedy/random samples use their original fixed
          policies.
        </p>
      </section>

      <section className="stats-section" id="streaks">
        <h2>How unlucky is never winning?</h2>
        <p>
          Even a winning strategy can lose repeatedly. This calculator assumes
          independent games played with the selected computer policy.
        </p>
        <div className="streak-controls">
          <label>
            Strategy
            <select
              aria-label="Losing streak strategy"
              value={streakStrategy}
              onChange={(e) => setStreakStrategy(e.target.value)}
            >
              {data.strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Games played
            <input
              aria-label="Losing streak game count"
              type="number"
              min={1}
              max={10000}
              value={streakGames}
              onChange={(e) =>
                setStreakGames(
                  Math.max(
                    1,
                    Math.min(10000, Math.round(Number(e.target.value) || 1)),
                  ),
                )
              }
            />
          </label>
        </div>
        <div className="stats-presets">
          {[5, 10, 20, 50, 100].map((n) => (
            <button
              key={n}
              aria-pressed={streakGames === n}
              onClick={() => setStreakGames(n)}
            >
              {n} games
            </button>
          ))}
        </div>
        <dl className="streak-results" aria-live="polite">
          <div>
            <dt>No wins in {streakGames} games</dt>
            <dd>
              {formatPercent(
                streakResult.none,
                streakResult.none > 0 && streakResult.none < 0.0001 ? 6 : 2,
              )}
            </dd>
          </div>
          <div>
            <dt>At least one win</dt>
            <dd>{formatPercent(streakResult.atLeastOne)}</dd>
          </div>
          <div>
            <dt>Mean waiting time</dt>
            <dd>{number(streakResult.expectedWait)} games</dd>
          </div>
        </dl>
        <p className="stats-note">
          The waiting time includes the winning game. Human play may have a
          different win probability. Tiny displayed percentages are rounded, not
          proven impossible.
        </p>
      </section>

      <section className="stats-section" id="method">
        <h2>Method, definitions & downloads</h2>
        <div className="method-layout">
          <div>
            <h3>What is being counted?</h3>
            <p>
              <strong>R1, R2, R3</strong> are the cumulative numbers on
              foundations at the end of each round under this policy. “New
              cards” is R1, R2 − R1, or R3 − R2. These are achievable
              end-of-round totals, not the number immediately playable in a
              fresh deal.
            </p>
            <p>
              A win means all 52 cards reached the foundations by the end of the
              third deal. Won games stay at 52 in subsequent rounds.
            </p>
            <h3>How are conditional odds calculated?</h3>
            <p>
              For R1 = N, count matching games, then divide matching wins by
              that count. All filters and heatmaps use actual joint (R1, R2, R3)
              counts. Marginal histograms alone cannot answer this question.
            </p>
            <p>
              Intervals use the 95% Wilson binomial method. They describe
              sampling uncertainty for this fixed policy, not uncertainty about
              the theoretical optimum. Empty cohorts are not assigned a
              probability.
            </p>
            <h3>Can I reproduce this?</h3>
            <p>
              The same seeded million-game sample was rerun to collect all three
              scores together. Every cumulative and incremental histogram, plus
              the win count, was checked against the earlier experiment. It is
              one million games, not two million independent observations.
            </p>
            <p>
              The shuffle uses rejection-sampled Fisher–Yates with independent
              game/round streams. Search sees only the current layout. Changing
              worker count does not change the sample.
            </p>
          </div>
          <div className="stats-provenance">
            <h3>Experiment record</h3>
            <dl>
              <dt>Sample</dt>
              <dd>{data.experiment.id}</dd>
              <dt>Games / seed / first index</dt>
              <dd>
                {formatCount(data.experiment.games)} / {data.experiment.seed} /{" "}
                {data.experiment.startIndex}
              </dd>
              <dt>Source revision</dt>
              <dd>
                <code>{data.experiment.sourceRevision}</code>
              </dd>
              <dt>Raw records SHA-256</dt>
              <dd>
                <code>{data.experiment.recordsSha256}</code>
              </dd>
              <dt>Engine SHA-256</dt>
              <dd>
                <code>{data.experiment.engineSha256}</code>
              </dd>
            </dl>
            <ul className="stats-downloads">
              <li>
                <a
                  href={`${import.meta.env.BASE_URL}stats/analysis.json`}
                  download
                >
                  Complete analysis data (JSON)
                </a>
              </li>
              <li>
                <a
                  href={`${import.meta.env.BASE_URL}stats/joint-scores.csv`}
                  download
                >
                  Joint score counts (CSV)
                </a>
              </li>
              <li>
                <a
                  href={`${import.meta.env.BASE_URL}stats/round-histograms.csv`}
                  download
                >
                  Round histograms (CSV)
                </a>
              </li>
            </ul>
            <a href={`${import.meta.env.BASE_URL}?view=theory`}>
              Read the rules and solver theory
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
