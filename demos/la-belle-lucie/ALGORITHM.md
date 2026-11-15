# Algorithms and verification

## State and search

Each active card points to the card beneath it. Exposed cards are stored
separately. Moving a single card changes only two pile tops and one pointer.
Founded cards have a distinct marker. The 52-byte pointer array is a canonical
search key: reordering piles does not create a different search state.

Without empty-pile filling a tableau move is irreversible until the moved card
goes to a foundation: it sits on its unique successor, so it cannot relocate
again. The state graph is finite. Memoization removes repeated states reached by
different move orders.

An exposed card that can enter a foundation can safely do so immediately. Its
only possible tableau child is its own predecessor, which is already founded.
Thus removing it cannot deny another card a parking place. Foundation closure
is used in both search modes and checked against an oracle that does not apply
this reduction.

## Exact maximum for the current round

For the current-round count objective only:

- Moving a singleton cannot expose a card, so it cannot increase the optimum.
- A productive move onto a singleton is safe: its destination has nothing to
  uncover by relocating first.
- A productive move onto a card already resting on its own successor is safe:
  that destination cannot relocate before reaching its foundation anyway.

An optimistic dependency closure marks cards that might become exposed, move
aside or enter a foundation. It never withdraws exposure after covering a card.
This relaxation can overestimate achievable progress, but cannot underestimate
it. The resulting upper bound detects both direct king locks and indirect
successor locks, and supports branch-and-bound. Reaching the bound proves the
score; otherwise exhaustive search resolves the remaining branches.

These reductions are NOT applied when enumerating all terminal foundation
vectors for the multi-round objective. That enumeration includes singleton
moves and every terminal vector, even if another vector has more cards founded.

The normal round solver now uses a second exact A* pass after proving the maximum
score. That pass uses only foundation closure and an admissible lower bound on
required tableau relocations. It stops as soon as the target foundation count is
reached. Foundation moves have a fixed total at that score, so minimizing
relocations also minimizes total moves. It never appends pointless exhaustion
moves. The game may redeal once no additional foundation progress is possible,
even if harmless legal relocations remain. Full outcome enumeration retains its
complete outcome set rather than applying this shortest-plan reduction.

## Future redeals and Bellman values

Once a round is exhausted, the future depends only on the four foundation
heights, because all remaining cards are uniformly shuffled and dealt anew.
Suit permutation does not affect future probabilities. Four sorted heights in
0..13 give 2,380 distinct states.

Let `O(L)` be all terminal foundation vectors reachable from a visible layout
`L`. Values are pairs `(win probability, expected final foundation count)`,
compared lexicographically. The exact recurrence is:

```text
V_0(F) = (1 if all cards are founded else 0, number founded)
V_r(F) = E_over_uniform_deals_L_of_remaining_cards[
             max over F' in O(L) of V_(r-1)(F')
         ]
```

After observing a layout, select its outcome using `V_(deals still to come)`.
The policy sees the current layout and the frozen table, never future deal seeds.

Equal foundation totals leave the same number of cards and exposed pile tops
after a redeal. Each unfinished suit contributes exactly one next foundation
card, regardless of its current height. For `m` remaining cards, `p = ceil(m/3)`
pile tops and `k` unfinished suits, the expected number of immediately available
foundation moves is `k*p/m`. Thus spreading progress across four unfinished
suits does not itself increase that expectation. The dependency chains and
locks encountered later can still give the foundation vectors different values.
Suit-permuted vectors are exact ties.

The exact two-suit, four-rank oracle gives a concrete reversal: `(1,3)` has win
probability `13/24` versus `1/2` for `(2,2)` with one future deal, but `203/288`
versus `3/4` with two future deals. This is why continuation value, rather than a
universal preference for balanced suit heights or initial legal-move counts,
must decide future-aware choices.

The native trainer approximates the expectation with independent random deals.
First it estimates `V_1` using the exact current-round maximum. Then it estimates
`V_2`, enumerating current-deal outcomes and selecting with the frozen `V_1`
table. Its final evaluation uses separate random streams. Sampling and maximization
can bias training values; independent policy evaluation is therefore essential.

Do not assume that more founded cards always improve the NEXT random deal.
For a reduced deck with one three-card suit chain and one already-available card
from another suit, four cards create two piles; the exact one-deal win chance is
13/24. Removing that independent card leaves three cards in one pile and a win
chance of 1/6. This is a tested counterexample to componentwise dominance pruning
of future foundation states.

## Verification layers

- Legality tests cover covered cards, suit/rank matching, foundation order,
  empty piles, duplicate/missing cards and fully founded decks.
- Explicit direct and indirect king-lock tests include a similar position that
  is solvable, guarding against excessive pruning.
- An independent vector-of-piles C++ reference enumerates every legal move with
  no forced moves or bounds. Production search is compared against all 720
  permutations of two suits × three ranks and all 720 permutations of three
  suits × two ranks, plus 300 random reduced states and full decks.
- Every returned solution path is replayed through the legality checker.
- A Python rational-arithmetic oracle independently enumerates random redeals,
  validating the stochastic recurrence and exact small-deck probabilities.
- CLI tests reconcile exported individual games with all histogram bins and
  verify deterministic results across worker counts and disjoint batches.
- Game lifecycle tests exercise wins, final losses, forbidden extra redeals,
  undo, and repeatable shuffles after undo.

No rendering is involved in these checks.
