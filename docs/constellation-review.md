# Constellation review — calmer motion and a continuing family

## Publication review, 26 October 2026

Reviewed production source at `96e399c` in uninterrupted, audio-driven browser
playback. Captured and visually inspected **124 screenshots**: every five seconds
from 0 through 150 seconds at 1280×800, 390×844, 320×740 and 844×390. The last two
profiles include simulated top, bottom and side safe areas. Inspected all frames
in labelled contact sheets, with additional full-size checks of crowded states.

The review covered the family before birth, every encounter and family arrival,
the brother's loss, all remaining deaths, the camera rotation, the complete
constellation, the closing quote, the dedication and thirty seconds after the
instrumental. No browser exceptions, label overlaps, caption clipping, horizontal
overflow or tooltips were found in those captured states. The future-flow paths
continued changing after the music ended on all four profiles.

Ten additional screenshots cover all seven caption/dedication beats, the blocked
sound prompt, and portrait → landscape → portrait during the Husband variant.
The prompt starts audible, unmuted media after a tap and disappears. Rotation
preserves playback. Eight fresh playback starts and 28 actual caption checks pass,
as do 55 focused tests and 108 opening/ending browser geometry checks.

The repeatable capture is `tests/constellation/screenshot-review.mjs`. Set
`PLAYWRIGHT_MODULE` if needed and run one or two named profiles at a time; PNGs and
per-frame state records go to `REVIEW_OUTPUT`. Inspect every generated image;
the script's geometry assertions are only part of the review. Evidence for this
review is saved outside git in the task's `constellation-release-review-2026-10-26`
artifact folder. No production-code changes were needed during this review.

## Experience

The early family uses paired households: Grandma and Grandpa travel together,
with separate nearby tracks and names, beside the Mom/Dad pair and Brother.
Before your birth, no future acquaintance or acquaintance trail is visible.
Kindergarten friend enters after birth and crosses near You at age three.
Passing encounters move at less
than half their previous sideways speed; lasting encounters take 8–9 years to
approach and seven to leave. Cubic curves replace polygonal trails. Glows remain
small in screen pixels. Label rows have consistent screen spacing, with eased
collision corrections and no frame-to-frame row selection.

Departed lights rise over two seconds and become steady, softly colored stars.
There are no landing rings, birth flashes or flashing future dots. The original
seven-star arch has grandparents across its roof, parents at the shoulders,
partner and Brother at the lower sides, and You at its base. The complete shape
stays in the foreground as the camera lowers. You remains labelled permanently;
Brother's name returns beside the star with the final dedication.

Time accelerates immediately after death, ramping from one to 4.5 years per
second over five seconds. The world reaches year 211.25 by the end of the score. Between 120 and 200,
individual lives dissolve into a collective canopy with visible roots in You
and the partner. Every branch has a parent; moving light follows those same forks.
By year 200 there are no individual future dots or life-trail renderers. The year
counter fades from 200 to 230. The bounded canopy and flowing light keep moving
indefinitely in real time, independently of the accelerating year clock.

Sister is removed from the default cast. Parents, Brother, the young household
and grandchildren have clearer track spacing. Exact older default casts migrate
without discarding customized families.

No SVG title or HTML title attributes remain to trigger tooltips. Accessible
SVG naming uses aria-label. Existing instrumental, text budget, family data,
partner randomization and the two-line dedication remain. A 44px sound prompt
appears when autoplay is blocked, then disappears after tap/click recovery.

## Checks performed

- 55 focused tests pass: relationships, chronological events, cubic continuity,
  captions, noncrossing constellation, visible memorials, the five-second speed ramp,
  year-200 counter fade, rooted ancestry, bounded continuous future motion,
  saved-family migrations, audio recovery and labels.
- Full-timeline label checks at 20 frames/second on four viewport sizes check
  overlap and bound each frame's correction to 55 CSS pixels/second.
- 258 isolated headless browser states passed actual DOM geometry checks across
  desktop, 390px and 320px portrait, short landscape and simulated safe areas.
  These include births, encounters, loss/rise, camera transition and future.
- 48 additional opening states verify that future acquaintances and their trails
  remain hidden before birth, kindergarten friend appears at three, and the
  rendered grandparents stay close without colliding with Brother.
- 60 additional future states passed checks for no tooltips/overflows/name
  overlaps, all seven memorials in bounds, You remaining labelled, a visibly
  rooted canopy, counter fade and the removal of individual trail rendering.
  This reusable check is tests/constellation/browser-review.mjs; supply an
  installed Playwright path with PLAYWRIGHT_MODULE when needed.
- Actual audio-driven playback exposed all seven caption/dedication states
  at four viewport sizes (28 checks), with visible opacity and in-bounds text.
  The blocked-autoplay prompt was visible, and tapping it started unmuted playback
  and removed the prompt.
- 12 further dedication/large-name states passed headless DOM checks.
- Eight fresh browser starts checked allowed autoplay and the sound prompt.
  This caught and fixed a development-remount race that could pause an in-flight
  play request and drop the next start attempt. The reusable audio/caption check
  is tests/constellation/playback-review.mjs.
- Headless Chromium tested allowed audible autoplay, blocked autoplay followed
  by touch release, and blocked autoplay followed by click. Media remained
  unmuted and its clock advanced. State reads used CDP userGesture=false.
- After seeking the real audio element to its end, the actual animation ran for
  another 34+ seconds: its light continued moving, the year counter disappeared,
  individual tracing stopped, and all seven links plus You remained visible.
- Production SVG source renders were visually reviewed for desktop childhood,
  college and the distant future; phone childhood, parenthood, age 100 and the
  distant future; and the constellation during short-landscape camera rotation.
- The paired-grandparents revision was visually reviewed in source SVG renders
  for the prenatal opening, desktop age three, phone age eight, narrow portrait
  age nineteen and short landscape age five. The 258-state DOM geometry check
  was rerun after the change, including both grandparent death transitions.
- Focused feature TypeScript checking passes. Full builds run in GitHub CI;
  the reviewed revision passed the full site and demo build before publication.

Publication screenshots came from isolated Chromium contexts, not a personal
browser or the desktop. Browser captures, DOM checks and source SVG renders do not prove physical-phone/Safari behavior or
speaker output. Browser policy can still block fresh-visit audible autoplay;
touch release, click or keyboard interaction retries at the current story time.
