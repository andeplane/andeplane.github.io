import { useState } from "react";
import "./statistics.css";

export default function TheoryPage() {
  const [founded, setFounded] = useState(39);
  const remaining = 52 - founded,
    piles = Math.ceil(remaining / 3);
  return (
    <main className="statistics theory">
      <h1>La Belle Lucie: the rules, the solver and the odds</h1>
      <div className="theory-body">
        <p>
          The whole deck is visible. Each card has at most one place it can move
          in the tableau. It looks like a small search problem. The difficulty
          comes from the locks a move can create—and from the two shuffles still
          to come.
        </p>
        <p>
          <a href={`${import.meta.env.BASE_URL}?view=stats`}>
            Explore the million-game results
          </a>{" "}
          or <a href={import.meta.env.BASE_URL}>play the game</a>.
        </p>
        <section className="stats-section">
          <h2>The version being simulated</h2>
          <ul>
            <li>
              Shuffle a standard deck into 17 face-up piles of three cards and
              one pile of one. All cards remain visible.
            </li>
            <li>
              Only the exposed card in each pile can move. Move one card at a
              time.
            </li>
            <li>
              Build down by one rank in the same suit: 3♣ onto 4♣. Empty piles
              cannot be filled.
            </li>
            <li>
              Foundations build ace, two, three, and so on through king in each
              suit.
            </li>
            <li>
              When no more foundation progress is possible, shuffle the
              remaining cards and deal new piles of up to three. Foundations
              stay.
            </li>
            <li>There are three deals in total. No mercy draw is allowed.</li>
          </ul>
          <p>
            This matches the no-draw rules described by{" "}
            <a href="https://www.goodsol.com/pgshelp/la_belle_lucie.htm">
              Goodsol
            </a>{" "}
            and{" "}
            <a href="https://www.solsuite.com/games/la_belle_lucie.htm">
              SolSuite
            </a>
            . The related “Three Shuffles and a Draw” variant permits freeing
            one buried card; its odds are a different question.
          </p>
        </section>
        <section className="stats-section">
          <h2>Why an innocent move can ruin a round</h2>
          <p>
            Put 3♣ onto 4♣ and the four cannot move until the three reaches
            its foundation. The three cannot relocate to another tableau pile:
            its only possible destination is the four it is already covering.
          </p>
          <p>
            A king cannot relocate at all. A lower card buried under its own
            king is locked for the round, because that lower card must reach the
            foundation before the king can. Indirect locks are possible too: 9♦
            under J♦ stays stuck if Q♦, the jack’s only parking place, is
            itself trapped under K♦.
          </p>
          <p>
            The solver follows these dependencies, explores the remaining legal
            choices and remembers positions it has already visited. Moving an
            available card to a foundation is safe within the current round: any
            card that could build onto it has already reached that foundation.
          </p>
        </section>
        <section className="stats-section">
          <h2>What “optimal” means here</h2>
          <p>The default solver has two objectives, in this order:</p>
          <ol>
            <li>
              Maximize the number of cards on foundations by the end of the
              visible round.
            </li>
            <li>
              Among paths reaching that maximum, use the fewest total moves.
            </li>
          </ol>
          <p>
            The first search proves the maximum using an optimistic dependency
            bound and exhaustive search where needed. A second A* search finds
            the shortest path to that score. It stops when the score is reached,
            so a legal move that only uncovers a permanently blocked king is not
            recommended.
          </p>
          <p>
            This is an exact statement about the visible round. It is not a
            proof that the policy maximizes the chance of winning over three
            deals. A future-aware policy needs to compare the remaining cards
            after each possible round outcome.
          </p>
        </section>
        <section className="stats-section">
          <h2>Why fewer remaining cards need not help the next deal</h2>
          <p>
            The next deal exposes one card per pile. Crossing a multiple of
            three can remove an entire exposed slot. With 13 cards remaining
            there are five piles; with 12 there are four.
          </p>
          <div className="fan-experiment">
            <label>
              Cards already on foundations: <strong>{founded}</strong>
              <input
                aria-label="Theory foundation card count"
                type="range"
                min={0}
                max={51}
                value={founded}
                onChange={(event) => setFounded(Number(event.target.value))}
              />
            </label>
            <dl>
              <div>
                <dt>Remaining cards</dt>
                <dd>{remaining}</dd>
              </div>
              <div>
                <dt>Exposed cards after redeal</dt>
                <dd>{piles}</dd>
              </div>
              <div>
                <dt>Chance a particular remaining card is exposed</dt>
                <dd>{((100 * piles) / remaining).toFixed(2)}%</dd>
              </div>
            </dl>
          </div>
          <p>
            For m remaining cards, p = ceil(m / 3) piles and k unfinished suits,
            the expected number of immediately playable foundation cards is k ×
            p / m. Each unfinished suit has one next required card, whether it
            is an ace or a six.
          </p>
          <p>
            That explains one source of the structure in the conditional curves.
            It does not turn those curves into a causal experiment: games ending
            round one at 39 and 40 cards can also have different suit heights
            and different remaining chains.
          </p>
        </section>
        <section className="stats-section">
          <h2>Spread the suits, or complete longer chains?</h2>
          <p>
            Equal foundation totals can have different continuation values.
            There is no universal rule that the most balanced distribution is
            best.
          </p>
          <p>
            An exact reduced-deck calculation gives a useful counterexample.
            Take two suits of four ranks and compare foundation heights (1, 3)
            and (2, 2). Both have four cards founded.
          </p>
          <div className="stats-table-scroll">
            <table>
              <caption>Exact reduced-deck win probabilities</caption>
              <thead>
                <tr>
                  <th>Future deals</th>
                  <th>Heights (1, 3)</th>
                  <th>Heights (2, 2)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>One</th>
                  <td>13/24 ≈ 54.17%</td>
                  <td>1/2 = 50%</td>
                </tr>
                <tr>
                  <th>Two</th>
                  <td>203/288 ≈ 70.49%</td>
                  <td>3/4 = 75%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The preferred shape reverses. These fractions come from enumerating
            every shuffle and every legal move in that reduced game. They
            demonstrate why a balancing heuristic is not a proof; they are not
            estimates for a full deck.
          </p>
        </section>
        <section className="stats-section">
          <h2>An exact check: stuck at 50 cards</h2>
          <p>
            If an exhausted round leaves exactly two cards, they must be a queen
            trapped under its own king. With different suits they could both go
            up; with any lower missing rank, more than two cards would remain.
          </p>
          <p>
            Both cards form one pile at the next deal. Half of their possible
            orders expose the queen, letting both go up. Half expose the king
            and leave the same lock.
          </p>
          <p>
            So P(win | R1 = 50) is exactly 1 − (1/2)² = <strong>75%</strong>,
            and P(win | R2 = 50) is exactly <strong>50%</strong>. The
            million-game sample observes about 75.11% for the first condition.
            This checks the reshuffling and conditional calculations against a
            result we can derive without simulation.
          </p>
        </section>
        <section className="stats-section">
          <h2>Optimizing across future shuffles</h2>
          <p>
            After the remaining cards are shuffled, the old tableau order no
            longer matters. Only the four foundation heights remain. Suit names
            are interchangeable, so sorting those heights reduces the
            continuation table to 2,380 states.
          </p>
          <pre>{`V₀(F) = 1 if every card is founded, otherwise 0

Vᵣ(F) = average over new shuffled layouts L:
          max over reachable terminal outcomes F′:
            Vᵣ₋₁(F′)`}</pre>
          <p>
            This is the Bellman recurrence for winning probability. The native
            trainer estimates its expectations by sampling deals, then freezes
            the table before evaluation on separate random streams. It considers
            all terminal outcomes of the current deal, including outcomes with
            fewer founded cards. The current sampled-lookahead results remain
            approximate.
          </p>
        </section>
        <section className="stats-section">
          <h2>What the million simulations establish</h2>
          <p>
            The default policy won 193,472 of 1,000,000 games:{" "}
            <strong>19.3472%</strong>, with a 95% Wilson interval of
            19.2699–19.4247%. Its mean final score was 34.2497 out of 52.
          </p>
          <p>
            The interval measures sampling uncertainty for this policy and these
            rules. It does not measure possible solver bugs, rule mismatches or
            the gap to a globally optimal policy.
          </p>
          <p>
            Goodsol’s overview estimates 40% wins without a draw and 60% with
            one. Its page does not document a sample or measurement procedure.
            SolSuite estimates about one in eight for its no-draw game. Those
            estimates disagree, and our per-round result alone does not prove
            either an upper bound or a full-game optimum.{" "}
            <a href="https://www.goodsol.com/games/labellelucie.html">
              Goodsol’s overview
            </a>{" "}
            ·{" "}
            <a href="https://www.solsuite.com/games/la_belle_lucie.htm">
              SolSuite’s rules and estimate
            </a>
            .
          </p>
          <p>
            The stats page uses the actual joint score counts to answer
            questions such as P(win | R1 = 10). It does not reconstruct them
            from separate histograms, which would discard the information needed
            for conditional probabilities.
          </p>
        </section>
        <section className="stats-section">
          <h2>Run the experiment yourself</h2>
          <p>
            The native C++20 simulator supports independent parallel workers,
            fixed seeds, per-game CSV records and uncapped search. Worker
            scheduling does not change the deals.
          </p>
          <pre>{`make
./build/kabal simulate --games 1000000 --threads 8 \\
  --seed 20261111 --strategy round-optimal \\
  --records build/games.csv --output build/report.json`}</pre>
          <p>
            The tests compare the search with an independent exhaustive
            implementation on reduced decks and sampled full decks, replay
            returned paths through legality checks, validate exact small-game
            probabilities, and reconcile every exported histogram with
            individual game records.
          </p>
          <p>
            <a href={`${import.meta.env.BASE_URL}?view=stats`}>
              Open the interactive statistics
            </a>{" "}
            · <a href={import.meta.env.BASE_URL}>Play a deal</a>
          </p>
        </section>
      </div>
    </main>
  );
}
