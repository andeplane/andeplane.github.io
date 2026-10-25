# Constellation review — entering lives and a fixed viewpoint

## Changes reviewed

Existing friendships and romances approach from outside the frame, share the
present, and depart without becoming dead endpoints. You are the person leaving
and returning to steady parents. First love is across from Childhood friend;
College friend becomes close as the childhood friendship recedes. Parenthood
moves to 30/32; the brother's death at your age 38 has a distinct held focus.

Opening, love and parenthood captions bring the text budget to six cards / thirty
words. The exact personal dedication remains. The camera holds its position at
your life, tilts to 30 degrees above the time plane, and watches generations move
away. Acceleration begins at year 92. Generations form pairs and branch; they
continue after the score, with ancestry retained and bounded rendering.

## Evidence and limits

- 41 focused model tests cover relationship rank and direction, encounter entry
  and departure, no-falling-behind behavior, child timing, attention, text budget,
  the fixed camera, growing generations, audio recovery and labels.
- Full-timeline label checks run at 20 frames/second on four viewport sizes.
- 60 isolated headless browser states were inspected through actual DOM geometry:
  desktop, 390px phone, 320px phone, short landscape, and simulated safe areas.
  No visible-name overlaps, horizontal overflow, caption clipping or page errors
  were found in those states. This includes orientation/viewport changes.
- Separate isolated headless audio tests confirm autoplay when allowed and an
  advancing, unmuted media element after a touch release or click when autoplay
  is blocked. Inspections use CDP with userGesture=false, so checking the state
  does not accidentally unlock audio and invalidate the test.
- Production SVG source renders were visually inspected at childhood, first love,
  college, parenthood, the brother's loss, and several future stages.
- Focused feature TypeScript checking passes. Full repository CI and the actual
  Pages deployment must pass before delivery; public bundle and MP3 are checked.

The user's screen-capture pause remains respected: no personal browser or desktop
capture was used. Headless DOM checks and source renders do not prove physical
phone/Safari behavior or actual speaker output. Fresh-visit audible autoplay can
still be blocked by browser policy; it cannot be forced by webpage code.
