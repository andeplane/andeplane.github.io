# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript, with npm scripts including `npm run dev`, selected by the user.
The existing reference engine is native C++20 with a Python test oracle.

## Users

Anders, Ingrid and her family, checking the rules of their solitaire and playing it.

## Product Purpose

Play the confirmed three-deal solitaire, inspect the computer's best next move
one card at a time, and identify any mismatch with the family's actual rules.

## Operating Context

The user confirmed that the interactive game matches the family's solitaire.
The simulation reports about 19% wins under exact per-round score maximization.
That estimates this strategy's win probability, not the theoretical optimum
across all three deals.

## Capabilities and Constraints

- All 52 cards are visible, in piles of three plus a final one-card pile initially.
- Foundations build ace through king in each suit.
- Only the exposed, visually lowest card can move, one at a time.
- Tableau moves descend exactly one rank in the same suit.
- Piles can grow beyond three cards; empty piles cannot be filled.
- Three deals total; remaining cards are reshuffled, foundations stay.
- Manual play and Learning mode, where people can play freely or use Next move.
- Learning keeps the exact ideal foundation total for the current deal visible, shows cumulative lost potential in red, and evaluates each move. Back restores the earlier evaluation; a new deal starts a new target.
- Animate moves clearly from source to destination; provide Back.
- On narrow phones and short landscape screens, keep Back and Next in a bottom action bar with reserved content space and safe-area padding. Hide it when switching away from Play.
- A learning indicator visualizes retained round potential, with an indeterminate state while calculating; it is not a win-probability meter. The board collapses empty piles after a completed game, while Back restores the prior position.
- A Hint toggle highlights every exposed card with a legal move in muted yellow and draws straight arrows to every legal destination, including foundations. Arrows update with the board and responsive layout.
- Foundation targets in Learning inverts the next required card in each unfinished suit, including buried cards. Empty foundations target the aces. Targets update after moves, undo and redeals.
- Clicking any tableau card highlights its same-suit successor in blue, including when buried; inspection does not permit moving covered cards.
- Card faces use exact 5:7 poker proportions with traditional CC0 vector artwork, not stretched symbols.
- Every move and shuffle must be inspectable, with stable game and step identifiers.
- Every actual deal order and played move is logged, with player/computer origin. Back retains alternative lines; History can replay them.
- Share is available during and after play, encoding deals, history and the current cursor in a compressed URL fragment. Logs autosave in the browser and can be downloaded as JSON.
- English interface and code. Show suit symbols, not written suit names.
- The user rejected visual-direction prose and design selection. Ship only the game, with familiar playing cards and functional controls.
- Correct rules and statistics take priority over decoration.
- Statistics and Theory are separate views alongside Play, preserving game state when switching. Statistics includes cumulative/incremental histograms, conditional cohorts and outcomes, Wilson intervals, win curves, conditional transition heatmaps, first-win and stall rates, real reproducible example deals, policy comparison, streak probabilities and downloadable joint data.
- Conditional results come from actual joint per-game round scores, with empty cohorts distinguished from observed zero success. Already-won games remain at 52; stall rates exclude them.
- The native simulator and theory/statistics views are published on andeplane.github.io. The measured statistics were shown to the user before the initial publication.
- M4 execution and many parallel simulation threads are explicitly authorized.

## Product Principles

- Show the precise move before claiming a win.
- Keep every covered card identifiable.
- Let a person undo and review the same shuffle without changing the game.
- Distinguish measured strategy performance from globally proven optimal play.
