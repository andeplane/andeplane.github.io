# La Belle Lucie statistics release checks

## Data and solver

- Recollected the same seed-20261111, games 0..999999, round-optimal/fewest-moves
  experiment with all three cumulative scores in each record. This is not a new
  independent million-game sample.
- Reconciled every cumulative and incremental histogram and all 193,472 wins
  against `results/round-optimal-minmoves-million.json`.
- The compact bundle retains 24,708 nonempty joint score cells. Conditional
  probabilities are calculated from those actual counts.
- Publication-copy checks passed: 13,373 native assertions, 11 Python tests and
  19 TypeScript tests, including independent solver comparisons and corrupted
  data/export rejection.

## Web and integration

- Production-static preview passed the browser regression at the actual
  `/demos/la-belle-lucie/` base path: conditional score/range filters, alternative
  outcomes, empty cohort, histogram keyboard selection, transition selection,
  streak calculator, CSV/JSON downloads, theory interaction and game preservation
  across navigation.
- Direct tap coordinates were checked without a prior hover. The selected
  histogram score and cohort count were correct.
- Simulated failed data fetch and successful Retry recovery were checked.
- Reviewed statistics and theory at 1440px desktop, 390px portrait, 320px portrait
  and short 844×390 landscape. Landscape also simulated top/bottom/side safe
  areas. No document horizontal overflow was measured at the narrow sizes.
- Reviewed the existing game with the new navigation at 320px. Real physical
  phone, touch feel and assistive-technology testing were not performed.
- Homepage project detail reviewed at desktop, 390px and 320px. The new project's
  action targets measured 44px; styles are scoped to its `data-project` value.
- Homepage TypeScript build, four SEO tests and static build passed. The
  individual demo build passed with the GitHub Pages base path. Other demos were
  not rebuilt locally; the standard Pages workflow builds the complete site.
- Independent read-only finish review returned `ship` for the demo and homepage
  supplement. Screenshots are local QA artifacts and are not committed.

This records source and local acceptance. Live publication is checked separately
after the GitHub Pages deployment; a successful local build does not establish it.
