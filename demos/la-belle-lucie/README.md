# Ingrid's solitaire engine

A rendering-independent game engine, exact visible-deal solver and native C++
Monte Carlo simulator, with a React + TypeScript web game in `web/`. Native
simulation needs no third-party runtime dependencies. All interface text, code,
variables, tests and data fields are in English.

## Play in the browser

```sh
npm --prefix web ci
npm run dev
```

Open the printed local URL. Use **Play yourself** to select a free card and then
its target. **Learning** evaluates every move against the exact maximum for the
current deal, showing the original round target and lost potential in red.
**Next move** can play one optimal move for you.
**Back** restores the previous move or shuffle. A shuffle is an explicit step;
undoing and repeating it keeps the same shuffled cards. The initial **Winning
example** is a known game for checking the rules; **New random game** is unbiased.
The game and step identifiers let you report a precise questionable move.
**History** retains every played move, including alternative lines after Back.
Use **Replay next** to follow the recorded line and **Next move** to ask the
engine for a new optimal move. **Share** copies a self-contained URL fragment
with the actual deals, complete move log, branches and current position. The
browser also saves the log locally; **Download log** exports JSON.
Hint highlights every movable card and draws its legal destination arrows.
Click a card to find its same-suit successor in blue, even if it is buried.
Card faces use standard 5:7 poker dimensions and self-hosted CC0 artwork.
On phones, Back and Next stay in a bottom action bar while the piles scroll;
the end of the page reserves room for it, including safe-area insets.
Assisted normal-motion moves reveal their source if both endpoints are offscreen.
Learning's thin evaluation bar shows how much of the original round potential is retained.
It is separate from the actual foundation count and does not represent win odds.

**Statistics** (`?view=stats`) explores one million games: cumulative and new-card
histograms, exact/range conditional cohorts after rounds one and two, conditional
win curves with Wilson intervals, transition heatmaps, first-win and stall rates,
observed comeback deals, policy comparisons and an independent-game losing-streak
calculator. Empty cohorts have no assigned probability. The complete sparse joint
score cube and CSV exports are included; every marginal is checked against it.
**Theory** (`?view=theory`) explains the rules, locks, per-round versus global
optimality, the three-card pile effect, and the exact reduced-deck counterexample.
Switching tabs preserves the game and the current statistics controls.

To reproduce the statistics bundle, collect the joint records rather than
attempting to infer conditional probabilities from marginal histograms:

```sh
mkdir -p build/analysis
./build/kabal simulate --games 1000000 --threads 8 --seed 20261111 \
  --strategy round-optimal --records build/analysis/games.csv \
  --output build/analysis/report.json
python3 tools/build_statistics.py --records build/analysis/games.csv \
  --report build/analysis/report.json \
  --reference results/round-optimal-minmoves-million.json \
  --comparison results/greedy-million.json --comparison results/random-million.json \
  --comparison results/lookahead-10k.json --output web/public/stats
```

The bundled joint counts are a rerun of the same seeded million-game experiment,
not an additional independent million. The exporter rejects duplicate or missing
indices, decreasing scores and any mismatch with the reference histograms. Raw
million-row records remain in ignored `build/`; the published joint-score CSV
retains the full joint score distribution without exposing a huge file.
For GitHub Pages subpaths, build with `BASE_PATH=/demos/la-belle-lucie/`.

The web solver runs in a worker. Tests compare it against the native simulator
on 100 complete games and replay every move through an independent checker.
The user confirmed that the interactive game matches the family's solitaire.
The reported win rate measures the chosen strategy under these confirmed rules.

## Confirmed rules

- A standard 52-card deck. All cards are visible, including covered cards.
- Foundations build from ace to king in each suit.
- Initially shuffle and deal 17 piles of three cards and one pile of one card.
- Only a pile's exposed card can move. Move one card at a time.
- Tableau moves build down by exactly one rank in the **same suit**.
- Empty piles cannot be filled. Kings therefore cannot move between piles.
- Play until no more cards can reach the foundations, then shuffle all remaining
  cards into fresh piles of up to three. Harmless relocations can be skipped.
  Keep foundations. There are **three deals total**, including the first.
- There is no extra draw, joker, free cell or permission to extract a buried card.

After a win the game stays won. Simulation results carry 52 cumulative cards
forward into later rounds, with zero additional cards in those rounds.

## Build and test

```sh
make
make test
npm --prefix web test
```

Requires a C++20 compiler, Make and Python 3. The C++ tests compare the production
solver with an independent exhaustive implementation on every permutation of
two reduced decks, plus random states and full-deck cases. Python tests cover
the CLI, distributions, reproducibility, model training and exact probabilities.

## Simulate millions of games with parallel workers

```sh
mkdir -p results models
./build/kabal simulate --games 1000000 --threads 8 --seed 20261111 \
  --strategy round-optimal --output results/round-optimal-million.json
python3 tools/export_histograms.py results/round-optimal-million.json \
  results/round-optimal-million.csv
```

`--threads` accepts 1–64 workers. Workers own separate statistics; random streams
are derived from the master seed, game index and round, never from thread
scheduling. Changing the thread count preserves the resulting games and
histograms. `--start-index` supports disjoint batches. Avoid counting overlapping
batches with the same seed twice.

Each report includes:

- A 53-bin final histogram: number of cards on foundations, from 0 through 52.
- A cumulative histogram after each round, and a separate histogram of **new**
  cards added in that round.
- Wins, win probability and a 95% Wilson confidence interval.
- First wins and cumulative wins by round, mean scores, completeness and quantiles.
- Seed, rules, strategy, thread count, elapsed time, search nodes and truncations.

The CSV contains all seven distributions, count, probability, completeness and
CDF. Optional `--records results/games.csv` exports each game's cumulative round
scores. Rows may appear out of order with multiple workers; `game_index` is the
stable identifier. Aggregate-only runs keep constant-size statistics, so millions
of games do not require millions of stored game states.

## Strategies and the meaning of optimal

| Strategy | What it does | Guarantee |
| --- | --- | --- |
| `random` | Random legal tableau moves after foundation moves | Baseline |
| `greedy` | Prefer uncovering low needed ranks | Heuristic |
| `round-optimal` | Exact maximum founded count, then minimum moves to reach it | Proven maximum and shortest plan **for that visible round**, with no node cap |
| `lookahead` | Enumerate all terminal outcomes of the visible round; choose using learned continuation values | Approximates maximum win probability over the remaining random redeals |

Historical `round-optimal-million*.json` reports used the original suit-vector
tie policy. `round-optimal-minmoves-million.json` uses the new shortest-plan tie
policy (19.3472% wins in one million games). Keep these experiment identities
distinct. There is no universal balanced-suits tie rule; the exact reduced-deck
test in `tests/test_cli.py` demonstrates that the preferred shape can reverse
with the number of deals remaining.

**A million simulations measures a fixed strategy. It does not prove that its win
rate is the theoretical optimum.** The default exact round solver is not claimed
to maximize the three-round win probability. The future-aware strategy uses
sampled Bellman values; its evaluation deals are independent from training and
its table stays frozen during evaluation. The Wilson interval describes sampling
uncertainty for that policy, not its possible distance from the optimal policy.

Training and evaluation:

```sh
./build/kabal train --threads 8 --seed 90210 --first-samples 512 \
  --second-samples 128 --output models/continuation-512-128.txt
./build/kabal simulate --games 1000000 --threads 8 --seed 20261112 \
  --strategy lookahead --model models/continuation-512-128.txt \
  --output results/lookahead-million.json
```

The table covers all 2,380 foundation states up to suit permutation, at one and
two future deals. Increase sample counts to improve value estimates, then
evaluate on fresh seeds. Full terminal-outcome enumeration is more expensive
than maximizing the current round alone. No opponent or future shuffle is
revealed to the policy.

`--max-nodes 0` is the default and means unlimited exact visible-deal search.
A positive cap can trade accuracy for speed. Every fallback is counted in
`optimality.truncatedSearches`; capped outcomes must not be reported as exact.

## Inspect a deal and its solution

```sh
./build/kabal deal --seed 1
./build/kabal solve --seed 1
./build/kabal solve --seed 1 --all-outcomes
./build/kabal solve --piles '9C,JC;QC,KC;TC' --foundations 8,13,13,13
```

Custom pile syntax lists the base/buried card **first**, exposed card **last**.
Separate cards with commas and piles with semicolons. Suits are C (clubs), D
(diamonds), H (hearts), S (spades). Supply all remaining cards exactly once.
Use `A`, `2`–`10` (or `T`), `J`, `Q`, `K`.

JSON card IDs are `suit * ranks + rank - 1`, with suit indexes C=0, D=1, H=2, S=3.
Destination `-1` means that card's foundation. Solver moves replay using the same
`applyMove` function as manual play. With `--all-outcomes`, the returned move
list shows the highest-count outcome; `outcomes` also lists alternative terminal
foundation vectors.

## Engine API

`src/engine.hpp` provides validated state construction, legal moves, applying a
move, exact search, dependency bounds, dealing, and a `Game` class. `Game`
enforces three rounds, win/loss states and redeal legality, and supports undo
across both moves and redeals. Undoing and repeating a redeal does not change its
shuffle. It has no rendering dependencies.

## Exact stochastic oracle for small decks

```sh
python3 tools/exact_model.py --suits 2 --ranks 3 --output models/exact-small.txt
./build/kabal simulate --suits 2 --ranks 3 --strategy lookahead \
  --model models/exact-small.txt --games 100000 --threads 8
```

This independent Python implementation enumerates **every shuffle and every
legal move**, using rational arithmetic. It proves the optimal three-round value
for reduced decks of at most eight cards and provides an oracle for the native
solver and future-value calculations. It is intentionally not used for 52-card
shuffle enumeration.

See [ALGORITHM.md](ALGORITHM.md) for the search, safe reductions and Bellman model.

## Inspect a shared replay

```sh
npm --prefix web run replay -- 'https://example.com/#replay=v1....'
npm --prefix web run replay -- /absolute/path/to/downloaded-replay.json
```

The log stores each actual deal in base-to-exposed pile order, each move and its
player/computer origin, and parent links for alternative lines. The current
cursor is separate from the last logged action, so sharing an earlier position
retains its subsequent history. No external replay database is needed.
