# Constellation review — calmer motion and a continuing family

## Experience

The early family is centered across the canvas. Passing encounters move at less
than half their previous sideways speed; lasting encounters take 8–9 years to
approach and seven to leave. Cubic curves replace polygonal trails. Glows remain
small in screen pixels. Label rows have consistent screen spacing, with eased
collision corrections and no frame-to-frame row selection.

Departed lights rise over five seconds and become steady, softly colored stars.
There are no landing rings, birth flashes or flashing future dots. The original
seven-star arch has grandparents across its roof, parents at the shoulders,
partner and Brother at the lower sides, and You at its base. The complete shape
stays in the foreground as the camera lowers. You remains labelled permanently;
Brother's name returns beside the star with the final dedication.

Time accelerates at year 100, after the two-minute score. Between 120 and 200,
individual lives dissolve into a collective canopy with visible roots in You
and the partner. Every branch has a parent; moving light follows those same forks.
By year 200 there are no individual future dots or life-trail renderers. The year
counter fades from 200 to 230. The bounded canopy and flowing light keep moving
indefinitely in real time, independently of the accelerating year clock.

No SVG title or HTML title attributes remain to trigger tooltips. Accessible
SVG naming uses aria-label. Existing instrumental, text budget, family data,
partner randomization and the two-line dedication remain.

## Checks performed

- 52 focused tests pass: relationships, chronological events, cubic continuity,
  captions, noncrossing constellation, visible memorials, year-100 acceleration,
  year-200 counter fade, rooted ancestry, bounded continuous future motion,
  saved-family migrations, audio recovery and labels.
- Full-timeline label checks at 20 frames/second on four viewport sizes check
  overlap and bound each frame's correction to 55 CSS pixels/second.
- 258 isolated headless browser states passed actual DOM geometry checks across
  desktop, 390px and 320px portrait, short landscape and simulated safe areas.
  These include births, encounters, loss/rise, camera transition and future.
- 60 additional future states passed checks for no tooltips/overflows/name
  overlaps, all seven memorials in bounds, You remaining labelled, a visibly
  rooted canopy, counter fade and the removal of individual trail rendering.
  This reusable check is tests/constellation/browser-review.mjs; supply an
  installed Playwright path with PLAYWRIGHT_MODULE when needed.
- 12 further dedication/large-name states passed headless DOM checks.
- Headless Chromium tested allowed audible autoplay, blocked autoplay followed
  by touch release, and blocked autoplay followed by click. Media remained
  unmuted and its clock advanced. State reads used CDP userGesture=false.
- After seeking the real audio element to its end, the actual animation ran for
  another 34+ seconds: its light continued moving, the year counter disappeared,
  individual tracing stopped, and all seven links plus You remained visible.
- Production SVG source renders were visually reviewed for desktop childhood,
  college and the distant future; phone childhood, parenthood, age 100 and the
  distant future; and the constellation during short-landscape camera rotation.
- Focused feature TypeScript checking passes. Full builds run in GitHub CI;
  deployment and public asset checks follow before delivery.

No personal-browser or desktop screenshots were captured. Isolated headless DOM
checks and source SVG renders do not prove physical-phone/Safari behavior or
speaker output. Browser policy can still block fresh-visit audible autoplay;
touch release, click or keyboard interaction retries at the current story time.
