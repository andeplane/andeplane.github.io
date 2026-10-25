# Constellation review — 25 October 2026

## Current experience

The animation route contains only a sky, lifelines, stars, and people's names.
Header, narrative copy, timeline, controls, editor, captions, and loading prose
have been removed. It starts automatically, holds the ending, fades, and loops.

Remembered stars shrink and desaturate. Continuing relatives travel through the
upper frame while their trails remain visible. SVG coordinate height adapts to
the viewport without stretching circles or text.

## Checks performed

- Local browser: automatic progress after reload, natural looping, and zero
  buttons, inputs, selects, navigation, headers, footers, headings, or paragraphs
  in the animation page. Visible text consists only of people's names.
- Visual review at 1280 × 800 desktop, 390 × 844 phone, 320 × 740 narrow phone,
  and 844 × 390 short landscape. Resize/orientation changes retained playback.
  No page overflow at the measured sizes.
- Simulated safe areas: 44 px top, 34 px bottom, 24 px left/right at 320 × 740.
  Main bounds matched the viewport and the SVG adapted to its content box.
  The temporary override was removed; shipped CSS uses environment safe insets.
- Observed friendship entry, disappearing friends, muted memorial stars, younger
  generations, and continuing paths. No captured browser warnings/errors.
- Label contrast: neutral memorial labels are 5.09:1 against the brightest
  nominal nebula color, 6.67:1 against the base sky.
- Eleven model tests passed locally and on home-mini/home-m1. TypeScript, Vite
  production bundle, and HTML-shell generation passed on the home workers.
- Current screenshots were saved in `/tmp/constellation-distance-review/`.
  The project preview is an actual capture of the animation-only page.

Final repository CI and live deployment results are reported in the chat.
Physical iPhone/Safari rendering and real device safe areas remain unverified.
No song has been created or added. The removed editor and audio-picker checks
from earlier versions are not claims about the current interface.
